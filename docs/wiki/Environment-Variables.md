# Environment Variables (Full Reference)


## Purpose

`.env.example` is intentionally minimal for fast setup.

This page is the complete environment variable reference for:

- `apps/memory-core`
- `apps/mcp-adapter`
- `apps/admin-ui`
- Docker Compose deployment
- Optional CI workflows
- Legacy root package scripts (`src/`, `bin/`, `scripts/`)


## Precedence Rules

- `memory-core` database connection uses `DATABASE_URL` only.
- `POSTGRES_*` values are only for local Compose Postgres bootstrap.
- For integrations (Notion/Jira/Confluence/Linear/Slack/Audit reasoner):
  - values can be saved in DB from Admin UI, or
  - provided via env,
  - and `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS` controls which source wins.


## Quickstart Minimum

- `DATABASE_URL`
- `MEMORY_CORE_API_KEY`
- `MEMORY_CORE_URL`
- `NEXT_PUBLIC_MEMORY_CORE_URL`
- Local DB profile only: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`


## Memory Core (Required / Core)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | None | Postgres DSN. For RDS include SSL query (`sslmode=require` etc). |
| `MEMORY_CORE_API_KEY` | Recommended | None | Runtime bearer token for clients. |
| `MEMORY_CORE_API_KEYS` | No | Empty | Comma-separated additional runtime keys. |
| `MEMORY_CORE_HOST` | No | `0.0.0.0` | HTTP bind host. |
| `MEMORY_CORE_PORT` | No | `8080` | HTTP bind port. |
| `MEMORY_CORE_LOG_LEVEL` | No | `error` | `debug`, `info`, `warn`, `error`, `silent`. |


## Memory Core (Bootstrap / Auth / Security)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_ALLOW_BOOTSTRAP_ADMIN` | No | `true` | If DB has no users, create bootstrap `admin@example.com` once. |
| `MEMORY_CORE_SEED_ADMIN_KEY` | No | Falls back to `MEMORY_CORE_API_KEY` | Used by `pnpm db:seed` only. |
| `MEMORY_CORE_SECRET` | Recommended | Dev fallback | Shared base secret. Strongly recommended in production. |
| `MEMORY_CORE_AUTH_SESSION_SECRET` | No | Derives from `MEMORY_CORE_SECRET` or dev fallback | Session signing secret override. |
| `MEMORY_CORE_AUTH_SESSION_TTL_SECONDS` | No | `43200` | Session TTL seconds (minimum clamp applied). |
| `MEMORY_CORE_API_KEY_HASH_SECRET` | No | Derives from `MEMORY_CORE_SECRET` or dev fallback | API key hashing secret override. |
| `MEMORY_CORE_ONE_TIME_TOKEN_SECRET` | No | Derives from shared secret/session secret | One-time link token secret override. |
| `MEMORY_CORE_ONE_TIME_TOKEN_TTL_SECONDS` | No | `900` | One-time token TTL seconds. |
| `MEMORY_CORE_GITHUB_STATE_SECRET` | No | Derives from shared secret/session secret | GitHub callback state signing secret. |
| `MEMORY_CORE_PUBLIC_BASE_URL` | No | Empty | Public base URL used for callback/link generation. |
| `MEMORY_CORE_INVITE_BASE_URL` | No | Empty | Invite URL base override. |


## Memory Core (GitHub App)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GITHUB_APP_ID` | Optional | Empty | GitHub App ID. |
| `GITHUB_APP_PRIVATE_KEY` | Optional | Empty | Supports raw PEM, escaped newlines, or base64 PEM. |
| `GITHUB_APP_WEBHOOK_SECRET` | Optional | Empty | GitHub webhook signature verification secret. |
| `GITHUB_APP_NAME` | Optional | Empty | UI/metadata helper. |
| `GITHUB_APP_URL` | Optional | Empty | UI/metadata helper. |


## Memory Core (Integration Source Control)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS` | No | Empty | `all`, `none`, or provider list: `notion,jira,confluence,linear,slack,audit_reasoner`. |

Behavior:

- `all`: force ENV-only for all providers.
- `none`: ignore ENV provider config and use DB/Admin UI config only.
- CSV list: force ENV-only for listed providers.


