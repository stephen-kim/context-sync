# context-sync 위키 홈


## 개요

context-sync는 MCP 클라이언트를 위한 팀 확장형 Memory Core 시스템입니다.

구성:
- `memory-core`: REST API + Postgres 데이터 레이어
- `mcp-adapter`: memory-core를 호출하는 stdio MCP 어댑터
- `admin-ui`: 운영 대시보드

핵심 원칙:
- MCP 안전성: `stdout`은 JSON-RPC만, 로그는 `stderr`
- 기본 recall: 정제된 `memories`만 조회
- raw 검색: snippet-only + audit 로그


## 다음 문서

- [설치 가이드](Installation.ko)
- [운영 가이드](Operations.ko)
- [보안 및 MCP I/O](Security-and-MCP-IO.ko)
- [Notion 연동](Notion-Integration.ko)
- [Atlassian 연동](Atlassian-Integration.ko)
- [Linear 연동](Linear-Integration.ko)
- [Slack 감사 연동](Slack-Audit.ko)
- [릴리즈 노트](Release-Notes.ko)
- [Installation (English)](Installation)


## API 요약

- `GET /healthz`
- `POST /v1/resolve-project`
- `GET/POST /v1/workspaces`
- `GET/POST /v1/projects`
- `GET/POST /v1/memories`
- `GET/PUT /v1/workspace-settings`
- `GET/PUT /v1/integrations`
- `GET/POST/PATCH /v1/project-mappings`
- `GET/POST /v1/users`
- `GET/POST /v1/project-members`
- `GET/POST /v1/imports`
- `POST /v1/imports/:id/parse`
- `POST /v1/imports/:id/extract`
- `GET /v1/imports/:id/staged`
- `POST /v1/imports/:id/commit`
- `GET /v1/raw/search`
- `GET /v1/raw/messages/:id`
- `GET /v1/audit-logs`
- `GET /v1/jira/search`
- `GET /v1/jira/read`
- `GET /v1/confluence/search`
- `GET /v1/confluence/read`
- `GET /v1/linear/search`
- `GET /v1/linear/read`
