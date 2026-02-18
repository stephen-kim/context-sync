#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
RELEASE_GATE_TIMEOUT_SEC="${RELEASE_GATE_TIMEOUT_SEC:-180}"
RELEASE_GATE_WORK_DIR="${RELEASE_GATE_WORK_DIR:-$(pwd)/.release-gate}"
RELEASE_GATE_COMPOSE_FILE="${RELEASE_GATE_COMPOSE_FILE:-docker-compose.dev.yml}"
RELEASE_GATE_COMPOSE_PROFILE="${RELEASE_GATE_COMPOSE_PROFILE:-localdb}"
STATE_FILE="${RELEASE_GATE_WORK_DIR}/state.env"

mkdir -p "${RELEASE_GATE_WORK_DIR}"
touch "${STATE_FILE}"
chmod 600 "${STATE_FILE}" || true

HTTP_STATUS=""
HTTP_BODY_FILE=""
HTTP_HEADERS_FILE=""

log_info() {
  printf '[INFO] %s\n' "$*" >&2
}

log_warn() {
  printf '[WARN] %s\n' "$*" >&2
}

log_fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

dc() {
  docker compose -f "${RELEASE_GATE_COMPOSE_FILE}" --profile "${RELEASE_GATE_COMPOSE_PROFILE}" "$@"
}

mask_secret() {
  local value="${1:-}"
  local len="${#value}"
  if [[ "${len}" -le 8 ]]; then
    printf '***'
    return 0
  fi
  local head="${value:0:3}"
  local tail="${value: -3}"
  printf '%s***%s' "${head}" "${tail}"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr -d '\n'
    return 0
  fi
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
}

retry() {
  local max_attempts="${1:-30}"
  local sleep_sec="${2:-2}"
  shift 2
  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "${sleep_sec}"
  done
}

wait_for_healthz() {
  local deadline="${RELEASE_GATE_TIMEOUT_SEC}"
  local attempts=$((deadline / 2))
  if (( attempts < 5 )); then
    attempts=5
  fi
  log_info "Waiting for healthz at ${BASE_URL}/healthz"
  retry "${attempts}" 2 curl -fsS "${BASE_URL}/healthz" >/dev/null || {
    log_fail "healthz did not become ready within ${RELEASE_GATE_TIMEOUT_SEC}s (${BASE_URL}/healthz)"
  }
}

json_eval() {
  local file="${1}"
  local expr="${2}"
  node - "${file}" "${expr}" <<'NODE'
const fs = require('node:fs');
const [file, expr] = process.argv.slice(2);
let d = {};
try {
  const raw = fs.readFileSync(file, 'utf8');
  d = raw ? JSON.parse(raw) : {};
} catch {
  d = {};
}
let result;
try {
  result = Function('d', `return (${expr});`)(d);
} catch (error) {
  console.error(String(error && error.message ? error.message : error));
  process.exit(2);
}
if (typeof result === 'boolean') {
  process.exit(result ? 0 : 1);
}
if (result === undefined || result === null) {
  process.stdout.write('');
  process.exit(0);
}
if (typeof result === 'object') {
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}
process.stdout.write(String(result));
NODE
}

assert_status() {
  local expected="${1}"
  local context="${2:-HTTP status assertion failed}"
  if [[ "${HTTP_STATUS}" != "${expected}" ]]; then
    log_warn "${context}: expected=${expected}, actual=${HTTP_STATUS}"
    if [[ -f "${HTTP_BODY_FILE}" ]]; then
      log_warn "Response body: $(cat "${HTTP_BODY_FILE}")"
    fi
    log_fail "${context}"
  fi
}

assert_status_any() {
  local context="${1:-HTTP status assertion failed}"
  shift || true
  local expected
  for expected in "$@"; do
    if [[ "${HTTP_STATUS}" == "${expected}" ]]; then
      return 0
    fi
  done
  log_warn "${context}: expected one of=[$*], actual=${HTTP_STATUS}"
  if [[ -f "${HTTP_BODY_FILE}" ]]; then
    log_warn "Response body: $(cat "${HTTP_BODY_FILE}")"
  fi
  log_fail "${context}"
}