## Memory Core (Audit Slack)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_AUDIT_SLACK_WEBHOOK_URL` | Optional | Empty | Slack webhook endpoint for audit forwarding. |
| `MEMORY_CORE_AUDIT_SLACK_ACTION_PREFIXES` | Optional | Empty | CSV prefix filter (example: `access.,auth.`). |
| `MEMORY_CORE_AUDIT_SLACK_DEFAULT_CHANNEL` | Optional | Empty | Optional channel override. |
| `MEMORY_CORE_AUDIT_SLACK_FORMAT` | Optional | `detailed` | `compact` or `detailed`. |
| `MEMORY_CORE_AUDIT_SLACK_INCLUDE_TARGET_JSON` | Optional | `true` | Include target payload details. |
| `MEMORY_CORE_AUDIT_SLACK_MASK_SECRETS` | Optional | `true` | Mask secret-like values. |
| `MEMORY_CORE_ALLOW_PRIVATE_AUDIT_SINK_URLS` | Optional | `false` | Dev-only escape hatch for private sink URLs. |


## Memory Core (Notion / Jira / Confluence / Linear)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_NOTION_TOKEN` | Optional | Empty | Notion API token. |
| `MEMORY_CORE_NOTION_DEFAULT_PARENT_PAGE_ID` | Optional | Empty | Default parent page for writes. |
| `MEMORY_CORE_NOTION_WRITE_ENABLED` | Optional | `false` | Enables Notion write operations. |
| `MEMORY_CORE_JIRA_BASE_URL` | Optional | Empty | Jira base URL. |
| `MEMORY_CORE_JIRA_EMAIL` | Optional | Empty | Jira user email. |
| `MEMORY_CORE_JIRA_API_TOKEN` | Optional | Empty | Jira API token. |
| `MEMORY_CORE_CONFLUENCE_BASE_URL` | Optional | Empty | Confluence base URL. |
| `MEMORY_CORE_CONFLUENCE_EMAIL` | Optional | Empty | Confluence user email. |
| `MEMORY_CORE_CONFLUENCE_API_TOKEN` | Optional | Empty | Confluence API token. |
| `MEMORY_CORE_LINEAR_API_KEY` | Optional | Empty | Linear API key. |
| `MEMORY_CORE_LINEAR_API_URL` | Optional | Empty | Linear API URL override. |


## Memory Core (Audit Reasoner / LLM)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_AUDIT_REASONER_ENABLED` | Optional | Auto | If unset, auto-enables when provider key exists. |
| `MEMORY_CORE_AUDIT_REASONER_PROVIDER_ORDER` | Optional | `openai,claude,gemini` | CSV fallback order. |
| `MEMORY_CORE_AUDIT_REASONER_PROVIDER` | Optional (legacy) | Empty | Legacy single-provider selector. |
| `MEMORY_CORE_AUDIT_REASONER_MODEL` | Optional (legacy) | Empty | Legacy generic model (applies to first provider). |
| `MEMORY_CORE_AUDIT_REASONER_API_KEY` | Optional (legacy) | Empty | Legacy generic key (applies to first provider). |
| `MEMORY_CORE_AUDIT_REASONER_BASE_URL` | Optional (legacy) | Empty | Legacy generic base URL (applies to first provider). |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_MODEL` | Optional | Empty | OpenAI model override. |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_API_KEY` | Optional | Empty | OpenAI API key. |
| `MEMORY_CORE_AUDIT_REASONER_OPENAI_BASE_URL` | Optional | Empty | OpenAI base URL override. |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_MODEL` | Optional | Empty | Claude model override. |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_API_KEY` | Optional | Empty | Claude API key. |
| `MEMORY_CORE_AUDIT_REASONER_CLAUDE_BASE_URL` | Optional | Empty | Claude base URL override. |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_MODEL` | Optional | Empty | Gemini model override. |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_API_KEY` | Optional | Empty | Gemini API key. |
| `MEMORY_CORE_AUDIT_REASONER_GEMINI_BASE_URL` | Optional | Empty | Gemini base URL override. |
| `OPENAI_API_KEY` | Optional fallback | Empty | OpenAI fallback key. |
| `ANTHROPIC_API_KEY` | Optional fallback | Empty | Claude fallback key. |
| `CLAUDE_API_KEY` | Optional fallback | Empty | Claude fallback key alias. |
| `GEMINI_API_KEY` | Optional fallback | Empty | Gemini fallback key. |
| `MEMORY_CORE_CLAUDE_API_KEY` | Optional fallback | Empty | Legacy Claude fallback key. |


## MCP Adapter

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEMORY_CORE_URL` | Yes | None | Must point to memory-core base URL. |
| `MEMORY_CORE_API_KEY` | Yes | None | Bearer token for API calls. |
| `MEMORY_CORE_WORKSPACE_KEY` | No | `personal` | Default workspace when unset. |
| `MCP_ADAPTER_LOG_LEVEL` | No | Adapter default | Logs go to `stderr` only. |


## Admin UI

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_MEMORY_CORE_URL` | Yes | None | Browser-reachable memory-core URL. |
| `ADMIN_UI_PORT` | No (Compose) | `3000` | Host port mapping in compose. |


