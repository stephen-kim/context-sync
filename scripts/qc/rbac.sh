#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

log_info "QC RBAC: verify reader/writer/maintainer permissions"
wait_for_healthz
state_load
state_require "ADMIN_EMAIL"
state_require "ADMIN_PASSWORD"

admin_token="$(login_with_password "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}")"
suffix="$(date +%s)"
workspace_key="rg-rbac-${suffix}"
project_key="rbac-project"

create_workspace "${admin_token}" "${workspace_key}" "Release Gate RBAC ${suffix}"
create_project "${admin_token}" "${workspace_key}" "${project_key}" "RBAC Project"

reader_email="reader.${suffix}@example.com"
writer_email="writer.${suffix}@example.com"
maintainer_email="maintainer.${suffix}@example.com"

reader_password="$(random_secret)"
writer_password="$(random_secret)"
maintainer_password="$(random_secret)"

create_and_accept_invite() {
  local email="${1}"
  local password="${2}"
  local body
  body="$(printf '{"email":"%s","role":"MEMBER"}' "${email}")"
  http_call "POST" "/v1/workspaces/${workspace_key}/invite" "${body}" "${admin_token}"
  assert_status "201" "Invite creation failed (${email})"
  local invite_url
  invite_url="$(json_eval "${HTTP_BODY_FILE}" "d.invite_url")"
  if [[ -z "${invite_url}" ]]; then
    log_fail "Missing invite URL for ${email}"
  fi
  local token
  token="${invite_url##*/}"
  local accept_body
  accept_body="$(printf '{"password":"%s","name":"%s"}' "${password}" "${email%%@*}")"
  http_call "POST" "/v1/invite/${token}/accept" "${accept_body}" ""
  assert_status "200" "Invite accept failed (${email})"
}

create_and_accept_invite "${reader_email}" "${reader_password}"
create_and_accept_invite "${writer_email}" "${writer_password}"
create_and_accept_invite "${maintainer_email}" "${maintainer_password}"

http_call "GET" "/v1/workspaces/${workspace_key}/members" "" "${admin_token}"
assert_status "200" "Failed to list workspace members for RBAC setup"

reader_user_id="$(json_eval "${HTTP_BODY_FILE}" "((d.members||[]).find((m)=>m.user&&m.user.email==='${reader_email}')||{}).user?.id || ''")"
writer_user_id="$(json_eval "${HTTP_BODY_FILE}" "((d.members||[]).find((m)=>m.user&&m.user.email==='${writer_email}')||{}).user?.id || ''")"
maintainer_user_id="$(json_eval "${HTTP_BODY_FILE}" "((d.members||[]).find((m)=>m.user&&m.user.email==='${maintainer_email}')||{}).user?.id || ''")"

if [[ -z "${reader_user_id}" || -z "${writer_user_id}" || -z "${maintainer_user_id}" ]]; then
  log_fail "Failed to resolve user IDs for invited RBAC users"
fi

http_call "POST" "/v1/projects/${project_key}/members" "{\"workspace_key\":\"${workspace_key}\",\"email\":\"${reader_email}\",\"role\":\"READER\"}" "${admin_token}"
assert_status "201" "Failed to add READER project member"
http_call "POST" "/v1/projects/${project_key}/members" "{\"workspace_key\":\"${workspace_key}\",\"email\":\"${writer_email}\",\"role\":\"WRITER\"}" "${admin_token}"
assert_status "201" "Failed to add WRITER project member"
http_call "POST" "/v1/projects/${project_key}/members" "{\"workspace_key\":\"${workspace_key}\",\"email\":\"${maintainer_email}\",\"role\":\"MAINTAINER\"}" "${admin_token}"
assert_status "201" "Failed to add MAINTAINER project member"

