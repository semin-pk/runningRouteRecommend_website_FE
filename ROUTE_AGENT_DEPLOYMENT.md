# 기존 Amplify 사이트에 Route Agent 추가

대상 앱은 사용자 제공 Amplify ID `d26hsuzbpwq4zg`, 도메인은 `https://www.run2yourstyle.com`입니다. AWS 계정에서 앱/브랜치 설정을 직접 조회한 상태는 아닙니다.

운영 백엔드는 Supabase 프로젝트 `polerun-test` (`scdpsgypefxtjbrnmovk`)의 Edge Function `route-agent`입니다. 기본 API 주소는 `https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent`이며 Python 서버를 별도로 만들 필요가 없습니다.

## 현재 배포 결과

2026-11-02 수정 커밋 `740d6be`를 운영 `main`에 병합/push하고 공개 웹에서 배포를 확인했습니다. `/agent/`, `/agent/index.html`, agent JS/CSS와 기존 `/`는 HTTP 200입니다. `/agent`는 `/agent/`로 이동합니다.

`/agent/deployment-info.json`의 빌드 커밋도 일치합니다. 단, rewrite 관리 API는 기존 빌드 역할의 `AccessDeniedException`으로 거부되어 `rewrites.applied=false`입니다. 현재 진입은 기본 디렉터리 index 처리로 동작합니다. 별도 rewrite 적용을 완료한 것으로 판단하지 않으며, 아래 두 규칙은 콘솔에서 수동 추가하거나 대상 앱에 한정해 빌드 역할 권한을 확보한 뒤 다시 실행해야 합니다.

공개 웹의 실제 카카오 위치 검색과 Supabase 경로 요청도 확인했습니다. 서울역 20:00 직행 예시는 HTTP 200, 임의 경유지 없음, 19:16 출발/19:50 도착/이동 34분이며 도보/1호선 상세와 지도가 표시됩니다. 데스크톱 1440px 및 모바일 390px 검증에서 가로 넘침이나 런타임 오류는 없었습니다.

## 빌드 구조

기존 사이트의 소스, 라우터와 Vite 설정은 유지합니다. `npm run build`는 기존 사이트를 먼저 빌드한 뒤, 설정된 경우 route-agent를 추가합니다.

```text
dist/
  index.html          # 기존 러닝 사이트
  assets/             # 기존 사이트 JS/CSS
  agent/
    index.html        # Route Agent
    assets/           # Route Agent JS/CSS
```

두 페이지는 각각 React와 스타일을 로드합니다. agent 페이지는 `/agent/index.html`이며, 진입 URL `/agent`와 `/agent/`는 Amplify rewrite로 연결합니다. 브라우저에서 이동할 때는 `<a href="/agent/">`처럼 일반 링크를 사용합니다.

`route-agent/`에는 기존 로컬 프로젝트에서 가져온 프론트/백엔드 소스가 들어 있습니다. 실제 `.env`, API 키, `.venv`, `node_modules`, 이전 빌드 결과는 복사하지 않았습니다. GitHub 배포용 소스를 수정할 때는 이 디렉토리를 사용합니다.

## Amplify 설정

1. 앱 `d26hsuzbpwq4zg`의 기존 도메인 및 배포 브랜치 연결을 유지합니다.
2. 저장소의 `amplify.yml`을 빌드 설정으로 사용합니다. 아티팩트 디렉토리는 `dist`이며 Node.js 22를 사용합니다.
3. 환경변수를 다음처럼 설정하고 다시 빌드합니다.

| 변수 | 값 |
| --- | --- |
| `VITE_BACKEND_URL` | 기존 러닝 서비스 백엔드 주소. 기존 값 유지 |
| `VITE_KAKAO_JS_KEY` | 기존 카카오 JavaScript 키. 기존 값 유지 |
| `VITE_ROUTE_AGENT_API_BASE_URL` | 선택 항목. 기본 Supabase 함수 주소를 바꿀 때만 지정. `/api/query`는 붙이지 않음 |
| `VITE_KAKAO_MAP_KEY` | 선택 항목. 미설정 시 기존 `VITE_KAKAO_JS_KEY` 재사용 |

별도 API 주소를 지정하지 않아도 배포된 Supabase 함수 주소로 agent를 함께 빌드합니다. HTTP 주소나 잘못된 주소를 override로 지정하면 빌드를 실패시킵니다. 두 앱의 assets와 HTML은 별도 디렉토리로 유지합니다.

OpenAI/Kakao REST/T map 키는 Amplify의 프론트 빌드 환경변수에 넣지 않습니다. 해당 키는 Supabase의 `ROUTE_AGENT_` 접두사 secrets로 설정합니다.

4. Amplify의 Rewrites and redirects에 `amplify-agent-rules.json`의 두 규칙을 기존 SPA fallback 규칙보다 앞에 추가합니다. 기존 로그인/마이페이지 등의 규칙은 유지합니다.
5. 새 배포가 성공하면 `/`, `/login`, `/agent/`, `/agent/index.html`과 두 앱의 assets를 확인합니다.

