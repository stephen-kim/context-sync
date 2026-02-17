# Claustrum

[English README](README.md) | [한국어 README](README.ko.md) | [日本語 README](README.ja.md) | [Español README](README.es.md) | [中文 README](README.zh.md)

Claustrum es una capa de memoria compartida para sistemas de IA. Integra contexto entre proyectos, herramientas y equipos.


## Qué Hace Este Proyecto

- Comparte contexto de memoria entre varios equipos y computadoras.
- Mantiene los flujos MCP seguros para producción (`stdout` limpio, comportamiento guiado por políticas).
- Ofrece operaciones de equipo desde Admin UI (workspace/proyecto/usuario/permisos/audit log).
- Soporta fuentes de contexto externas (Notion, Jira, Confluence, Linear, Slack).


## Por Qué Existe

El contexto de desarrollo con IA suele fragmentarse:

- cada máquina tiene un estado de memoria distinto
- cada miembro del equipo ve un contexto diferente
- las decisiones del proyecto se pierden entre commits, chats y documentos

Claustrum convierte eso en un sistema de memoria compartido y consultable para equipos.


## Componentes Principales

- **Memory Core**: REST API + políticas + almacenamiento en Postgres.
- **MCP Adapter**: puente MCP por stdio hacia Memory Core.
- **Admin UI**: panel web de gestión para equipos.
- **Shared Package**: esquemas, tipos y utilidades compartidas.


## Documentación (Wiki-first)

Este README es intencionalmente breve. La configuración y operación detalladas están en la Wiki.

- [GitHub Wiki](https://github.com/stephen-kim/claustrum/wiki)
- [Wiki Home (EN)](docs/wiki/Home.md)
- [Installation (EN)](docs/wiki/Installation.md)
- [Operations (EN)](docs/wiki/Operations.md)
- [Security and MCP I/O (EN)](docs/wiki/Security-and-MCP-IO.md)
- [Architecture](docs/architecture.md)


## Estructura del Repositorio

```text
apps/
  memory-core/
  mcp-adapter/
  admin-ui/
packages/
  shared/
```


## Upstream

- Upstream (`upstream`): `https://github.com/Intina47/context-sync.git`
