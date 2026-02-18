# Onboarding

Claustrum 온보딩은 팀 단위 도입을 빠르게 진행하도록 설계되었습니다.

## End-to-end 흐름

1. Admin이 Workspace Members에서 멤버를 초대합니다.
2. 생성된 초대 링크를 공유합니다.
3. 멤버가 링크를 열어 비밀번호를 설정합니다.
4. 멤버가 로그인합니다.
5. Welcome Setup에서 다음을 진행합니다.
   - API key 생성(필수)
   - Git auto-capture 설치(선택, 권장)

## Invite API 흐름

- `POST /v1/workspaces/:key/invite` (workspace admin 이상)
  - 입력: `email`, `role`, 선택 `project_roles`
  - 응답: `invite_url`, `expires_at`
- `GET /v1/invite/:token`
  - 토큰 검증 및 초대 정보 반환
- `POST /v1/invite/:token/accept`
  - 사용자 생성/비밀번호 설정
  - workspace role 및 project role 반영
  - 토큰 사용 처리

## Welcome Setup

첫 로그인 후 활성 API key가 없는 사용자는 Welcome Setup으로 이동합니다.

Step 1:
- API key 생성(1회 노출)

Step 2 (선택):
- Git auto-capture 설치 커맨드 복사
- 설치 완료 표시(audit 기록)

## Audit 이벤트

- `invite.created`
- `invite.accepted`
- `api_key.created`
- `api_key.revoked`
- `git_capture.installed`

## 온보딩 시 권한 구조

- Workspace role: `OWNER`, `ADMIN`, `MEMBER`
- Project role: `OWNER`, `MAINTAINER`, `WRITER`, `READER`
- Invite 시 workspace role + 선택 project role 맵(`project_roles`)을 함께 지정할 수 있습니다.

## 보안 주의사항

- 초대 토큰은 DB에 해시로만 저장됩니다.
- 토큰은 1회성 + 24시간 만료입니다.
- API key는 해시로만 저장됩니다.
- Admin은 기존 API key 원문을 조회할 수 없습니다.
