# www.run2yourstyle.com/agent 배포

현재 배포 방식은 **Supabase Edge Function + 기존 Amplify 사이트**입니다. 실제 endpoint와 최신 절차는 [SUPABASE_DEPLOYMENT.md](./SUPABASE_DEPLOYMENT.md)를 사용합니다. 아래 ECS/S3 절차는 이전 방식의 참고 기록이며 현재 배포에는 사용하지 않습니다.

## Amplify 배포 플랫폼 확인

사용자가 기존 러닝 사이트의 Amplify 앱 ID를 `d26hsuzbpwq4zg`, 연결 저장소를 `semin-pk/runningRouteRecommend_website_FE`의 `main` 브랜치로 알려주었습니다. 운영 프론트는 이 Amplify 앱의 빌드에 통합하는 방식으로 진행합니다. AWS 관리 콘솔의 앱 연결/환경변수/배포 상태는 아직 직접 조회하지 않았습니다.

로컬의 `../runningRouteRecommend_website_FE/`에 해당 저장소를 받아 기존 사이트 빌드와 Route Agent 빌드를 연결했습니다. 해당 저장소의 `ROUTE_AGENT_DEPLOYMENT.md`, `amplify.yml`, `amplify-agent-rules.json`을 사용합니다.

- 기존 `dist/index.html`과 `dist/assets/`는 러닝 사이트용으로 유지합니다.
- Route Agent는 별도 HTML/JS/CSS를 `dist/agent/`에 추가합니다.
- Amplify에 `VITE_ROUTE_AGENT_API_BASE_URL`을 실제 FastAPI HTTPS 주소로 설정하면 함께 빌드합니다.
- 기존 `VITE_BACKEND_URL`, `VITE_KAKAO_JS_KEY`는 유지합니다. 지도 키는 필요 시 기존 JavaScript 키를 재사용합니다.
- FastAPI 서버가 아직 없으면 기존 사이트만 빌드하며 `/agent`는 활성화하지 않습니다.
- `/agent`, `/agent/`를 `/agent/index.html`로 rewrite하는 규칙을 기존 SPA fallback보다 앞에 추가해야 합니다.

Amplify 관리 S3 버킷이나 CloudFront 배포를 직접 수정하지 않습니다. 아래의 S3 업로드/CloudFront 함수 절차는 직접 관리하는 호스팅을 선택할 경우에만 적용하는 참고 내용입니다. 백엔드 컨테이너/ECS 준비 절차는 Amplify 프론트와도 함께 사용할 수 있습니다.

## 현재 상태

2026-11-02 확인 결과 `www.run2yourstyle.com`은 CloudFront/S3로 서비스 중이며 `/agent/`는 404를 반환합니다. 이 프로젝트는 `/agent/` 프론트 빌드, HTTPS API 주소 설정, 컨테이너 백엔드 배포 설정까지 준비되었습니다. AWS 계정에 접속해 업로드하거나 서버를 생성한 상태는 아닙니다.

구성은 다음과 같습니다.

- 프론트: 기존 S3 버킷의 `agent/` 경로 → 기존 CloudFront → `https://www.run2yourstyle.com/agent/`
- 백엔드: ECS Express Mode가 제공하는 별도 HTTPS 주소 → FastAPI의 `POST /api/query`
- 상태 확인: 백엔드의 `GET /health`

기존 사이트의 도메인/DNS는 유지합니다. 백엔드 요청은 프론트의 `VITE_API_BASE_URL`로 직접 전송하므로 CloudFront에 API용 오리진을 추가할 필요가 없습니다.

## 1. 필요한 정보와 도구

- 기존 CloudFront 배포의 ID, S3 오리진 버킷명 및 Origin path
- 해당 AWS 계정으로 로그인된 최신 AWS CLI v2
- 실행 중인 Docker와 Buildx
- 백엔드의 OpenAI/Kakao REST/T map 키 및 프론트의 Kakao JavaScript 키

CloudFront 콘솔에서 대체 도메인에 `www.run2yourstyle.com`이 있는 배포를 선택하고 Origins에서 S3 버킷과 Origin path를 확인합니다. Origin path가 `/site`처럼 설정되어 있다면 아래 S3 경로도 `site/agent/`로 조정합니다.

