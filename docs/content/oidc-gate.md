# OIDC Gate

## Role of OIDC in Claustrum

OIDC is the authentication and workspace gate layer.

- OIDC validates identity.
- OIDC establishes workspace-level session trust.
- OIDC does not replace GitHub as primary project authorization authority.

## Identity Key

Claustrum identifies OIDC users by immutable identity tuple:

```text
(issuer, subject)
```

Email is mutable and is not used as the primary identity key.

## Group Claim Mapping

Group mapping is supported as a policy signal.

- Prefer stable group ID over group name.
- Group display name is UI-only metadata.
- Mapping can boost role by policy, but does not become primary authority over GitHub for project access.

## Sync Modes

| Mode | Meaning |
|---|---|
| `add_only` | Grants from OIDC mappings are added. Existing unrelated grants are preserved. |
| `add_and_remove` | Grants are reconciled to current mapping state, subject to protection rules. |

## Why OIDC Is Not Primary Authorization

Claustrum selects GitHub as project authority for deterministic repo-level ownership alignment.

- GitHub is the operational source for repository permissions.
- OIDC groups are organizational and may not represent code ownership accurately.
- OIDC remains critical for identity assurance and access gate control.

## Enterprise Meaning

In enterprise deployment, this split model provides:

- SSO compliance and centralized identity lifecycle through OIDC.
- Precise repository authorization through GitHub permission graph.
- Controlled exceptions via manual override and audited governance.

## Guardrails

- OIDC gate failure denies access before project role evaluation.
- Identity links are tenant-scoped by workspace.
- Group-claim format mismatch must be treated as configuration risk.

Last Updated: 2026-02-17
