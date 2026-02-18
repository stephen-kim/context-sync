#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

log_info "QC webhooks: signature validation and idempotency"
wait_for_healthz

invalid_payload='{"installation":{"id":987654321},"action":"release-gate-invalid-signature"}'
HTTP_BODY_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/webhook-invalid-body.XXXXXX")"
HTTP_HEADERS_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/webhook-invalid-headers.XXXXXX")"
HTTP_STATUS="$(
  curl -sS \
    -X POST \
    -D "${HTTP_HEADERS_FILE}" \
    -o "${HTTP_BODY_FILE}" \
    -w '%{http_code}' \
    -H 'content-type: application/json' \
    -H 'x-github-event: installation_repositories' \
    -H 'x-github-delivery: release-gate-invalid-signature' \
    -H 'x-hub-signature-256: sha256=deadbeef' \
    --data "${invalid_payload}" \
    "${BASE_URL}/v1/webhooks/github"
)"
assert_status "401" "Webhook invalid signature should return 401"

webhook_secret="${GITHUB_APP_WEBHOOK_SECRET:-}"
if [[ -z "${webhook_secret}" ]]; then
  log_fail "GITHUB_APP_WEBHOOK_SECRET is required for idempotency webhook test."
fi

delivery_id="release-gate-dup-$(date +%s)"
valid_payload='{"installation":{"id":123456789},"action":"release-gate-idempotency"}'
signature_hex="$(printf '%s' "${valid_payload}" | openssl dgst -sha256 -hmac "${webhook_secret}" | awk '{print $2}')"
signature_header="sha256=${signature_hex}"

call_webhook_with_signature() {
  local delivery="${1}"
  HTTP_BODY_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/webhook-valid-body.XXXXXX")"
  HTTP_HEADERS_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/webhook-valid-headers.XXXXXX")"
  HTTP_STATUS="$(
    curl -sS \
      -X POST \
      -D "${HTTP_HEADERS_FILE}" \
      -o "${HTTP_BODY_FILE}" \
      -w '%{http_code}' \
      -H 'content-type: application/json' \
      -H 'x-github-event: installation_repositories' \
      -H "x-github-delivery: ${delivery}" \
      -H "x-hub-signature-256: ${signature_header}" \
      --data "${valid_payload}" \
      "${BASE_URL}/v1/webhooks/github"
  )"
}

call_webhook_with_signature "${delivery_id}"
assert_status "200" "Webhook first delivery should be accepted"
assert_json_expr "d.ok === true && d.duplicate === false" "First webhook delivery should not be duplicate"

call_webhook_with_signature "${delivery_id}"
assert_status "200" "Webhook duplicate delivery should be accepted idempotently"
assert_json_expr "d.ok === true && d.duplicate === true" "Second webhook delivery should be marked duplicate"

log_info "Webhooks QC passed"
