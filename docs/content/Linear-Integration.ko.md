# Linear 연동


## 목적

MCP 워크플로에서 Linear를 외부 이슈 컨텍스트 소스로 사용합니다.
- 관련 이슈 검색
- 이슈 상세를 짧게 읽어 컨텍스트 확보
- 기본 recall은 memory-first 유지


## 준비물

- Linear API 키
  - Linear 설정에서 Personal API key 생성
- 선택: 커스텀 API URL (기본값: `https://api.linear.app/graphql`)
- memory-core `workspace_key` (예: `personal`)


## 환경변수 (fallback)

- `MEMORY_CORE_LINEAR_API_KEY`
- `MEMORY_CORE_LINEAR_API_URL`


## 단계별 설정

1. Linear API 키 발급
- 팀 운영 안정성을 위해 서비스 계정/관리 계정 키 사용을 권장합니다.
- 발급 키는 시크릿 매니저에 보관하세요.

2. Admin UI에서 저장
- `admin-ui` -> Integrations -> Linear로 이동
- 저장 값:
  - `enabled=true`
  - `api_key`
  - `api_url` (선택)
- 선택:
  - `write_on_commit`
  - `write_on_merge`
  - 현재는 provider write가 아니라 hook/audit 경로 제어 용도입니다.

3. API로 저장(선택)

```bash
curl -X PUT "$MEMORY_CORE_URL/v1/integrations" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_key": "personal",
    "provider": "linear",
    "enabled": true,
    "reason": "linear 이슈 컨텍스트 연동",
    "config": {
      "api_key": "lin_api_xxx",
      "api_url": "https://api.linear.app/graphql"
    }
  }'
```

4. API 검증

```bash
curl -G "$MEMORY_CORE_URL/v1/linear/search" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "q=incident runbook" \
  --data-urlencode "limit=5"
```

```bash
curl -G "$MEMORY_CORE_URL/v1/linear/read" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "issue_key=ENG-123" \
  --data-urlencode "max_chars=2000"
```

5. MCP 도구 검증
- `linear_search({ q, limit? })`
- `linear_read({ issue_key, max_chars? })`


## API 엔드포인트

- `GET /v1/linear/search?workspace_key=<ws>&q=<query>&limit=10`
- `GET /v1/linear/read?workspace_key=<ws>&issue_key=<ENG-123>&max_chars=4000`


## 권한 및 감사 로그

- Linear 검색/열람은 workspace member 권한 필요
- 모든 호출은 `audit_logs`에 기록:
  - `linear.search`
  - `linear.read`


## env vs Admin UI 우선순위

- 기본: Admin UI 워크스페이스 설정이 env fallback보다 우선합니다.
- 잠금 옵션:
  - `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS=linear`
  - 잠금 시 Admin UI 수정은 거부되고 env-only 모드가 강제됩니다.


## 트러블슈팅

- `Integration not configured` 류 오류
  - 워크스페이스 `api_key` 저장 여부와 `enabled=true` 확인
- search는 되는데 read 실패
  - issue key 유효성 및 API 키 접근 권한 확인
