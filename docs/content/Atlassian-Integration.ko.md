# Atlassian 연동 (Jira + Confluence)


## 목적

Jira와 Confluence를 MCP 워크플로의 외부 컨텍스트 소스로 사용합니다.
- Jira: 이슈 컨텍스트 검색/열람
- Confluence: 문서 컨텍스트 검색/열람
- 둘 다 read 중심 + audit 추적


## 준비물

- Atlassian Cloud 사이트 URL (예: `https://your-org.atlassian.net`)
- Atlassian 계정 이메일
- Atlassian API 토큰
  - Atlassian 계정 보안 페이지에서 생성
- memory-core `workspace_key` (예: `personal`)


## 환경변수 (fallback)

- Jira
  - `MEMORY_CORE_JIRA_BASE_URL`
  - `MEMORY_CORE_JIRA_EMAIL`
  - `MEMORY_CORE_JIRA_API_TOKEN`
- Confluence
  - `MEMORY_CORE_CONFLUENCE_BASE_URL`
  - `MEMORY_CORE_CONFLUENCE_EMAIL`
  - `MEMORY_CORE_CONFLUENCE_API_TOKEN`


## 단계별 설정

1. Atlassian API 토큰 생성
- Jira/Confluence 모두 동일 토큰을 사용할 수 있습니다.
- 토큰은 시크릿 매니저에 보관하세요.

2. Admin UI에서 저장
- `admin-ui` -> Integrations로 이동
- Jira 저장:
  - `enabled=true`
  - `base_url`
  - `email`
  - `api_token`
- Confluence 저장:
  - `enabled=true`
  - `base_url` (`https://your-org.atlassian.net` 또는 `https://your-org.atlassian.net/wiki`)
  - `email`
  - `api_token`
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
    "provider": "jira",
    "enabled": true,
    "reason": "팀 Jira 컨텍스트 연동",
    "config": {
      "base_url": "https://your-org.atlassian.net",
      "email": "you@company.com",
      "api_token": "atlassian-token"
    }
  }'
```

```bash
curl -X PUT "$MEMORY_CORE_URL/v1/integrations" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_key": "personal",
    "provider": "confluence",
    "enabled": true,
    "reason": "팀 Confluence 문서 컨텍스트 연동",
    "config": {
      "base_url": "https://your-org.atlassian.net/wiki",
      "email": "you@company.com",
      "api_token": "atlassian-token"
    }
  }'
```

4. API 검증

```bash
curl -G "$MEMORY_CORE_URL/v1/jira/search" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "q=deployment incident" \
  --data-urlencode "limit=5"
```

```bash
curl -G "$MEMORY_CORE_URL/v1/confluence/search" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "q=runbook" \
  --data-urlencode "limit=5"
```

5. MCP 도구 검증
- `jira_search({ q, limit? })`
- `jira_read({ issue_key, max_chars? })`
- `confluence_search({ q, limit? })`
- `confluence_read({ page_id, max_chars? })`


## API 엔드포인트

Jira:
- `GET /v1/jira/search?workspace_key=<ws>&q=<query>&limit=10`
- `GET /v1/jira/read?workspace_key=<ws>&issue_key=<ABC-123>&max_chars=4000`

Confluence:
- `GET /v1/confluence/search?workspace_key=<ws>&q=<query>&limit=10`
- `GET /v1/confluence/read?workspace_key=<ws>&page_id=<id-or-url>&max_chars=4000`


## 권한 및 감사 로그

- 검색/열람은 workspace member 권한 필요
- 모든 호출은 `audit_logs`에 기록:
  - `jira.search`
  - `jira.read`
  - `confluence.search`
  - `confluence.read`


## env vs Admin UI 우선순위

- 기본: Admin UI의 워크스페이스 설정이 env fallback보다 우선합니다.
- 잠금 옵션:
  - `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS=jira,confluence`
  - 잠금 시 Admin UI 수정은 거부되고 env-only 모드가 강제됩니다.


## 트러블슈팅

- `Invalid API key`
  - `Authorization: Bearer <key>` 확인
- `Integration not configured` 류 오류
  - 워크스페이스에 `base_url`, `email`, `api_token` 저장 여부 확인
- search는 되는데 read 실패
  - Atlassian 권한/리소스 접근 가능 여부와 issue key/page id 확인
