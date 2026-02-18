# 환경변수 전체 레퍼런스


## 목적

`.env.example`는 빠른 시작을 위해 최소 변수만 남긴 템플릿입니다.

이 문서는 다음 범위의 전체 환경변수 목록을 정리합니다.

- `apps/memory-core`
- `apps/mcp-adapter`
- `apps/admin-ui`
- Docker Compose
- 선택적 GitHub Actions 워크플로
- 레거시 루트 패키지(`src/`, `bin/`, `scripts/`)


## 우선순위 원칙

- `memory-core` DB 연결은 `DATABASE_URL`만 사용합니다.
- `POSTGRES_*`는 localdb compose 프로필의 Postgres 초기화용입니다.
- 통합(Notion/Jira/Confluence/Linear/Slack/Audit reasoner)은
  - Admin UI(DB 저장) 또는
  - env 입력을 사용할 수 있으며,
  - `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS`로 우선순위를 제어합니다.


## 최초 실행 최소 변수

- `DATABASE_URL`
- `MEMORY_CORE_API_KEY`
- `MEMORY_CORE_URL`
- `NEXT_PUBLIC_MEMORY_CORE_URL`
- localdb 프로필 전용: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`


## Memory Core (필수 / 핵심)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | 예 | 없음 | Postgres DSN. RDS면 SSL 쿼리(`sslmode=require` 등) 포함 권장 |
| `MEMORY_CORE_API_KEY` | 권장 | 없음 | 런타임 Bearer 토큰 |
| `MEMORY_CORE_API_KEYS` | 아니오 | 빈 값 | 추가 키 CSV |
| `MEMORY_CORE_HOST` | 아니오 | `0.0.0.0` | HTTP 바인드 호스트 |
| `MEMORY_CORE_PORT` | 아니오 | `8080` | HTTP 포트 |
| `MEMORY_CORE_LOG_LEVEL` | 아니오 | `error` | `debug`, `info`, `warn`, `error`, `silent` |


## Memory Core (부트스트랩 / 인증 / 보안)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_ALLOW_BOOTSTRAP_ADMIN` | 아니오 | `true` | 사용자 0명일 때 `admin@example.com` 1회 생성 |
| `MEMORY_CORE_SEED_ADMIN_KEY` | 아니오 | `MEMORY_CORE_API_KEY` fallback | `pnpm db:seed`에서만 사용 |
| `MEMORY_CORE_SECRET` | 권장 | 개발용 fallback | 공통 시크릿 (운영에서 강력 권장) |
| `MEMORY_CORE_AUTH_SESSION_SECRET` | 아니오 | `MEMORY_CORE_SECRET` 기반 | 세션 시크릿 override |
| `MEMORY_CORE_AUTH_SESSION_TTL_SECONDS` | 아니오 | `43200` | 세션 TTL(초) |
| `MEMORY_CORE_API_KEY_HASH_SECRET` | 아니오 | `MEMORY_CORE_SECRET` 기반 | API 키 해시 시크릿 override |
| `MEMORY_CORE_ONE_TIME_TOKEN_SECRET` | 아니오 | 공통/세션 시크릿 기반 | 1회성 토큰 시크릿 override |
| `MEMORY_CORE_ONE_TIME_TOKEN_TTL_SECONDS` | 아니오 | `900` | 1회성 토큰 TTL(초) |
| `MEMORY_CORE_GITHUB_STATE_SECRET` | 아니오 | 공통/세션 시크릿 기반 | GitHub callback state 서명 시크릿 |
| `MEMORY_CORE_PUBLIC_BASE_URL` | 아니오 | 빈 값 | 외부 링크/콜백 생성용 base URL |
| `MEMORY_CORE_INVITE_BASE_URL` | 아니오 | 빈 값 | 초대 링크 base URL override |


## Memory Core (GitHub App)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `GITHUB_APP_ID` | 선택 | 빈 값 | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | 선택 | 빈 값 | raw PEM / escaped newline / base64 PEM 지원 |
| `GITHUB_APP_WEBHOOK_SECRET` | 선택 | 빈 값 | webhook signature 검증 시크릿 |
| `GITHUB_APP_NAME` | 선택 | 빈 값 | UI/메타데이터용 |
| `GITHUB_APP_URL` | 선택 | 빈 값 | UI/메타데이터용 |


## Memory Core (통합 설정 소스 제어)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS` | 아니오 | 빈 값 | `all`, `none`, 또는 provider CSV |

동작:

- `all`: 모든 provider를 ENV 전용으로 강제
- `none`: ENV provider 설정 무시, DB/Admin UI만 사용
- CSV: 지정 provider만 ENV 전용으로 강제