Mac에 CLI가 없다면 설치하고 AWS 공식 로그인 절차로 이 Mac을 인증합니다. 비밀 액세스 키를 채팅이나 프로젝트 파일에 넣지 않습니다.

```bash
brew install awscli
aws login
aws sts get-caller-identity
```

ECS Express Mode는 Fargate, ALB 등의 리소스를 만들며 해당 AWS 사용료가 발생합니다. App Runner는 신규 고객 접수가 종료되어 신규 배포 대상으로 사용하지 않습니다. [AWS 서비스 설명](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html), [App Runner 공지](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)

## 2. 백엔드 이미지 만들기

아래 명령은 `route-agent/`에서 실행합니다. 리전은 실제 사용할 리전으로 지정합니다. ECR 저장소 생성은 최초 한 번만 수행합니다.

```bash
export AGENT_AWS_REGION=ap-northeast-2
export AGENT_AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AGENT_REGISTRY="${AGENT_AWS_ACCOUNT_ID}.dkr.ecr.${AGENT_AWS_REGION}.amazonaws.com"

aws ecr create-repository \
  --repository-name route-agent-backend \
  --region "$AGENT_AWS_REGION"

aws ecr get-login-password --region "$AGENT_AWS_REGION" | \
  docker login --username AWS --password-stdin "$AGENT_REGISTRY"

docker buildx build --platform linux/amd64 \
  --tag "$AGENT_REGISTRY/route-agent-backend:latest" \
  --push backend
```

이미지에는 Python 코드와 의존성만 포함합니다. 로컬 `.env`, `.venv`와 API 키는 이미지에 포함하지 않습니다. 컨테이너 포트는 `8000`, 실행 명령은 Dockerfile에 설정되어 있습니다.

## 3. 백엔드 생성

SSM Parameter Store에서 아래 세 항목을 같은 리전의 `SecureString`으로 만들고 실제 키를 입력합니다.

```text
/route-agent/OPENAI_API_KEY
/route-agent/KAKAO_REST_API_KEY
/route-agent/TMAP_APP_KEY
```

ECS 콘솔의 Express mode에서 ECR 이미지를 선택해 서비스를 생성합니다. 컨테이너 포트는 `8000`, 헬스 체크 경로는 `/health`, 공개 HTTPS 접근을 사용합니다. 환경변수 `CORS_ORIGINS`는 `https://www.run2yourstyle.com`으로 설정하고 위 파라미터를 같은 이름의 컨테이너 secrets로 연결합니다.

Task execution role에는 `AmazonECSTaskExecutionRolePolicy`와 위 파라미터를 읽는 `ssm:GetParameters` 권한이 필요합니다. 고객 관리 KMS 키로 암호화했다면 해당 키의 `kms:Decrypt` 권한도 필요합니다. Infrastructure role은 콘솔에서 Express Mode용 역할을 생성하거나 기존 역할을 선택합니다. [AWS 콘솔 절차](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-first-run.html)

CLI로 생성하려면 `deployment/ecs-express-service.example.json`을 `deployment/ecs-express-service.json`으로 복사한 뒤 `ACCOUNT_ID`, `REGION`, 이미지 URI와 역할 ARN을 실제 값으로 수정합니다. 역할과 파라미터는 먼저 생성되어 있어야 합니다.

```bash
aws ecs create-express-gateway-service \
  --region "$AGENT_AWS_REGION" \
  --cli-input-json file://deployment/ecs-express-service.json
```

템플릿은 0.25 vCPU/512 MiB, 최소 1개/최대 2개 태스크입니다. `ACTIVE` 및 정상 헬스 체크를 확인한 뒤 콘솔의 실제 HTTPS endpoint를 기록합니다. 생성된 ALB의 idle timeout은 다중 외부 API 호출을 고려해 `300`초로 설정합니다. 이 값은 개별 httpx API 타임아웃과 별개입니다.

```bash
curl https://YOUR_BACKEND_HOST/health
```

정상 응답은 `{"status":"ok"}`입니다. 헬스 체크는 API 키의 유효성이나 외부 경로 탐색 성공을 검증하지 않습니다.

