# context-sync: 팀 확장형 Memory Core

[English](README.md) | [한국어](README.ko.md)

AI 코딩 에이전트를 위한 프로덕션급 메모리 인프라.

`context-sync`는 Codex/Claude 기반 MCP 워크플로를 실제 팀 환경에서 안정적으로 운영하기 위해 설계되었습니다.


## 이 프로젝트가 하는 일

여러 컴퓨터에서 Codex를 쓰면 세션이 바뀔 때마다 컨텍스트가 끊기기 쉽습니다. 의사결정, 제약사항, 진행 중 작업이 머신과 사용자 사이에서 자주 유실됩니다.

`context-sync`는 이 문제를 Postgres 기반 공유 메모리 계층으로 해결합니다. 프로젝트/워크스페이스 스코프와 감사 로그를 통해 운영 환경에서도 추적 가능한 형태로 유지합니다.

이건 개인의 멀티 디바이스 동기화만이 아니라, 팀 단위에서 작업자/에이전트 간 컨텍스트를 함께 동기화해 같은 프로젝트 메모리를 공유하게 합니다.

팀 환경에서는 실제 업무 시스템과도 연결됩니다.
- Notion: 문서 컨텍스트
- Jira/Confluence: 이슈/지식베이스 컨텍스트
- Linear: 이슈 컨텍스트
- Slack: 감사 알림(누가 무엇을 왜 바꿨는지)

또한 Git commit/merge 이벤트 기반 자동화도 지원합니다.
- 로컬 git hook(옵션)을 켜면 commit/merge 이벤트를 memory-core로 전달해 감사 로그를 남길 수 있습니다.
- CI merge 플로우(예: GitHub Actions `main` 트리거)에서 memory-core를 통해 Notion에 merge 요약을 자동 기록할 수 있습니다.


## 주요 특징

- **MCP 안전성 기본 탑재**: stdio 규율 강제 (`stdout`은 JSON-RPC만, 로그는 `stderr`만).
- **팀 확장형 데이터 모델**: workspaces/projects/members/permissions/audit logs 지원.
- **신뢰 가능한 recall**: 기본 리콜은 **memories 중심**으로 정제된 컨텍스트 제공.
- **통제된 raw 접근**: raw 검색은 snippet-only, 길이 제한과 audit 추적 적용.
- **운영 감사 가시성**: audit 이벤트를 Slack으로 전달해 누가/무엇을/왜 변경했는지 추적 가능.
- **외부 문서 컨텍스트 연동**: Notion/Jira/Confluence/Linear read/search로 팀 문서 지식 재활용 가능.
- **워크스페이스 단위 연동 설정**: provider 자격정보를 env뿐 아니라 Admin UI(`/v1/integrations`)에서도 관리 가능.
- **Admin UI 권한 관리**: 사용자 추가, 프로젝트 멤버 관리, 워크스페이스/프로젝트 단위 역할·권한 제어 지원.
- **운영 가능한 배포 경로**: Postgres, migrations/seeds, Docker Compose, 외부 DB 지원.


## 모노레포 앱

- `apps/memory-core`: REST API 서버 (Express + Prisma + Postgres)
- `apps/mcp-adapter`: memory-core REST를 호출하는 MCP stdio adapter
- `apps/admin-ui`: Next.js 운영 대시보드
- `packages/shared`: 공용 스키마/타입


## 문서 / 위키

설치/운영 상세 문서는 위키에서 관리합니다.

- Wiki Home: <https://github.com/stephen-kim/context-sync/wiki>
- 설치 가이드: `docs/wiki/Installation.ko.md`
- 운영 가이드: `docs/wiki/Operations.ko.md`
- 보안 및 MCP I/O: `docs/wiki/Security-and-MCP-IO.ko.md`
- Notion 연동: `docs/wiki/Notion-Integration.ko.md`
- Atlassian 연동: `docs/wiki/Atlassian-Integration.ko.md`
- Linear 연동: `docs/wiki/Linear-Integration.ko.md`
- Slack 감사 연동: `docs/wiki/Slack-Audit.ko.md`


## 포크 정보

- Upstream (`upstream`): `https://github.com/Intina47/context-sync.git`
