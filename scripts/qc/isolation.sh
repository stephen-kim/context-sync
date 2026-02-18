#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

log_info "QC isolation: verify workspace/project data isolation"
wait_for_healthz
state_load
state_require "ADMIN_EMAIL"
state_require "ADMIN_PASSWORD"

admin_token="$(login_with_password "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}")"

suffix="$(date +%s)"
workspace_a="rg-a-${suffix}"
workspace_b="rg-b-${suffix}"
project_a="isolation-a"
project_b="isolation-b"
marker="release-gate-isolation-${suffix}"

create_workspace "${admin_token}" "${workspace_a}" "Release Gate A ${suffix}"
create_workspace "${admin_token}" "${workspace_b}" "Release Gate B ${suffix}"
create_project "${admin_token}" "${workspace_a}" "${project_a}" "Isolation Project A"
create_project "${admin_token}" "${workspace_b}" "${project_b}" "Isolation Project B"

create_memory "${admin_token}" "${workspace_a}" "${project_a}" "note" "${marker}"

http_call "GET" "/v1/memories?workspace_key=${workspace_a}&project_key=${project_a}&type=note&q=${marker}&limit=10" "" "${admin_token}"
assert_status "200" "Workspace A memory query failed"
assert_json_expr \
  "Array.isArray(d.memories) && d.memories.some((m)=>String(m.content||'').includes('${marker}'))" \
  "Workspace A should contain its own marker memory"

http_call "GET" "/v1/memories?workspace_key=${workspace_b}&project_key=${project_b}&type=note&q=${marker}&limit=10" "" "${admin_token}"
assert_status "200" "Workspace B memory query failed"
assert_json_expr \
  "Array.isArray(d.memories) && !d.memories.some((m)=>String(m.content||'').includes('${marker}'))" \
  "Workspace B should not see workspace A marker memory"

raw_event_body="$(printf '{"workspace_key":"%s","project_key":"%s","event_type":"post_commit","branch":"main","commit_sha":"%s","commit_message":"%s","changed_files":["apps/memory-core/src/service/index.ts"]}' "${workspace_a}" "${project_a}" "${suffix}" "${marker}")"
http_call "POST" "/v1/raw-events" "${raw_event_body}" "${admin_token}"
assert_status_any "Raw event create failed in workspace A" "200" "201"

http_call "GET" "/v1/raw/search?workspace_key=${workspace_a}&project_key=${project_a}&q=${marker}&limit=10&max_chars=200" "" "${admin_token}"
assert_status "200" "Raw search in workspace A failed"
assert_json_expr "Array.isArray(d.matches)" "Raw search response in workspace A should contain matches array"

http_call "GET" "/v1/raw/search?workspace_key=${workspace_b}&project_key=${project_b}&q=${marker}&limit=10&max_chars=200" "" "${admin_token}"
assert_status "200" "Raw search in workspace B failed"
assert_json_expr "Array.isArray(d.matches) && d.matches.length === 0" "Workspace B raw search should not return workspace A events"

http_call "GET" "/v1/audit/access-timeline?workspace_key=${workspace_a}&limit=50" "" "${admin_token}"
assert_status "200" "Audit access timeline query failed for workspace A"
assert_json_expr "Array.isArray(d.items)" "Access timeline should return items array"

state_set "WORKSPACE_A_KEY" "${workspace_a}"
state_set "WORKSPACE_B_KEY" "${workspace_b}"
state_set "WORKSPACE_A_PROJECT" "${project_a}"
state_set "WORKSPACE_B_PROJECT" "${project_b}"

log_info "Isolation QC passed"
