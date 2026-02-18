# 인증과 권한 모델

Claustrum은 API key를 사용자 식별자에 매핑한 뒤, 워크스페이스/프로젝트 역할 기반으로 접근을 제어합니다.

## 역할 모델

### Workspace roles
- `owner`
- `admin`
- `member`

### Project roles
- `owner`
- `maintainer`
- `writer`
- `reader`

운영 편의를 위해 workspace `owner/admin`은 같은 workspace 내부의 프로젝트 권한을 override할 수 있습니다.

## 권한 매핑

| 작업 | 최소 역할 |
| --- | --- |
| 워크스페이스 멤버 조회 | workspace `member` |
| 워크스페이스 멤버 관리 | workspace `admin` |
| 프로젝트 생성/조회 | workspace `member` |
| 프로젝트 멤버 조회 | project `reader` |
| 프로젝트 멤버 관리 | project `maintainer` |
| memory 생성 | project `writer` |
| memory 조회 | project `reader` |
| decision confirm/reject | project `maintainer` |
| raw search / raw view | `raw_access_min_role` 기준 (기본 `writer`) |

## Raw 접근 정책

- `/v1/raw/search`, `/v1/raw/messages/:id` 최소 권한은 `workspace_settings.raw_access_min_role`로 제어합니다.
- 기본값은 `WRITER`입니다.
- 모든 raw 조회는 audit 로그(`raw.search`, `raw.view`)를 남깁니다.

## 감사 로그

중요 변경은 항상 `audit_logs`에 기록됩니다:
- `memory.create`
- `memory.update`
- `memory.delete`
- `decision.confirm`
- `decision.reject`
- 멤버/API key 관리 액션

`/v1/audit-logs` 필터:
- `workspace_key` (필수)
- `project_key`
- `action_key` (정확 일치)
- `action_prefix`
- `actor_user_id`
- `limit`
