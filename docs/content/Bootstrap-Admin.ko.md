# Bootstrap Admin 초기 설정

Claustrum은 첫 설치를 위한 bootstrap admin 흐름을 제공합니다.

## 초기 계정

- 첫 bootstrap 계정 이메일은 고정: `admin@example.com`
- `users` 테이블이 비어 있을 때만 bootstrap이 실행됩니다.
- 서버는 초기 비밀번호를 로그 채널에 1회 출력합니다.

출력 예시:

```text
Bootstrap admin created: admin@example.com
Initial password (shown once): <random-password>
```

## 첫 로그인 강제 설정

bootstrap 계정으로 로그인하면 setup 완료 전까지 기능을 사용할 수 없습니다:

1. 이메일 변경 (필수, `admin@example.com` 유지 불가)
2. 비밀번호 변경 (필수)
3. 이름 입력 (선택)

setup 완료 전 허용 API:
- `/v1/auth/me`
- `/v1/auth/complete-setup`
- `/v1/auth/logout`

그 외 `/v1/*` API는 `403`으로 차단됩니다.

## 재설치 / DB 초기화 동작

- DB를 초기화해서 `users`가 다시 비면 bootstrap이 재실행되고 새 초기 비밀번호를 1회 출력합니다.
- 사용자가 하나라도 있으면 bootstrap은 실행되지 않고 비밀번호도 출력하지 않습니다.

## 보안 권장사항

- bootstrap 비밀번호 로그는 민감 정보로 취급하세요.
- 로그인 후 즉시 실제 비밀번호로 교체하세요.
- 운영 환경에서는 로그 노출 범위를 최소화하세요.
