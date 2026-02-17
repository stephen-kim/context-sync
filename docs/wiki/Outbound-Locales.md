# Outbound Locales and Prompt Tuning


## Policy

- Admin UI stays English-only.
- Database records remain language-neutral (`action`, `target` params/metadata).
- Locale and prompt tuning apply only to outbound integrations (Slack/Jira/Confluence/Notion/Webhook/Email).


## Locale Resolution

Outbound locale selection order:

1. request override (`locale`)
2. integration policy `locale_default`
3. workspace `default_outbound_locale`
4. fallback `en`

Supported locale filtering applies at both workspace and integration policy levels.


## API

- `GET /v1/workspaces/:key/outbound-settings`
- `PUT /v1/workspaces/:key/outbound-settings`
- `GET /v1/outbound-policies/:integration_type?workspace_key=...`
- `PUT /v1/outbound-policies/:integration_type`
- `POST /v1/outbound/render`


## Template Overrides

`template_overrides` format:

```json
{
  "raw.search": {
    "en": "Searched raw logs for \"{q}\" ({count} results).",
    "ko": "원문 로그에서 \"{q}\"를 검색했습니다. (결과 {count}개)"
  }
}
```

Rules:

- Override template wins over built-in template.
- Missing locale falls back to `en`.
- Missing action key falls back to a safe generic sentence.


## LLM Mode Notes

- `mode=llm` is policy-configurable, but production deployments should gate this by provider availability, cost, and security review.
- Keep prompts free of secrets and credentials.
- If LLM generation fails, renderer must degrade safely to template behavior.