## 4. 프론트 운영 빌드

```bash
cd frontend
cp -n .env.production.example .env.production
```

`frontend/.env.production`을 다음과 같이 설정합니다. `VITE_API_BASE_URL`은 실제 백엔드 HTTPS 주소이며 `/api/query`는 붙이지 않습니다.

```env
VITE_KAKAO_MAP_KEY=실제_카카오_JavaScript_키
VITE_API_BASE_URL=https://YOUR_BACKEND_HOST
```

OpenAI/Kakao REST/T map 키는 프론트 환경변수에 넣지 않습니다. `VITE_` 변수는 공개되는 빌드 결과물에 포함됩니다. 카카오맵 JavaScript 키에는 허용 웹 도메인으로 `https://www.run2yourstyle.com`을 등록합니다. `/agent`는 도메인 등록 값에 포함하지 않습니다.

```bash
npm install
npm run build
```

빌드는 `/agent/assets/...` 경로로 JS/CSS를 생성합니다. 운영 API 주소가 없거나 HTTPS가 아니면 빌드가 중단됩니다. 환경변수 변경은 반드시 재빌드해야 반영됩니다. `npm run dev`는 기존대로 로컬 `/` 경로에서 실행하며 API 주소를 지정하지 않으면 `http://localhost:8000`을 사용합니다.

## 5. S3 업로드

다시 `route-agent/`에서 실행합니다. 실제 버킷명과 CloudFront 배포 ID를 입력합니다. `AGENT_S3_PREFIX`는 확인한 Origin path에 맞춥니다.

```bash
export AGENT_SITE_BUCKET=YOUR_EXISTING_BUCKET
export AGENT_DISTRIBUTION_ID=YOUR_EXISTING_DISTRIBUTION_ID
export AGENT_S3_PREFIX=agent

aws s3 sync frontend/dist/assets/ \
  "s3://$AGENT_SITE_BUCKET/$AGENT_S3_PREFIX/assets/" \
  --cache-control 'public,max-age=31536000,immutable'

aws s3 cp frontend/dist/index.html \
  "s3://$AGENT_SITE_BUCKET/$AGENT_S3_PREFIX/index.html" \
  --cache-control 'no-cache' \
  --content-type 'text/html; charset=utf-8'
```

이 명령은 기존 사이트의 루트 파일을 덮어쓰거나 삭제하지 않고 `agent/` 파일만 업로드합니다. 새 assets를 먼저 올린 뒤 index.html을 올립니다.

## 6. /agent 진입 경로 연결

S3 website 오리진의 하위 디렉토리 index가 이미 동작하면 `agent/index.html` 업로드만으로 `/agent/`에 접근할 수 있습니다.

REST 오리진 등에서 `/agent/index.html`만 열리는 경우 `deployment/cloudfront-agent-entry.js`를 CloudFront Function으로 게시해 해당 behavior의 viewer request 이벤트에 연결합니다. `/agent`와 `/agent/`만 `/agent/index.html`로 바꾸고 기존 사이트의 다른 경로는 그대로 전달합니다. 이미 viewer request 함수가 있다면 기존 함수에 이 조건을 병합합니다. 기존 함수 연결을 덮어쓰지 않습니다. [AWS URL 재작성 설명](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_url_rewrite_single_page_apps_section.html)

캐시는 해당 경로만 무효화합니다.

```bash
aws cloudfront create-invalidation \
  --distribution-id "$AGENT_DISTRIBUTION_ID" \
  --paths '/agent' '/agent/*'
```

## 7. 최종 확인

```bash
curl -I https://www.run2yourstyle.com/agent/

curl -X POST https://YOUR_BACKEND_HOST/api/query \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://www.run2yourstyle.com' \
  -d '{"query":"서울역에서 16:00 약속 전에 꽃 선물을 사고 싶어","user_lat":37.5665,"user_lng":126.9780}'
```

브라우저에서 `/agent/` 접속, 지도 SDK 로딩, 위치 허용/위치 검색, 경로 추천을 확인합니다. 개발자 도구의 요청 주소가 `localhost`가 아니라 실제 HTTPS 백엔드여야 합니다. 기존 사이트의 `/`도 함께 확인합니다.
