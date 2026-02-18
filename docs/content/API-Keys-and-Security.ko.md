# API Keys and Security

Claustrum은 팀 온보딩/서비스 인증을 위해 사용자 단위 API 키를 사용합니다.

## 보안 모델

- API key 원문은 DB에 저장하지 않습니다.
- `api_keys.key_hash`만 저장합니다(HMAC-SHA256 + 서버 시크릿).
- Admin은 기존 키 원문을 조회할 수 없습니다.
- 사용자는 자신의 키를 직접 발급합니다.
- Admin은 revoke/reset만 수행할 수 있습니다.
- reset 시 1회용 링크(one-time view, 기본 15분 TTL)를 제공합니다.

## API 흐름

### 1) 사용자 자가 발급

- `POST /v1/api-keys`
- body: `{ "label": "my-laptop" }` (label 선택)
- 응답에 원문 키가 1회만 포함됩니다:
  - `{ "id": "...", "label": "...", "api_key": "clst_..." }`

### 2) 키 목록 조회(메타데이터만)

- `GET /v1/api-keys` (본인)
- `GET /v1/users/:userId/api-keys` (admin/본인)
- 키 원문은 절대 반환하지 않습니다.

### 3) 키 폐기

- `POST /v1/api-keys/:id/revoke`
- 키 소유자 또는 admin만 가능

### 4) Admin 강제 reset + 1회용 링크

- `POST /v1/users/:userId/api-keys/reset`
- 대상 사용자의 활성 키를 모두 revoke
- 새 키 생성
- 원문은 직접 반환하지 않음
- 응답:
  - `{ "one_time_url": "...", "expires_at": "..." }`

### 5) One-time view 엔드포인트

- `GET /v1/api-keys/one-time/:token`
- 1회만 유효
- TTL 만료 후 무효
- 재사용/만료 토큰은 `410 Gone`

## Audit 이벤트

민감 액션은 다음 `action_key`로 기록됩니다.

- `api_key.created`
- `api_key.revoked`
- `api_key.reset`
- `api_key.one_time_view`

## 운영 권장사항

- 강한 시크릿 설정:
  - `MEMORY_CORE_API_KEY_HASH_SECRET`
  - `MEMORY_CORE_ONE_TIME_TOKEN_SECRET`
- one-time TTL은 짧게 유지 (`MEMORY_CORE_ONE_TIME_TOKEN_TTL_SECONDS`, 기본 900초).
- one-time URL 공유 시 HTTPS 사용 권장.
- 유출 의심 시 즉시 revoke/reset 수행.