## Docker Compose Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_DB` | Localdb profile only | `claustrum` | Postgres bootstrap DB name. |
| `POSTGRES_USER` | Localdb profile only | `claustrum` | Postgres bootstrap user. |
| `POSTGRES_PASSWORD` | Localdb profile only | `claustrum` | Postgres bootstrap password. |
| `MEMORY_CORE_IMAGE` | Optional | `ghcr.io/stephen-kim/claustrum-memory-core:latest` | Image override for deployment compose. |
| `MCP_ADAPTER_IMAGE` | Optional | `ghcr.io/stephen-kim/claustrum-mcp-adapter:latest` | Image override for deployment compose. |
| `ADMIN_UI_IMAGE` | Optional | `ghcr.io/stephen-kim/claustrum-admin-ui:latest` | Image override for deployment compose. |


## GitHub Actions Secrets (Optional Workflows)

These are GitHub repository/organization **secrets**, not local `.env` keys.

| Secret | Used by | Notes |
|---|---|---|
| `MEMORY_CORE_URL` | `claustrum-ci-events`, `notion-merge-sync` | memory-core endpoint reachable from Actions runner. |
| `MEMORY_CORE_API_KEY` | `claustrum-ci-events`, `notion-merge-sync` | bearer token. |
| `MEMORY_CORE_WORKSPACE_KEY` | `claustrum-ci-events` | workspace for CI event ingest. |
| `MEMORY_CORE_PROJECT_KEY` | `claustrum-ci-events` | optional fixed project target. |
| `NOTION_WORKSPACE_KEY` | `notion-merge-sync` | workspace for Notion write operation. |
| `NOTION_PAGE_ID` | `notion-merge-sync` | optional target page. |
| `NOTION_PARENT_PAGE_ID` | `notion-merge-sync` | optional parent page target. |


## Framework / Runtime Injected (Do Not Configure Manually)

These values can appear in source/runtime paths but are managed by runtime/framework layers.

| Variable | Source | Notes |
|---|---|---|
| `NODE_ENV` | Node/Next.js runtime | Build/runtime mode (`development`, `production`, `test`). |
| `HOSTNAME` | Container/runtime environment | Hostname assigned by runtime. |
| `NEXT_OTEL_FETCH_DISABLED` | Next.js internals | Internal tracing behavior. |
| `NEXT_OTEL_PERFORMANCE_PREFIX` | Next.js internals | Internal tracing behavior. |
| `NEXT_OTEL_VERBOSE` | Next.js internals | Internal tracing behavior. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Next.js internals | Internal server action encryption key. |
| `__NEXT_BUILD_ID` | Next.js internals | Build identifier. |
| `__NEXT_PRIVATE_STANDALONE_CONFIG` | Next.js internals | Standalone runtime config payload. |
| `KEEP_ALIVE_TIMEOUT` | Runtime/server internals | Connection keep-alive tuning in some runtimes. |


## Legacy Root Package Variables

These apply to legacy root scripts and compatibility paths (`src/`, `bin/`, `scripts/`).

| Variable | Purpose |
|---|---|
| `CONTEXT_SYNC_DATABASE_URL` | Legacy DB URL fallback. |
| `CONTEXT_SYNC_DB_HOST` / `CONTEXT_SYNC_DB_PORT` / `CONTEXT_SYNC_DB_NAME` / `CONTEXT_SYNC_DB_USER` / `CONTEXT_SYNC_DB_PASSWORD` | Legacy DB connection parts. |
| `CONTEXT_SYNC_PROJECT_KEY` | Legacy hook event project key. |
| `CONTEXT_SYNC_HOOK_EVENT` | Legacy hook event type marker. |
| `CONTEXT_SYNC_LOG_LEVEL` / `LOG_LEVEL` | Legacy logger level. |
| `CONTEXT_SYNC_REGISTER_CMD` / `CONTEXT_SYNC_REGISTER_ARGS` | Legacy registration helper command override. |

Windows-only path discovery for legacy installers may read:

- `APPDATA`
- `LOCALAPPDATA`
- `PROGRAMFILES`
- `PROGRAMFILES(X86)`
- `USERPROFILE`


## Notes

- Keep `.env.example` minimal.
- Put only active values in `.env`.
- Prefer DB-stored integration settings from Admin UI unless you intentionally force ENV mode.


Last Updated: 2026-02-18
