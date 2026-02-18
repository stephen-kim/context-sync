# Admin Extraction 설정

Admin UI는 영어 고정입니다.

UI 자체 다국어(i18n)는 적용하지 않으며, 로케일 설정은 외부 outbound 메시지용입니다.


## 설정 위치

Admin Console에서 다음 섹션을 사용합니다.

- `Project Resolution Settings` -> Extraction Pipeline
- `Decision Keyword Policies`
- `Decisions`


## Extraction Pipeline 설정 항목

- `enable_activity_auto_log`
  - 모든 commit/merge에서 `activity` memory 생성
- `enable_decision_extraction`
  - 비동기 LLM decision 추출 실행
- `decision_extraction_mode`
  - `llm_only`: 최근순 처리
  - `hybrid_priority`: 점수 높은 이벤트 우선 처리
- `decision_default_status`
  - LLM이 만든 decision의 기본 상태
- `decision_auto_confirm_enabled`
  - 자동 확정 옵션
- `decision_auto_confirm_min_confidence`
  - 자동 확정 confidence 임계치
- `decision_batch_size`
  - 배치당 최대 처리 이벤트 수
- `decision_backfill_days`
  - 처리 대상 lookback 기간


## Keyword Policies (스케줄링 전용)

정책 항목:

- positive/negative keywords
- positive/negative file path patterns
- positive/negative weights
- enabled toggle

키워드 정책은 LLM job 우선순위에만 사용됩니다.

결정 여부 자체를 키워드가 확정하지 않습니다.


## Decisions 패널

제공 기능:

- 필터: project, status, confidence 범위
- evidence 확인: `raw_event_id`, `commit_sha`
- 액션: `Confirm`, `Reject`


## 추천 기본값

- `enable_activity_auto_log = true`
- `enable_decision_extraction = true`
- `decision_extraction_mode = llm_only`
- `decision_default_status = draft`
- `decision_auto_confirm_enabled = false`
- `decision_auto_confirm_min_confidence = 0.90`
- `decision_batch_size = 25`
- `decision_backfill_days = 30`
