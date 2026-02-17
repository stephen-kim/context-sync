# Outbound 로케일/프롬프트 정책


## 원칙

- Admin UI는 영어 고정입니다.
- DB에는 번역 문장을 저장하지 않고, 언어 중립 데이터(`action`, `target`)만 저장합니다.
- 로케일과 프롬프트 튜닝은 외부 전송 메시지(Slack/Jira/Confluence/Notion/Webhook/Email)에만 적용합니다.


## 로케일 결정 순서

다음 우선순위로 outbound 로케일을 결정합니다.

1. 요청 override (`locale`)
2. integration policy `locale_default`
3. workspace `default_outbound_locale`
4. 최종 fallback `en`

workspace/policy의 `supported_locales`를 함께 검사합니다.


## API

- `GET /v1/workspaces/:key/outbound-settings`
- `PUT /v1/workspaces/:key/outbound-settings`
- `GET /v1/outbound-policies/:integration_type?workspace_key=...`
- `PUT /v1/outbound-policies/:integration_type`
- `POST /v1/outbound/render`


## Template Override 형식

```json
{
  "raw.search": {
    "en": "Searched raw logs for \"{q}\" ({count} results).",
    "ko": "원문 로그에서 \"{q}\"를 검색했습니다. (결과 {count}개)"
  }
}
```

규칙:

- override가 기본 템플릿보다 우선합니다.
- 해당 로케일 템플릿이 없으면 `en`으로 fallback 합니다.
- action key 템플릿이 없으면 안전한 기본 문구를 사용합니다.


## LLM Mode 주의사항

- `mode=llm`은 정책으로 켤 수 있지만, 운영에서는 공급자 가용성/비용/보안 검토 후 사용하세요.
- prompt에는 비밀값/자격증명을 넣지 마세요.
- LLM 실패 시 템플릿 모드로 안전하게 fallback 해야 합니다.
