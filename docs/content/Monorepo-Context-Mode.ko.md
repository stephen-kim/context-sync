# 모노레포 컨텍스트 모드

Claustrum은 모노레포에서 메모리 스코프를 워크스페이스 단위로 3가지 정책으로 제공합니다.


## 모드

### 1) `shared_repo` (기본값)

- 활성 `project_key`는 repo 단위로 유지됩니다: `github:org/repo`
- 감지된 서브패스는 `metadata.subpath`로 저장됩니다
- recall/search 시 `current_subpath` 기반 가중치(boost)를 적용할 수 있습니다
- 서브프로젝트 간 공유가 필요하지만 노이즈를 줄이고 싶을 때 적합합니다

### 2) `split_on_demand` (분리 기본 권장)

- `monorepo_subproject_policies`에 등록된 subpath만 별도 프로젝트로 분리합니다
- 등록된 경우 `github:org/repo#apps/admin-ui`처럼 분리 key를 사용합니다
- 등록되지 않은 subpath는 repo key로 fallback 합니다
- 일부 앱만 격리하고 싶은 팀에 적합합니다

### 3) `split_auto` (고급)

- 감지된 subpath를 기준으로 `repo#subpath` 분리를 자동 적용할 수 있습니다
- 서브프로젝트 자동 생성 옵션이 켜져 있으면 미존재 key를 생성할 수 있습니다
- 경로 관리가 잘 된 대형 모노레포에 적합합니다


## Workspace Settings

- `monorepo_context_mode`: `shared_repo` | `split_on_demand` | `split_auto`
- `monorepo_subpath_metadata_enabled`: shared 모드에서 `metadata.subpath` 저장
- `monorepo_subpath_boost_enabled`: shared 모드에서 현재 서브패스 결과 가중치 적용
- `monorepo_subpath_boost_weight`: 가중치 배수 (기본값 `1.5`)


## 키 예시

- Shared: `github:acme/claustrum`
- Split: `github:acme/claustrum#apps/memory-core`


## 참고

- Resolver 우선순위는 유지됩니다: `github_remote > repo_root_slug > manual`
- split 계열 모드에서 subpath 감지 실패 시 repo key로 fallback 합니다
- Admin UI의 **Project Resolution Settings → Monorepo Context**에서 설정할 수 있습니다