issue_workspace_key() {
  local user_id="${1}"
  local label="${2}"
  local device_label
  device_label="${label}-device"
  http_call "POST" "/v1/workspaces/${workspace_key}/api-keys" "$(printf '{"user_id":"%s","label":"%s","device_label":"%s"}' "${user_id}" "${label}" "${device_label}")" "${admin_token}"
  assert_status "201" "Failed to issue workspace API key (${label})"
  local one_time_url
  one_time_url="$(json_eval "${HTTP_BODY_FILE}" "d.one_time_url || ''")"
  if [[ -z "${one_time_url}" ]]; then
    log_fail "Workspace API key one_time_url was not returned (${label})"
  fi

  local one_time_path
  one_time_path="${one_time_url#${BASE_URL}}"
  if [[ "${one_time_path}" == "${one_time_url}" ]]; then
    one_time_path="${one_time_url#*://*/}"
    one_time_path="/${one_time_path#*/}"
  fi

  http_call "GET" "${one_time_path}" "" ""
  assert_status "200" "Failed to view one-time workspace API key (${label})"
  local plain
  plain="$(json_eval "${HTTP_BODY_FILE}" "d.api_key || ''")"
  if [[ -z "${plain}" ]]; then
    log_fail "Workspace API key was not returned (${label})"
  fi
  printf '%s' "${plain}"
}

reader_key="$(issue_workspace_key "${reader_user_id}" "release-gate-reader")"
writer_key="$(issue_workspace_key "${writer_user_id}" "release-gate-writer")"
maintainer_key="$(issue_workspace_key "${maintainer_user_id}" "release-gate-maintainer")"

marker="release-gate-rbac-${suffix}"
reader_write_body="$(printf '{"workspace_key":"%s","project_key":"%s","type":"note","content":"reader-should-fail-%s"}' "${workspace_key}" "${project_key}" "${marker}")"
http_call "POST" "/v1/memories" "${reader_write_body}" "${reader_key}"
assert_status "403" "Reader should not be able to write memory"

writer_write_body="$(printf '{"workspace_key":"%s","project_key":"%s","type":"note","content":"writer-can-write-%s"}' "${workspace_key}" "${project_key}" "${marker}")"
http_call "POST" "/v1/memories" "${writer_write_body}" "${writer_key}"
assert_status "201" "Writer should be able to write memory"

decision_body="$(printf '{"workspace_key":"%s","project_key":"%s","type":"decision","content":"Summary: RBAC decision %s\\nWhy:\\n- validate roles\\nAlternatives:\\n- none\\nImpact:\\n- test\\nEvidence:\\n- release-gate"}' "${workspace_key}" "${project_key}" "${marker}")"
http_call "POST" "/v1/memories" "${decision_body}" "${admin_token}"
assert_status "201" "Failed to create draft decision for RBAC test"
decision_id="$(json_eval "${HTTP_BODY_FILE}" "d.id || ''")"
if [[ -z "${decision_id}" ]]; then
  log_fail "Decision ID missing after draft decision creation"
fi

http_call "POST" "/v1/decisions/${decision_id}/confirm" "{\"workspace_key\":\"${workspace_key}\"}" "${writer_key}"
assert_status "403" "Writer should not be able to confirm decisions"

http_call "POST" "/v1/decisions/${decision_id}/confirm" "{\"workspace_key\":\"${workspace_key}\"}" "${maintainer_key}"
assert_status "200" "Maintainer should be able to confirm decisions"

http_call "GET" "/v1/audit/export?workspace_key=${workspace_key}&format=json" "" "${writer_key}"
assert_status "403" "Writer should not be able to export audit logs"

http_call "GET" "/v1/audit/export?workspace_key=${workspace_key}&format=json" "" "${admin_token}"
assert_status "200" "Admin should be able to export audit logs"

state_set "RBAC_WORKSPACE_KEY" "${workspace_key}"
state_set "RBAC_PROJECT_KEY" "${project_key}"
state_set "RBAC_READER_KEY" "${reader_key}"
state_set "RBAC_WRITER_KEY" "${writer_key}"
state_set "RBAC_MAINTAINER_KEY" "${maintainer_key}"

log_info "RBAC QC passed"
