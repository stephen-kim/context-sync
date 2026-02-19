#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

log_info "QC secrets: log/db leakage scan and one-time token reuse"
wait_for_healthz
state_load
state_require "ADMIN_EMAIL"
state_require "ADMIN_PASSWORD"

admin_token="$(login_with_password "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}")"

logs="$(dc logs --no-color memory-core 2>&1 || true)"
bootstrap_password_count="$(printf '%s\n' "${logs}" | grep -c "Initial password (shown once):" || true)"
if [[ "${bootstrap_password_count}" -gt 1 ]]; then
  log_fail "Bootstrap password appeared more than once in logs (count=${bootstrap_password_count})"
fi

logs_without_bootstrap="$(printf '%s\n' "${logs}" | grep -v "Initial password (shown once):" || true)"
if printf '%s\n' "${logs_without_bootstrap}" | grep -Eiq "BEGIN PRIVATE KEY|GITHUB_APP_PRIVATE_KEY"; then
  log_fail "Detected private key material in memory-core logs."
fi

if printf '%s\n' "${logs_without_bootstrap}" | grep -Eiq "\bapi_key\b"; then
  log_fail "Detected raw api_key token pattern in memory-core logs."
fi

if printf '%s\n' "${logs_without_bootstrap}" | grep -Eiq "\bpassword\b"; then
  log_fail "Detected unexpected password pattern in memory-core logs (excluding bootstrap line)."
fi

postgres_user="${POSTGRES_USER:-claustrum}"
postgres_db="${POSTGRES_DB:-claustrum}"
postgres_password="${POSTGRES_PASSWORD:-claustrum}"

db_columns="$(
  dc exec -T postgres \
    env PGPASSWORD="${postgres_password}" \
    psql -U "${postgres_user}" -d "${postgres_db}" -Atc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='api_keys';" 2>/dev/null || true
)"

if [[ -z "${db_columns}" ]]; then
  log_warn "Could not read api_keys schema from local postgres container; skipping schema column check."
else
  if ! printf '%s\n' "${db_columns}" | grep -q "^key_hash$"; then
    log_fail "api_keys.key_hash column is missing."
  fi
  if printf '%s\n' "${db_columns}" | grep -q "^key$"; then
    legacy_key_non_null="$(
      dc exec -T postgres \
        env PGPASSWORD="${postgres_password}" \
        psql -U "${postgres_user}" -d "${postgres_db}" -Atc \
        "SELECT COUNT(*) FROM api_keys WHERE key IS NOT NULL AND length(trim(key)) > 0;" 2>/dev/null || true
    )"
    if [[ "${legacy_key_non_null:-0}" != "0" ]]; then
      log_fail "api_keys.key contains non-null plaintext values (count=${legacy_key_non_null})."
    fi
  fi
fi

http_call "GET" "/v1/auth/me" "" "${admin_token}"
assert_status "200" "Failed to read auth/me before one-time token test"
admin_user_id="$(json_eval "${HTTP_BODY_FILE}" "d.user && d.user.id ? d.user.id : ''")"
if [[ -z "${admin_user_id}" ]]; then
  log_fail "Unable to read admin user ID from /v1/auth/me"
fi

reset_device_label="release-gate-reset-$(date +%s)"
http_call "POST" "/v1/users/${admin_user_id}/api-keys/reset" "{\"device_label\":\"${reset_device_label}\"}" "${admin_token}"
assert_status "200" "Failed to create one-time API key view token"
one_time_url="$(json_eval "${HTTP_BODY_FILE}" "d.one_time_url || ''")"
if [[ -z "${one_time_url}" ]]; then
  log_fail "Missing one_time_url in reset response"
fi
log_info "Received one-time URL (masked): $(mask_secret "${one_time_url}")"

one_time_path="${one_time_url#${BASE_URL}}"
if [[ "${one_time_path}" == "${one_time_url}" ]]; then
  one_time_path="${one_time_url#*://*/}"
  one_time_path="/${one_time_path#*/}"
fi

http_call "GET" "${one_time_path}" "" ""
assert_status "200" "First one-time API key view should succeed"
assert_json_expr "typeof d.api_key === 'string' && d.api_key.length > 10" "One-time API key payload should include api_key"

http_call "GET" "${one_time_path}" "" ""
assert_status "410" "Second one-time API key view should return 410 Gone"

log_info "Secrets QC passed"