## Rewrite 자동 적용

`amplify.yml`은 프론트 빌드 뒤 `scripts/configure-amplify-agent.mjs`를 실행합니다. 운영 `main` 빌드에서 Amplify의 기존 빌드 역할로 현재 앱 규칙을 읽고, `/agent`와 `/agent/`만 `/agent/index.html`로 연결합니다. 기존 다른 규칙은 유지하며 변경 후 다시 읽어 적용 결과를 검증합니다. 이미 같은 규칙이면 업데이트를 생략합니다.

빌드 역할에는 대상 앱에 대한 `amplify:GetApp`, `amplify:UpdateApp` 권한이 필요합니다. 스크립트는 IAM 역할이나 권한을 임의로 생성하지 않습니다. 권한이 없으면 `needs-aws-permission`을 기록하고 정적 파일 배포는 계속 진행합니다. 이 상태를 rewrite 적용 성공으로 판단하면 안 됩니다.

`/agent/deployment-info.json`에 빌드 커밋과 rewrite 적용 결과를 기록합니다. API 키나 AWS 자격증명은 포함하지 않습니다. `rewrites.applied=true`가 관리 규칙 적용 확인이고, 실제 URL 응답은 배포 후 별도로 확인합니다.

## Linux 빌드 검증

2026-11-02 실패 원인은 Node 설치가 아닌 agent의 lock 파일 누락이었습니다. Amplify와 같은 Linux x64 / Node 22.23.4 / npm 10에서 `@emnapi/core@1.11.3`, `@emnapi/runtime@1.11.3` 누락을 재현했습니다. 기존 프레임워크 버전을 유지한 채 의존성 버전을 고정하고 해당 환경에서 lock 파일을 재생성했습니다.

```bash
docker build --platform linux/amd64 \
  -f deployment/amplify-build.Dockerfile \
  -t route-agent-amplify-check .
```

이 검증은 루트/agent의 깨끗한 `npm ci`, rewrite 병합 테스트, 통합 운영 빌드를 수행합니다. 실제 `.env`와 자격증명은 이미지에 포함하지 않습니다.

`Cursor/rrR/runningRouteRecommend_website_FE`는 상위 `packages/shared`를 사용하는 모노레포의 FE 폴더입니다. 해당 작업 폴더를 검증할 때는 `rrR/`에서 아래 명령을 사용합니다. 기존 공유 모듈과 FE 소스를 수정할 필요가 없습니다.

```bash
docker build --platform linux/amd64 \
  -f runningRouteRecommend_website_FE/deployment/amplify-build.monorepo.Dockerfile \
  -t route-agent-monorepo-check .
```

별도 Docker ignore 파일로 FE와 공유 소스만 전달하며 BE/모바일 변경이나 실제 `.env`는 포함하지 않습니다. 실제 Amplify 로그가 clone하는 저장소는 별도의 `semin-pk/runningRouteRecommend_website_FE`이므로 배포 push는 해당 저장소에만 수행합니다.

`/agent/<*>` 전체를 index.html로 rewrite하지 않습니다. 그러면 JS/CSS 요청까지 HTML로 바뀔 수 있습니다. `agent/assets/`의 파일은 그대로 제공합니다. [Amplify rewrite 순서](https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html), [빌드 설정](https://docs.aws.amazon.com/amplify/latest/userguide/yml-specification-syntax.html)

## Supabase 백엔드

기존 러닝 서비스 백엔드는 유지하고 Route Agent의 API만 Supabase Edge Function에서 처리합니다. 기존 Supabase 프로젝트에는 이 함수와 전용 secrets만 추가하며 DB 테이블이나 다른 함수는 수정하지 않습니다.

함수 소스는 `route-agent/supabase/functions/route-agent/`이고, 런타임 secrets는 다음과 같습니다.

```text
ROUTE_AGENT_OPENAI_API_KEY
ROUTE_AGENT_KAKAO_REST_API_KEY
ROUTE_AGENT_TMAP_APP_KEY
ROUTE_AGENT_CORS_ORIGINS=https://www.run2yourstyle.com
```

함수 주소 아래의 `/health`가 상태 확인, `/api/query`가 경로 요청입니다. 배포와 테스트 명령은 [route-agent/SUPABASE_DEPLOYMENT.md](./route-agent/SUPABASE_DEPLOYMENT.md)에 있습니다. `route-agent/backend/`는 기존 Python 로컬 개발 호환용입니다.

## 로컬 확인

```bash
npm ci
npm --prefix route-agent/frontend ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

`http://127.0.0.1:4173/`와 `http://127.0.0.1:4173/agent/`에서 각 페이지를 확인합니다. 실제 경로 검색은 유효한 백엔드 주소와 API 키가 있어야 합니다.
