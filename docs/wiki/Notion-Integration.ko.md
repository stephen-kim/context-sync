# Notion 연동


## 목적

Notion을 외부 컨텍스트 소스로 활용합니다.
- 코딩 세션 중 문서 검색/열람
- (선택) merge 시점 문서 자동 반영


## 준비물

- Notion 통합 토큰
  - Notion 개발자 콘솔에서 internal integration 생성
- 통합에 공유된 대상 페이지/데이터베이스
- memory-core `workspace_key` (예: `personal`)


## 환경변수 (fallback)

- `MEMORY_CORE_NOTION_TOKEN`
- `MEMORY_CORE_NOTION_DEFAULT_PARENT_PAGE_ID`
- `MEMORY_CORE_NOTION_WRITE_ENABLED`


## 단계별 설정

1. Notion 통합 생성 및 권한 부여
- internal integration 생성 후 토큰(`secret_...`)을 복사합니다.
- 읽거나 쓸 페이지/DB를 해당 integration에 공유합니다.

2. Admin UI에서 저장
- `admin-ui` -> Integrations -> Notion으로 이동
- 저장 값:
  - `enabled=true`
  - `token`
  - `default_parent_page_id` (선택)
  - `write_enabled` (write API 사용 시)
  - 선택 hook 옵션: `write_on_commit`, `write_on_merge`

3. API로 저장(선택)

```bash
curl -X PUT "$MEMORY_CORE_URL/v1/integrations" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_key": "personal",
    "provider": "notion",
    "enabled": true,
    "reason": "notion 컨텍스트 + merge write-back 활성화",
    "config": {
      "token": "secret_xxx",
      "default_parent_page_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "write_enabled": true,
      "write_on_merge": true
    }
  }'
```

4. API 검증

```bash
curl -G "$MEMORY_CORE_URL/v1/notion/search" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "q=architecture" \
  --data-urlencode "limit=5"
```

```bash
curl -G "$MEMORY_CORE_URL/v1/notion/read" \
  -H "Authorization: Bearer $MEMORY_CORE_API_KEY" \
  --data-urlencode "workspace_key=personal" \
  --data-urlencode "page_id=<notion-page-id-or-url>" \
  --data-urlencode "max_chars=2000"
```

5. MCP 도구 검증
- `notion_search({ q, limit? })`
- `notion_read({ page_id, max_chars? })`
- `notion_context({ q?, page_id?, limit?, max_chars? })`


## 설정 키

- `token`
- `default_parent_page_id`
- `write_enabled`
- `write_on_commit`
- `write_on_merge`


## API 엔드포인트

read/search:
- `GET /v1/notion/search?workspace_key=<ws>&q=<query>&limit=10`
- `GET /v1/notion/read?workspace_key=<ws>&page_id=<id-or-url>&max_chars=4000`

write (admin 전용):
- `POST /v1/notion/write`

예시:

```json
{
  "workspace_key": "personal",
  "title": "Merge Summary",
  "content": "변경 내용 및 의사결정 요약",
  "page_id": "기존 페이지 업데이트 시 선택",
  "parent_page_id": "신규 생성 시 선택"
}
```


## 권한 및 감사 로그

- Notion read/search: workspace member 권한
- Notion write: workspace admin + `MEMORY_CORE_NOTION_WRITE_ENABLED=true`
- 감사 이벤트:
  - `notion.search`
  - `notion.read`
  - `notion.write`


## Merge 기반 Write (권장)

로컬 git 훅보다 CI(GitHub Actions) 기반 merge 트리거 write를 권장합니다.

이유:
- 실행 환경/시크릿 일관성
- 개발자 로컬 환경 차이 최소화
- 훅 실패로 개발 흐름이 막히는 위험 감소

권장 플로우:
1. `main` 브랜치 push(merge) 트리거
2. 커밋/PR 요약 생성
3. `/v1/notion/write` 호출
4. 워크플로 로그에 결과 기록

참고 워크플로:
- `.github/workflows/notion-merge-sync.yml`


## env vs Admin UI 우선순위

- 기본: Admin UI 워크스페이스 설정이 env fallback보다 우선합니다.
- 잠금 옵션:
  - `MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS=notion`
  - 잠금 시 Admin UI 수정이 거부되고 env-only 모드가 강제됩니다.


## 트러블슈팅

- search/read 설정 오류
  - token, 페이지 공유, `enabled=true` 확인
- write 실패
  - workspace admin 권한 + `write_enabled=true` 확인
- merge 훅 write 미동작
  - `write_on_merge=true` 및 hook/event forwarding 설정 확인