## Memory Core (Audit Slack)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_AUDIT_SLACK_WEBHOOK_URL` | 선택 | 빈 값 | Slack webhook URL |
| `MEMORY_CORE_AUDIT_SLACK_ACTION_PREFIXES` | 선택 | 빈 값 | prefix 필터 CSV (`access.,auth.` 등) |
| `MEMORY_CORE_AUDIT_SLACK_DEFAULT_CHANNEL` | 선택 | 빈 값 | 기본 채널 override |
| `MEMORY_CORE_AUDIT_SLACK_FORMAT` | 선택 | `detailed` | `compact` 또는 `detailed` |
| `MEMORY_CORE_AUDIT_SLACK_INCLUDE_TARGET_JSON` | 선택 | `true` | target JSON 포함 여부 |
| `MEMORY_CORE_AUDIT_SLACK_MASK_SECRETS` | 선택 | `true` | 시크릿 마스킹 여부 |
| `MEMORY_CORE_ALLOW_PRIVATE_AUDIT_SINK_URLS` | 선택 | `false` | 개발용 private sink 허용 |


## Memory Core (Notion / Jira / Confluence / Linear)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_NOTION_TOKEN` | 선택 | 빈 값 | Notion 토큰 |
| `MEMORY_CORE_NOTION_DEFAULT_PARENT_PAGE_ID` | 선택 | 빈 값 | 기본 parent page |
| `MEMORY_CORE_NOTION_WRITE_ENABLED` | 선택 | `false` | Notion 쓰기 활성화 |
| `MEMORY_CORE_JIRA_BASE_URL` | 선택 | 빈 값 | Jira base URL |
| `MEMORY_CORE_JIRA_EMAIL` | 선택 | 빈 값 | Jira 이메일 |
| `MEMORY_CORE_JIRA_API_TOKEN` | 선택 | 빈 값 | Jira API 토큰 |
| `MEMORY_CORE_CONFLUENCE_BASE_URL` | 선택 | 빈 값 | Confluence base URL |
| `MEMORY_CORE_CONFLUENCE_EMAIL` | 선택 | 빈 값 | Confluence 이메일 |
| `MEMORY_CORE_CONFLUENCE_API_TOKEN` | 선택 | 빈 값 | Confluence API 토큰 |
| `MEMORY_CORE_LINEAR_API_KEY` | 선택 | 빈 값 | Linear API 키 |
| `MEMORY_CORE_LINEAR_API_URL` | 선택 | 빈 값 | Linear API URL override |


## Memory Core (Audit Reasoner / LLM)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_AUDIT_REASONER_ENABLED` | 선택 | 자동 | 미지정 시 provider 키 존재 여부로 자동 활성화 |
| `MEMORY_CORE_AUDIT_REASONER_PROVIDER_ORDER` | 선택 | `openai,claude,gemini` | provider fallback 순서 CSV |
| `MEMORY_CORE_AUDIT_REASONER_PROVIDER` | 선택(레거시) | 빈 값 | 레거시 단일 provider |
| `MEMORY_CORE_AUDIT_REASONER_MODEL` | 선택(레거시) | 빈 값 | 레거시 공통 모델 |
| `MEMORY_CORE_AUDIT_REASONER_API_KEY` | 선택(레거시) | 빈 값 | 레거시 공통 키 |
| `MEMORY_CORE_AUDIT_REASONER_BASE_URL` | 선택(레거시) | 빈 값 | 레거시 공통 base URL |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_MODEL` | 선택 | 빈 값 | OpenAI 모델 override |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_API_KEY` | 선택 | 빈 값 | OpenAI API 키 |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_BASE_URL` | 선택 | 빈 값 | OpenAI base URL override |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_MODEL` | 선택 | 빈 값 | Claude 모델 override |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_API_KEY` | 선택 | 빈 값 | Claude API 키 |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_BASE_URL` | 선택 | 빈 값 | Claude base URL override |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_MODEL` | 선택 | 빈 값 | Gemini 모델 override |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_API_KEY` | 선택 | 빈 값 | Gemini API 키 |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_BASE_URL` | 선택 | 빈 값 | Gemini base URL override |
| `OPENAI_API_KEY` | 선택 fallback | 빈 값 | OpenAI fallback 키 |
| `ANTHROPIC_API_KEY` | 선택 fallback | 빈 값 | Claude fallback 키 |
| `CLAUDE_API_KEY` | 선택 fallback | 빈 값 | Claude fallback 별칭 |
| `GEMINI_API_KEY` | 선택 fallback | 빈 값 | Gemini fallback 키 |
| `MEMORY_CORE_CLAUDE_API_KEY` | 선택 fallback | 빈 값 | 레거시 Claude fallback |


## MCP Adapter

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MEMORY_CORE_URL` | 예 | 없음 | memory-core base URL |
| `MEMORY_CORE_API_KEY` | 예 | 없음 | Bearer 토큰 |
| `MEMORY_CORE_WORKSPACE_KEY` | 아니오 | `personal` | 기본 workspace |
| `MCP_ADAPTER_LOG_LEVEL` | 아니오 | adapter 기본값 | 로그는 `stderr`만 사용 |


