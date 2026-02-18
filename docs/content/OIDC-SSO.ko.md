# OIDC SSO

Claustrum은 워크스페이스 단위 OIDC 로그인과 그룹 기반 권한 동기화를 지원합니다.

## 식별 키

- 사용자 식별은 `(issuer + subject)` 조합을 사용합니다.
- 이메일은 프로필 정보이며 식별 키가 아닙니다.
- 식별 레코드는 `user_identities`에 저장됩니다.

## Admin UI 설정

경로:

- Workspace -> **SSO Settings (OIDC)**

주요 필드:

- `issuer_url`
- `client_id`
- `client_secret`
- `claim_groups_name` (기본 `groups`)
- `claim_groups_format` (`id` 권장)
- `scopes` (기본 `openid profile email`)
- `enabled`

## 로그인 플로우

- `GET /v1/auth/oidc/:workspace_key/start`
- `GET /v1/auth/oidc/:workspace_key/callback`

흐름:

1. start에서 PKCE + state 토큰 생성
2. IdP 로그인
3. callback에서 code 교환
4. `id_token` 서명 검증(JWKS)
5. `issuer+sub` 기반 identity upsert
6. group mapping 적용(workspace/project 멤버십)
7. 세션 토큰 발급

## claim_groups_format

- `id`: 안정적인 그룹 ID 기반(권장)
- `name`: 그룹 이름 기반. IdP에서 이름 변경 시 매핑이 깨질 수 있음

## 보안 참고

- 이메일을 식별 키로 사용하지 않습니다.
- 가능하면 `claim_groups_format=id`를 사용합니다.
- 클라이언트 시크릿은 주기적으로 교체하세요.
