#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

log_info "QC bootstrap: verify initial admin bootstrap and setup gating"
wait_for_healthz

log_info "Inspecting memory-core logs for bootstrap output"
bootstrap_logs="$(dc logs --no-color memory-core 2>&1 || true)"

if ! printf '%s\n' "${bootstrap_logs}" | grep -q "Bootstrap admin created: admin@example.com"; then
  log_fail "Missing bootstrap admin creation log. Run with RELEASE_GATE_RESET_DB=true for deterministic bootstrap check."
fi

initial_password="$(printf '%s\n' "${bootstrap_logs}" | sed -n 's/.*Initial password (shown once): //p' | head -n1)"
if [[ -z "${initial_password}" ]]; then
  log_fail "Bootstrap password line not found in memory-core logs."
fi

log_info "Captured bootstrap password (masked): $(mask_secret "${initial_password}")"

log_info "Restarting memory-core to verify one-time bootstrap password behavior"
dc restart memory-core >/dev/null
wait_for_healthz

post_restart_logs="$(dc logs --no-color memory-core 2>&1 || true)"
password_line_count="$(printf '%s\n' "${post_restart_logs}" | grep -c "Initial password (shown once):" || true)"
if [[ "${password_line_count}" -ne 1 ]]; then
  log_fail "Bootstrap password log count expected=1 actual=${password_line_count}"
fi

admin_token="$(login_with_password "admin@example.com" "${initial_password}")"
log_info "Logged in with bootstrap admin account"

http_call "GET" "/v1/auth/me" "" "${admin_token}"
assert_status "200" "GET /v1/auth/me failed"
assert_json_expr "d.user && d.user.must_change_password === true" "must_change_password should be true before setup"

http_call "GET" "/v1/workspaces" "" "${admin_token}"
assert_status "403" "Protected API should be blocked before setup completion"
assert_json_expr "d.error && d.error.code === 'setup_required'" "Expected setup_required before setup completion"

new_admin_email="admin.release.$(date +%s)@example.com"
new_admin_password="$(random_secret)"
new_admin_name="Release Gate Admin"

complete_setup_body="$(printf '{"new_email":"%s","new_password":"%s","name":"%s"}' "${new_admin_email}" "${new_admin_password}" "${new_admin_name}")"
http_call "POST" "/v1/auth/complete-setup" "${complete_setup_body}" "${admin_token}"
assert_status "200" "POST /v1/auth/complete-setup failed"

new_admin_token="$(login_with_password "${new_admin_email}" "${new_admin_password}")"
log_info "Logged in after complete-setup with new admin credentials"

http_call "GET" "/v1/auth/me" "" "${new_admin_token}"
assert_status "200" "GET /v1/auth/me failed after complete-setup"
assert_json_expr "d.user && d.user.must_change_password === false" "must_change_password should be false after setup"
assert_json_expr "d.user && d.user.email === '${new_admin_email}'" "Admin email should be updated after setup"

http_call "GET" "/v1/workspaces" "" "${new_admin_token}"
assert_status "200" "Protected API should be available after setup completion"

state_set "ADMIN_EMAIL" "${new_admin_email}"
state_set "ADMIN_PASSWORD" "${new_admin_password}"
state_set "ADMIN_NAME" "${new_admin_name}"

log_info "Bootstrap QC passed"