## Admin UI

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_MEMORY_CORE_URL` | 예 | 없음 | 브라우저에서 접근 가능한 memory-core URL |
| `ADMIN_UI_PORT` | 아니오(Compose) | `3000` | compose 포트 매핑 |


## Docker Compose 변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `POSTGRES_DB` | localdb 전용 | `claustrum` | Postgres 초기화 DB명 |
| `POSTGRES_USER` | localdb 전용 | `claustrum` | Postgres 초기화 사용자 |
| `POSTGRES_PASSWORD` | localdb 전용 | `claustrum` | Postgres 초기화 비밀번호 |
| `MEMORY_CORE_IMAGE` | 선택 | `ghcr.io/stephen-kim/claustrum-memory-core:latest` | 배포 compose 이미지 override |
| `MCP_ADAPTER_IMAGE` | 선택 | `ghcr.io/stephen-kim/claustrum-mcp-adapter:latest` | 배포 compose 이미지 override |
| `ADMIN_UI_IMAGE` | 선택 | `ghcr.io/stephen-kim/claustrum-admin-ui:latest` | 배포 compose 이미지 override |


## GitHub Actions Secrets (선택 워크플로)

이 값들은 로컬 `.env`가 아니라 GitHub Secrets입니다.

| Secret | 사용 워크플로 | 설명 |
|---|---|---|
| `MEMORY_CORE_URL` | `claustrum-ci-events`, `notion-merge-sync` | Actions runner에서 접근 가능한 memory-core URL |
| `MEMORY_CORE_API_KEY` | `claustrum-ci-events`, `notion-merge-sync` | Bearer 토큰 |
| `MEMORY_CORE_WORKSPACE_KEY` | `claustrum-ci-events` | CI 이벤트 저장 workspace |
| `MEMORY_CORE_PROJECT_KEY` | `claustrum-ci-events` | 선택적 고정 project |
| `NOTION_WORKSPACE_KEY` | `notion-merge-sync` | Notion write 대상 workspace |
| `NOTION_PAGE_ID` | `notion-merge-sync` | 선택적 대상 page |
| `NOTION_PARENT_PAGE_ID` | `notion-merge-sync` | 선택적 parent page |


## 프레임워크 / 런타임 주입 변수 (수동 설정 비권장)

아래 값들은 코드/런타임에서 보일 수 있지만, 일반적으로 사용자가 `.env`에 수동 설정하지 않습니다.

| 변수 | 소스 | 설명 |
|---|---|---|
| `NODE_ENV` | Node/Next.js 런타임 | 실행 모드(`development`, `production`, `test`) |
| `HOSTNAME` | 컨테이너/런타임 환경 | 런타임이 부여한 호스트명 |
| `NEXT_OTEL_FETCH_DISABLED` | Next.js 내부 | 내부 텔레메트리 동작 |
| `NEXT_OTEL_PERFORMANCE_PREFIX` | Next.js 내부 | 내부 텔레메트리 동작 |
| `NEXT_OTEL_VERBOSE` | Next.js 내부 | 내부 텔레메트리 동작 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Next.js 내부 | Server Actions 내부 암호화 키 |
| `__NEXT_BUILD_ID` | Next.js 내부 | 빌드 식별자 |
| `__NEXT_PRIVATE_STANDALONE_CONFIG` | Next.js 내부 | standalone 런타임 구성 |
| `KEEP_ALIVE_TIMEOUT` | 런타임/서버 내부 | 일부 런타임의 keep-alive 튜닝 값 |


## 레거시 루트 패키지 변수

루트 레거시 코드(`src/`, `bin/`, `scripts/`) 호환용입니다.

| 변수 | 용도 |
|---|---|
| `CONTEXT_SYNC_DATABASE_URL` | 레거시 DB URL fallback |
| `CONTEXT_SYNC_DB_HOST` / `CONTEXT_SYNC_DB_PORT` / `CONTEXT_SYNC_DB_NAME` / `CONTEXT_SYNC_DB_USER` / `CONTEXT_SYNC_DB_PASSWORD` | 레거시 DB 분리 설정 |
| `CONTEXT_SYNC_PROJECT_KEY` | 레거시 hook project key |
| `CONTEXT_SYNC_HOOK_EVENT` | 레거시 hook event type |
| `CONTEXT_SYNC_LOG_LEVEL` / `LOG_LEVEL` | 레거시 로거 레벨 |
| `CONTEXT_SYNC_REGISTER_CMD` / `CONTEXT_SYNC_REGISTER_ARGS` | 레거시 등록 스크립트 커맨드 override |

Windows 경로 탐지용 시스템 변수:

- `APPDATA`
- `LOCALAPPDATA`
- `PROGRAMFILES`
- `PROGRAMFILES(X86)`
- `USERPROFILE`


## 운영 메모

- `.env.example`는 최소 템플릿으로 유지합니다.
- 실제로 쓰는 값만 `.env`에 넣으세요.
- 가능하면 통합 설정은 Admin UI(DB 저장)로 관리하고, ENV 강제는 필요한 provider에만 적용하세요.


Last Updated: 2026-02-18
