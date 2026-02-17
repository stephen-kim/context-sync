# Group Mapping

Claustrum은 IdP 그룹을 `group_id` 기준으로 워크스페이스/프로젝트 권한에 매핑합니다.

## 매핑 필드

- `provider_id`
- `claim_name` (예: `groups`)
- `group_id` (stable ID)
- `group_display_name` (UI 표시용)
- `target_type`: `workspace` | `project`
- `target_key`: workspace key 또는 project key
- `role`
- `priority`
- `enabled`

## 권한 대상

워크스페이스:

- `OWNER`
- `ADMIN`
- `MEMBER`

프로젝트:

- `OWNER`
- `MAINTAINER`
- `WRITER`
- `READER`

## sync_mode

`workspace_settings.oidc_sync_mode`:

- `add_only` (기본): 매핑된 권한 추가/갱신, 기존 권한 유지
- `add_and_remove`: 매핑에 없는 권한 제거(Owner 보호 적용)

Owner 보호:

- 기존 `OWNER` 권한은 자동으로 강등/삭제하지 않습니다.

## 예시

1. 워크스페이스 관리자 매핑

- `group_id = 00gk9abc123xyz`
- `target_type = workspace`
- `target_key = personal`
- `role = ADMIN`

2. 프로젝트 작성자 매핑

- `group_id = 00gk9devs123xyz`
- `target_type = project`
- `target_key = github:org/repo#apps/admin-ui`
- `role = WRITER`