assert_json_expr() {
  local expr="${1}"
  local context="${2:-JSON assertion failed}"
  if ! json_eval "${HTTP_BODY_FILE}" "${expr}" >/dev/null; then
    log_warn "${context} (expr: ${expr})"
    if [[ -f "${HTTP_BODY_FILE}" ]]; then
      log_warn "Response body: $(cat "${HTTP_BODY_FILE}")"
    fi
    log_fail "${context}"
  fi
}

assert_json_contains() {
  local needle="${1}"
  local context="${2:-JSON does not contain expected value}"
  if ! grep -q --fixed-strings -- "${needle}" "${HTTP_BODY_FILE}"; then
    log_warn "${context}: missing '${needle}'"
    if [[ -f "${HTTP_BODY_FILE}" ]]; then
      log_warn "Response body: $(cat "${HTTP_BODY_FILE}")"
    fi
    log_fail "${context}"
  fi
}

http_call() {
  local method="${1}"
  local path="${2}"
  local body="${3:-}"
  local token="${4:-}"

  HTTP_BODY_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/http-body.XXXXXX")"
  HTTP_HEADERS_FILE="$(mktemp "${RELEASE_GATE_WORK_DIR}/http-headers.XXXXXX")"

  local -a curl_args
  curl_args=(
    -sS
    -X "${method}"
    -D "${HTTP_HEADERS_FILE}"
    -o "${HTTP_BODY_FILE}"
    -w '%{http_code}'
    "${BASE_URL}${path}"
  )

  if [[ -n "${token}" ]]; then
    curl_args+=(-H "authorization: Bearer ${token}")
  fi

  if [[ -n "${body}" ]]; then
    curl_args+=(
      -H 'content-type: application/json'
      --data "${body}"
    )
  fi

  HTTP_STATUS="$(curl "${curl_args[@]}")" || {
    log_fail "HTTP request failed: ${method} ${path}"
  }
}

state_set() {
  local key="${1}"
  local value="${2}"
  local escaped
  escaped="$(printf '%q' "${value}")"
  if grep -q "^${key}=" "${STATE_FILE}"; then
    sed -i.bak "s#^${key}=.*#${key}=${escaped}#g" "${STATE_FILE}"
    rm -f "${STATE_FILE}.bak"
  else
    printf '%s=%s\n' "${key}" "${escaped}" >> "${STATE_FILE}"
  fi
}

state_load() {
  # shellcheck disable=SC1090
  source "${STATE_FILE}"
}

state_require() {
  local key="${1}"
  local value="${!key:-}"
  if [[ -z "${value}" ]]; then
    log_fail "Missing required state: ${key} (expected in ${STATE_FILE})"
  fi
}

login_with_password() {
  local email="${1}"
  local password="${2}"
  http_call "POST" "/v1/auth/login" "{\"email\":\"${email}\",\"password\":\"${password}\"}" ""
  assert_status "200" "Login failed for ${email}"
  json_eval "${HTTP_BODY_FILE}" "d.token"
}

create_workspace() {
  local token="${1}"
  local workspace_key="${2}"
  local workspace_name="${3}"
  http_call "POST" "/v1/workspaces" "{\"key\":\"${workspace_key}\",\"name\":\"${workspace_name}\"}" "${token}"
  assert_status "201" "Workspace create failed (${workspace_key})"
}

create_project() {
  local token="${1}"
  local workspace_key="${2}"
  local project_key="${3}"
  local project_name="${4}"
  http_call "POST" "/v1/projects" "{\"workspace_key\":\"${workspace_key}\",\"key\":\"${project_key}\",\"name\":\"${project_name}\"}" "${token}"
  assert_status "201" "Project create failed (${workspace_key}/${project_key})"
}

create_memory() {
  local token="${1}"
  local workspace_key="${2}"
  local project_key="${3}"
  local type="${4}"
  local content="${5}"
  local metadata="${6:-}"
  local body
  if [[ -n "${metadata}" ]]; then
    body="{\"workspace_key\":\"${workspace_key}\",\"project_key\":\"${project_key}\",\"type\":\"${type}\",\"content\":\"${content}\",\"metadata\":${metadata}}"
  else
    body="{\"workspace_key\":\"${workspace_key}\",\"project_key\":\"${project_key}\",\"type\":\"${type}\",\"content\":\"${content}\"}"
  fi
  http_call "POST" "/v1/memories" "${body}" "${token}"
  assert_status "201" "Memory create failed (${workspace_key}/${project_key})"
}
