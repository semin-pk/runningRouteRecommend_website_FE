# Supabase 백엔드와 Amplify 프론트

## 배포 대상

- Supabase 프로젝트: `polerun-test` (`scdpsgypefxtjbrnmovk`)
- Edge Function: `route-agent`
- API base URL: `https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent`
- 경로 요청: `POST /api/query`
- 상태 확인: `GET /health`
- 프론트: 기존 Amplify 앱 `d26hsuzbpwq4zg`, `https://www.run2yourstyle.com/agent/`

새 프로젝트 생성은 무료 활성 프로젝트 2개 한도로 실패했습니다. 사용자가 선택한 기존 `polerun-test`에 함수 하나와 전용 secrets만 추가합니다. 테이블, 데이터, 기존 함수, 인증 설정 및 공통 secrets는 변경하지 않습니다.

Supabase Edge Functions는 TypeScript/Deno로 실행하므로 `supabase/functions/route-agent/`에 기존 Python 파이프라인을 이식했습니다. Python `backend/`는 로컬 실행 호환용으로 남겨둡니다. 별도 EC2/ECS 서버는 필요하지 않습니다. [Edge Functions 개요](https://supabase.com/docs/guides/functions)

## 런타임 Secrets

Supabase Dashboard의 Edge Functions secrets에 다음 값을 등록합니다. 실제 값은 Git에 저장하지 않습니다.

```text
ROUTE_AGENT_OPENAI_API_KEY
ROUTE_AGENT_KAKAO_REST_API_KEY
ROUTE_AGENT_TMAP_APP_KEY
ROUTE_AGENT_CORS_ORIGINS=https://www.run2yourstyle.com
```

기존 프로젝트의 다른 기능과 섞이지 않도록 `ROUTE_AGENT_` 이름만 사용합니다. `supabase/functions/.env.example`은 로컬 Edge Function 테스트용 예시입니다. Python 백엔드는 기존 `.env`의 접두사 없는 이름을 계속 사용합니다.

키가 없거나 잘못된 경우 외부 요청을 만들기 전에 HTTP 503과 안내를 반환합니다. 로그에는 API 키를 출력하지 않습니다. 카카오와 T map의 요청/응답 status, request id, 소요 시간 및 T map 경로 파라미터를 확인할 수 있습니다. [Secrets 관리](https://supabase.com/docs/guides/functions/secrets)

## 검증과 함수 배포

`route-agent/`에서 실행합니다. CLI는 해당 프로젝트에 접근 가능한 Supabase 계정으로 로그인되어 있어야 합니다.

```bash
npx --yes deno check supabase/functions/route-agent/index.ts
npx --yes deno test --allow-env supabase/functions/route-agent/pipeline_test.ts

supabase functions deploy route-agent \
  --project-ref scdpsgypefxtjbrnmovk \
  --use-api --no-verify-jwt
```

다른 함수를 삭제하는 `--prune`은 사용하지 않습니다. 함수 배포만 수행하며 DB migration이나 schema push를 실행하지 않습니다.

```bash
curl https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent/health

curl -X POST https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent/api/query \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://www.run2yourstyle.com' \
  -d '{"query":"서울역에서 20:00 약속 전에 꽃 선물을 사고 싶어","user_lat":37.5665,"user_lng":126.9780}'
```

`verify_jwt = false`로 기존 로그인 없는 경로 추천 호출을 유지합니다. 함수는 공개 API이며 CORS는 브라우저 출처 제한입니다. 인증이나 사용량 제한을 대신하지 않습니다. Supabase의 service-role/secret 키를 프론트에 넣지 않습니다. [함수 인증](https://supabase.com/docs/guides/functions/auth)

## 프론트 연결

단독 로컬 프로젝트를 운영 빌드할 경우 `frontend/.env.production.example`을 `.env.production`으로 복사한 뒤 지도 JavaScript 키를 채웁니다.

```env
VITE_KAKAO_MAP_KEY=실제_카카오_JavaScript_키
VITE_API_BASE_URL=https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent
```

기존 러닝 사이트 저장소에는 Supabase endpoint를 `scripts/build-route-agent.mjs`의 기본값으로 설정합니다. Amplify에서 `VITE_ROUTE_AGENT_API_BASE_URL`을 설정하면 그 주소가 우선합니다. 기존 `VITE_BACKEND_URL`은 원래 러닝 서비스용이므로 변경하지 않습니다. 지도 JavaScript 키는 기존 `VITE_KAKAO_JS_KEY`를 재사용할 수 있습니다.

통합 빌드는 기존 `dist/index.html`/`dist/assets/`를 유지하며 Route Agent만 `dist/agent/`에 추가합니다. 상세 프론트 절차는 기존 사이트 저장소의 `ROUTE_AGENT_DEPLOYMENT.md`를 확인합니다. `/agent`와 `/agent/`의 rewrite는 기존 SPA fallback보다 앞에 적용합니다.

## 실행 특성

- 기존 `cafe`, `route`, `stay_minutes` 등 응답 필드를 유지합니다.
- 자연어 행동을 최대 3개로 분리하고 행동별 후보 3개, 최대 27개 조합을 평가합니다. 목적지만 요청하면 경유지를 추가하지 않습니다.
- 목적지 주변 요청은 목적지 좌표에서 검색합니다. 나머지는 기존 직선 앵커 검색을 사용합니다.
- 요청 하나 안에서 같은 이동 구간의 API 결과를 재사용합니다. 다른 사용자의 요청과 결과를 공유하지 않습니다.
- 전체 요청은 120초, 개별 외부 API는 별도 제한으로 중단합니다. Supabase 무료 플랜의 150초 제한보다 먼저 원인 메시지를 반환하도록 구성했습니다. [실행 제한](https://supabase.com/docs/guides/functions/limits)
- 800m 이내 또는 T map status 11은 거리 기반 도보 추정으로 처리합니다.
- 타임라인의 탑승/하차 시각은 구간 소요시간 기반 예상입니다. 실제 지하철 시간표 API를 연동한 값이 아니며 `time_type=estimated`로 표시합니다.
- 카카오/T map 실패는 오류 응답으로 반환하며 출발 시각/장소를 꾸며내지 않습니다. 경로 검증 후 최종 문장 생성만 실패하면 검증된 일정으로 정해진 문장을 만듭니다.
- `cafe_arrive_time`, `cafe_depart_time`은 추천 출발 시각을 반영한 실제 계획의 대표 경유지 시각입니다. 직행이면 빈 문자열입니다. `to_cafe_minutes`는 대표 경유지까지 이동시간 합계로 이전 경유지 체류시간은 제외합니다.
- 요청이나 위치를 DB에 저장하지 않습니다.
