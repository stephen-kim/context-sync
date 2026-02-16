# context-sync: Team-Scalable Memory Core

[English](README.md) | [한국어](README.ko.md)

Production-grade memory infrastructure for AI coding agents.

`context-sync` is built for teams running Codex/Claude-style MCP workflows in real projects, not demos.


## What This Project Does

If you use Codex across multiple computers, context often gets reset. Decisions, constraints, and active work disappear between sessions, machines, and teammates.

`context-sync` solves that pain by giving agents a shared memory layer backed by Postgres, with project/workspace scoping and auditability for production use.

It is not only cross-device memory sync for one person. It also enables cross-operator context sync for teams, so different developers/agents can work from the same evolving project memory.

For teams, it also connects memory workflows to real systems of record:
- Notion for documentation context
- Jira/Confluence for ticket and knowledge context
- Linear for issue context
- Slack for audit visibility (who changed what, and why)

It also supports automation around Git commit/merge events:
- Local git hooks (optional) can forward commit/merge events to memory-core for audit trails.
- CI merge flows (for example, GitHub Actions on `main`) can write merge summaries to Notion through memory-core.


## Why It Hits Different

- **MCP-safe by design**: strict stdio discipline (`stdout` JSON-RPC only, logs to `stderr`).
- **Team-ready model**: workspaces, projects, members, permissions, and audit logs.
- **Reliable recall behavior**: default recall is **memories-first** (clean, curated context).
- **Controlled raw access**: optional raw search is snippet-only with hard caps and audit trails.
- **Operational audit visibility**: audit events can be forwarded to Slack with who/what/why context.
- **External docs context**: optional Notion/Jira/Confluence/Linear read/search integrations for team knowledge reuse.
- **Workspace-level integration config**: provider credentials can be managed in Admin UI (`/v1/integrations`), not only env vars.
- **Team access control in Admin UI**: add users, manage project members, and control roles/permissions by workspace and project scope.
- **Production deployment path**: Postgres, migrations/seeds, Docker Compose, external DB support.


## Monorepo Apps

- `apps/memory-core`: REST API server (Express + Prisma + Postgres)
- `apps/mcp-adapter`: MCP stdio adapter that calls memory-core over HTTP
- `apps/admin-ui`: Next.js admin dashboard
- `packages/shared`: shared schemas/types


## Docs / Wiki

All setup and operations docs are maintained in the project wiki.

- Wiki Home: <https://github.com/stephen-kim/context-sync/wiki>
- Installation: `docs/wiki/Installation.md`
- Operations: `docs/wiki/Operations.md`
- Security and MCP I/O: `docs/wiki/Security-and-MCP-IO.md`
- Notion Integration: `docs/wiki/Notion-Integration.md`
- Atlassian Integration: `docs/wiki/Atlassian-Integration.md`
- Linear Integration: `docs/wiki/Linear-Integration.md`
- Slack Audit Integration: `docs/wiki/Slack-Audit.md`
- Sync local docs to GitHub Wiki: `pnpm wiki:sync`


## Fork Information

- Upstream (`upstream`): `https://github.com/Intina47/context-sync.git`
