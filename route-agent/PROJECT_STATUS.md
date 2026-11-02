# route-agent 구현 현황

이 문서는 현재 구현 상태를 빠르게 파악하기 위한 작업 기록입니다. 기능을 추가하거나 동작을 바꾸면 같은 커밋/작업 단위에서 이 파일도 함께 최신화해야 합니다.

현재까지의 진척도 요약은 [PROGRESS.md](./PROGRESS.md)에 별도로 정리되어 있습니다.

운영 백엔드는 Supabase Edge Function으로 전환했습니다. 최신 운영 절차와 실제 endpoint는 [SUPABASE_DEPLOYMENT.md](./SUPABASE_DEPLOYMENT.md)에 정리되어 있습니다. 프론트는 기존 Amplify 앱의 `/agent/`에 통합합니다.

사용자가 기존 사이트의 Amplify 앱 ID `d26hsuzbpwq4zg`와 GitHub 저장소 `semin-pk/runningRouteRecommend_website_FE`를 제공했습니다. 해당 저장소의 `codex/route-agent-integration` 작업 브랜치에서 기존 사이트와 Route Agent를 함께 빌드하는 통합 구현 및 검증을 마쳤습니다. 제공된 앱 ID의 AWS 관리 권한으로 설정을 직접 조회하거나 변경한 상태는 아닙니다.

초기 통합 코드는 커밋 `7364649`로 [GitHub 작업 브랜치](https://github.com/semin-pk/runningRouteRecommend_website_FE/tree/codex/route-agent-integration)에 push했습니다. 이후 Supabase 연결 버전을 추가했으며 프론트의 실제 게시 여부는 운영 URL 응답으로 확인합니다.

2026-11-02 Supabase 연결 코드 `126a7e2`를 작업 브랜치와 운영 `main`에 반영했습니다. Supabase 함수는 ACTIVE이며 실제 API 요청은 성공했습니다. 현재 웹 `/agent/`는 404로 남아 있어 Amplify의 해당 커밋 빌드/배포 상태 확인이 필요합니다. GitHub의 Amplify webhook은 활성 상태이고 최근 응답은 202이나, 이것만으로 빌드 성공을 확인할 수는 없습니다.

## 운영 백엔드: Supabase

- 새 프로젝트 생성은 무료 활성 프로젝트 2개 한도로 실패했고, 사용자 선택에 따라 기존 `polerun-test` (`scdpsgypefxtjbrnmovk`)를 사용합니다.
- `route-agent` Edge Function을 배포했습니다. 기존 테이블/데이터/함수/공통 secrets는 변경하지 않았습니다.
- API base: `https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent`
- 상태 확인: `GET /health`, 경로 요청: `POST /api/query`
- TypeScript/Deno로 이해 → 행동 매핑 → 장소 검색 → 다중 경유 경로 평가 → 최종 메시지 단계를 구현했습니다.
- Supabase의 런타임 secrets는 `ROUTE_AGENT_OPENAI_API_KEY`, `ROUTE_AGENT_KAKAO_REST_API_KEY`, `ROUTE_AGENT_TMAP_APP_KEY`, `ROUTE_AGENT_CORS_ORIGINS`입니다. 다른 기능과 겹치지 않는 이름만 등록했습니다.
- 같은 요청 안에서 동일한 구간의 결과를 재사용하고 전체 요청을 120초로 제한합니다. API 실패는 안내 오류를 반환하며 경로를 꾸며내지 않습니다.
- 응답은 기존 필드를 유지합니다. 대표 장소 도착/출발 시간은 추천 일정 기준으로 계산하며, 직행 시 빈 문자열입니다.
- 지하철/버스 시각은 소요시간 기반 예상이며 `time_type=estimated`와 UI의 '예상' 표시로 구분합니다.
- 로그인 없는 기존 호출 흐름을 유지하는 공개 함수입니다. CORS를 인증 수단으로 사용하지 않으며 요청이나 위치를 DB에 저장하지 않습니다.
- 실제 `/health` 200과 서울역 직행/식당→카페 경유 요청 200을 확인했습니다. 식당 후보에서는 제과·디저트 전문 카테고리를 제외합니다.
- 기존 네 함수의 코드 해시와 JWT 설정이 이전과 같은 것을 확인했습니다. 프로젝트 Secrets 갱신으로 런타임 revision은 증가할 수 있으며, 이를 소스 변경으로 판단하지 않습니다.

## 현재 목표

자연어 요청을 받아 사용자의 현재 위치 또는 검색 지정 위치에서 약속 장소까지 이동하기 전 수행할 행동을 일정으로 변환합니다. 예를 들어 “서울역 16:00 약속인데 점심 먹고 카페에 있다가 가고 싶어”처럼 입력하면, 점심 먹기와 카페 대기를 분리해 식당과 카페 경유 일정을 계산합니다.

경유 행동이 없는 “오늘 8시까지 일산역에 가야해” 같은 요청은 직행 일정으로 처리하며, 임의의 경유지를 추가하지 않습니다.

## 백엔드

이하 Python/FastAPI 구성은 로컬 개발 호환용이며, 운영 함수는 `supabase/functions/route-agent/`가 기준입니다.

- FastAPI 앱은 `backend/main.py`에 있으며 `POST /api/query`와 배포용 `GET /health`를 제공합니다.
- CORS 기본값은 `http://localhost:5173`, `http://127.0.0.1:5173`, `https://www.run2yourstyle.com`입니다. `CORS_ORIGINS` 환경변수로 쉼표 구분 목록을 지정할 수 있습니다.
- `.env`는 `python-dotenv`로 실행 디렉토리와 관계없이 `backend/.env`를 명시적으로 로드합니다. 기존 프로세스 환경변수가 우선합니다.
- 외부 API 호출 전 해당 키의 누락/빈 값/형식을 검증합니다. 설정 오류는 키 값을 노출하지 않고 HTTP 503과 `detail` 안내로 반환합니다.
- 응답 필드:
  - `cafe`: 추천 장소 객체입니다. 초기 호환성 때문에 이름은 `cafe`로 유지합니다.
  - `route`: 도보/대중교통 경로와 이동 시간 요약입니다.
  - `stay_minutes`: 실제 계획에 반영된 체류 시간입니다.
  - `departure_time`: 추천 출발 시각입니다.
  - `planned_stay_minutes`: 장소 유형과 목적에 맞춘 계획 체류 시간입니다.
  - `arrival_buffer_minutes`: 약속 장소 도착 여유 시간입니다. 기본값은 10분입니다.
  - `actual_arrival_buffer_minutes`: Supabase에서 실제 계획 도착 시각 기준으로 계산한 약속까지의 여유 시간입니다.
  - `arrival_time`: 약속 장소 도착 목표 시각입니다.
  - `to_cafe_minutes`: 현재 위치에서 추천 장소까지 이동 시간입니다.
  - `cafe_arrive_time`: 운영 Supabase에서는 추천 일정 기준 대표 장소 도착 시각입니다.
  - `cafe_depart_time`: 약속 장소 도착 목표 시각에서 목적지 이동 시간을 뺀 추천 장소 출발 시각입니다.
  - `to_dest_minutes`: 추천 장소에서 목적지까지 이동 시간입니다.
  - `buffer_minutes`: `arrival_buffer_minutes`와 같은 도착 여유 시간입니다.
  - `tasks`: 자연어에서 추출한 행동 목록입니다.
  - `stops`: 추천된 경유 장소 목록입니다.
  - `timeline`: 출발, 이동, 경유지 체류, 약속 도착을 표현하는 동적 타임라인입니다. 이동 항목에는 `details`로 도보/버스/지하철 leg, 노선명, 탑승/하차 예상 시각이 포함될 수 있습니다.
  - `total_travel_minutes`: 전체 이동 시간입니다.
  - `total_stay_minutes`: 전체 체류 시간입니다.
  - `message`: 사용자에게 보여줄 최종 안내 문구입니다.

## 에이전트 파이프라인

`backend/agents.py`에 5단계 파이프라인이 구현되어 있습니다.

1. `understanding_agent`
   - GPT-4o Function Calling으로 자연어를 구조화합니다.
   - 추출 필드: `destination`, `appointment_time`, `tasks`, `place_type`, `conditions`, `purpose`, `departure_time`, `planned_stay_minutes`, `arrival_buffer_minutes`, `user_lat`, `user_lng`.
   - “점심 먹고 카페에 있다가”처럼 여러 행동이 있으면 말한 순서를 유지한 `tasks`로 분리합니다.
   - 목적지 이동/도착만 있는 요청은 `tasks`를 빈 배열로 유지해 직행 일정으로 처리합니다.
   - 사용자가 출발 시간을 말하지 않으면 `departure_time`은 `null`로 둡니다.
   - GPT가 체류 시간을 이상하게 주면 fallback 규칙을 사용합니다.

2. `place_agent`
   - `tasks`를 로컬 규칙으로 장소 유형이 있는 stop으로 매핑합니다.
   - 점심/밥/식사 → 식당, 카페/대기/작업 → 카페, 꽃/선물 → 꽃집 등으로 변환합니다.
   - 현재 위치와 목적지 사이 직선 경로의 25%, 50%, 75%, 100% 앵커 주변에서 카카오 Local keyword API를 호출합니다.
   - stop별 후보를 중복 제거 후 최대 3개 유지합니다.

3. `route_agent`
   - 목적지는 카카오 Local API로 좌표를 찾습니다.
   - stop이 없으면 `현재 위치 → 목적지` 직행 경로만 계산합니다.
   - 최대 3개 stop, stop별 후보 최대 3개를 조합해 평가합니다.
   - 경로는 `현재 위치 → stop1 → stop2 → ... → 목적지` 순서로 계산합니다.
   - 800m 이내 구간은 T map을 호출하지 않고 도보 경로로 계산합니다.
   - 800m 초과 구간은 T map 대중교통 API를 호출합니다.
   - 최종 선택된 경로는 계획된 각 구간 출발 시각을 `searchDttm`으로 넣어 한 번 더 조회하고, T map 응답의 legs에서 지하철 노선명, 버스 번호, 탑승/하차 예상 시각을 타임라인에 붙입니다.
   - T map이 `출발지와 도착지가 너무 가까움(status=11)`을 반환하면 도보 fallback으로 처리합니다.
   - 출발 시간이 없으면 약속 시간에서 `전체 이동 시간 + 전체 체류 시간 + 도착 여유 10분`을 빼서 추천 출발 시간을 계산합니다.
   - 출발 시간이 있으면 해당 출발 시간을 기준으로 계획 체류 시간이 가능한지 판단합니다.
   - 429 `QUOTA_EXCEEDED`가 나오면 불필요한 추가 후보 호출을 중단합니다.

4. `coordinator_agent`
   - GPT-4o 일반 chat completion으로 200자 이내 한국어 안내 메시지를 생성합니다.
   - 추천 장소, 출발 시간, 계획 체류 시간, 도착 여유 시간을 포함하도록 프롬프트가 설정되어 있습니다.
   - 경로 실패 시에는 추천을 꾸미지 않고 실패 원인을 반환합니다.

5. `run_pipeline`
   - 위 단계를 순서대로 실행하고 API 응답 형태로 정리합니다.

## 프론트엔드

- React + Vite + Tailwind CSS 구성입니다.
- `frontend/src/App.jsx`
  - 자연어 쿼리 입력
  - 브라우저 Geolocation으로 현재 위치 사용
  - 카카오맵 Places 서비스로 위치 검색 및 선택
  - `VITE_API_BASE_URL`의 `/api/query` 호출. 로컬 기본값은 `http://localhost:8000`입니다.
  - 로딩/에러 표시. 백엔드가 문자열 `detail`을 반환하면 실제 안내 문구를 표시합니다.
- `frontend/src/ResultCard.jsx`
  - AI 메시지
  - 추천 장소 이름/주소
  - 다중 stop이 있으면 추천 일정 목록
  - 추천 출발 시간
  - 계획 체류 시간
  - 도착 목표 시각과 도착 여유 시간
  - 카카오맵 길찾기 딥링크
- `frontend/src/Timeline.jsx`
  - `timeline` 배열이 있으면 출발, 이동, stop 체류, 약속 도착을 동적으로 표시합니다.
  - 이동 항목의 `details`가 있으면 도보/버스/지하철 뱃지, 노선명 또는 버스 번호, 구간별 탑승/하차 예상 시각을 표시합니다.
  - 기존 단일 장소 응답도 fallback UI로 표시합니다.
- `frontend/src/MapView.jsx`
  - 카카오맵 JS SDK 사용
  - 현재 위치, 모든 stop, 목적지 마커 표시
  - 직행 일정은 현재 위치와 목적지 마커만 표시
  - stop과 목적지 인포윈도우 표시
  - 모든 마커가 보이도록 `LatLngBounds`로 지도 범위를 조정합니다.

## 환경변수

백엔드 `backend/.env`:

```env
OPENAI_API_KEY=
KAKAO_REST_API_KEY=
TMAP_APP_KEY=
```

프론트엔드 `frontend/.env`:

```env
VITE_KAKAO_MAP_KEY=
VITE_API_BASE_URL=
```

운영 빌드는 `frontend/.env.production`에 `VITE_KAKAO_MAP_KEY`와 실제 HTTPS `VITE_API_BASE_URL`을 설정합니다. API 주소 누락 또는 HTTP 주소이면 운영 빌드를 중단합니다. 운영 assets 기본 경로는 `/agent/`, 개발 서버 경로는 `/`입니다.

## 배포 준비

- 기존 도메인이 CloudFront/S3를 사용하며 `/agent/`가 404인 것을 확인했습니다.
- 기존 사이트의 배포 플랫폼은 사용자 확인에 따라 Amplify로 정리했습니다. 관리형 S3/CloudFront를 직접 수정하는 대신 기존 Amplify 빌드에 `dist/agent/`를 추가합니다.
- 로컬 `runningRouteRecommend_website_FE` 저장소에 기존 사이트 빌드를 유지하는 `build:site`, agent 빌드 `build:agent`, `amplify.yml`과 진입 경로 rewrite 예시를 추가했습니다.
- 기존 러닝 사이트의 `VITE_BACKEND_URL`은 유지합니다. agent API는 배포된 Supabase 함수가 기본값이며 `VITE_ROUTE_AGENT_API_BASE_URL`로 override할 수 있습니다.
- 백엔드 서버가 없으므로 ECS Express Mode 기반 배포 절차와 `deployment/ecs-express-service.example.json`을 추가했습니다. 실제 리소스를 생성하지 않았습니다.
- `backend/Dockerfile`은 non-root 사용자로 포트 8000에서 실행합니다. 이미지에는 `.env`나 API 키를 포함하지 않습니다.
- `deployment/cloudfront-agent-entry.js`는 `/agent`와 `/agent/`만 `/agent/index.html`로 재작성합니다. 기존 함수가 있으면 해당 조건을 병합해야 합니다.
- Supabase 함수 배포와 전용 Secrets 설정은 완료했습니다. 프론트는 운영 브랜치 재배포 후 `/agent/`의 실제 응답을 확인해야 합니다. 별도 API 주소 설정이 없어도 Supabase endpoint를 기본값으로 사용합니다.

## 외부 API 로그

카카오와 T map 호출은 `INFO` 로그로 남습니다.

- 카카오 keyword search 요청/응답
- 카카오 destination search 요청/응답
- T map transit route 요청/응답
- 최종 선택 경로의 시간 지정 T map transit route 요청에는 `searchDttm`이 포함됩니다.
- 응답 status, 실제 요청 URL, T map request id, 응답 body 일부
- API 키는 로그에 출력하지 않습니다.

## 현재 동작상 주의점

- `backend/.env.example`의 키 값은 비어 있으므로 `.env`로 복사한 뒤 실제 키를 입력하고 백엔드를 재시작해야 합니다. 빈 `OPENAI_API_KEY`로 `Bearer ` 헤더를 만들던 오류는 호출 전 검증으로 처리합니다.
- API 키의 앞뒤 공백은 제거하고, 키 내부 공백/줄바꿈/비 ASCII 문자 등 헤더에 부적합한 값은 설정 오류로 처리합니다.
- T map 대중교통 API는 쿼터 초과 시 `429 QUOTA_EXCEEDED`를 반환합니다.
- 가까운 구간은 대중교통 API가 경로를 주지 않을 수 있어 도보 계산으로 대체합니다.
- 지하철/버스의 정확한 실시간 출발 시각은 T map 응답에 시간 필드가 있을 때만 그대로 표시합니다. 시간 필드가 없으면 계획 출발 시각과 leg 소요시간으로 계산한 예상 시각을 표시합니다.
- `cafe` 응답 필드는 과거 프론트 호환을 위해 남아 있지만 실제 의미는 “대표 추천 장소”입니다. 다중 stop에서는 마지막 경유지를 대표로 사용합니다.
- `to_cafe_minutes`, `cafe_arrive_time`, `cafe_depart_time`도 같은 호환성 맥락의 이름이며 실제 의미는 “추천 장소” 기준입니다.
- `stay_minutes`는 현재 “계획에 반영된 체류 시간”으로 사용합니다.

## 확인된 검증

- `backend/.venv/bin/python -m py_compile backend/agents.py backend/main.py` 통과
- HTTPS `VITE_API_BASE_URL`을 지정한 운영 빌드 통과 (`/agent/` assets 및 localhost API 미포함 확인)
- mock 경로로 자동 출발 시간과 사용자 지정 출발 시간 계산을 확인했습니다.
- API 키가 빈 경우 5개 외부 API 호출 지점 모두 HTTP 클라이언트 생성 전에 차단되는 것을 확인했습니다.
- 누락/형식 오류의 HTTP 503 응답, CORS 헤더 유지, 정상 키의 인증 헤더 보존을 mock으로 확인했습니다.
- 실행 중인 로컬 백엔드에 요청해 `OPENAI_API_KEY` 누락 안내가 반환되는 것을 확인했습니다. 실제 키가 비어 있어 외부 API를 이용한 경로 검색은 이번 검증에 포함하지 않았습니다.
- Docker 이미지 빌드 및 실제 컨테이너 실행 통과. `/health` 200, 운영 CORS preflight와 오류 응답, Asia/Seoul 시간 계산, non-root 실행 및 `.env` 미포함을 확인했습니다. 테스트 컨테이너는 종료했습니다.
- CloudFront 진입 경로 재작성을 검증했으며, 운영 API 주소 누락/HTTP 주소 빌드가 차단되는 것을 확인했습니다.
- 기존 러닝 사이트만 빌드하는 경우와 agent를 함께 빌드하는 경우를 모두 확인했습니다. 두 경우의 기존 루트 HTML이 동일하며 각각의 JS/CSS 파일이 유효한 경로에 존재합니다.
- Amplify 통합 빌드에서 기존 지도 키 재사용, 별도 HTTPS agent API 주소 삽입 및 localhost API 미포함을 확인했습니다. 검증에는 테스트용 주소를 사용했으며 실제 외부 API 요청은 수행하지 않았습니다.
- Supabase TypeScript 파이프라인 10개 테스트를 통과했습니다. 실제 배포 함수의 직행/다중 경유 요청이 모두 HTTP 200으로 완료되는 것을 확인했습니다.

## 앞으로 구현 시 문서 최신화 규칙

다음 변경이 있으면 반드시 이 문서를 갱신합니다.

- API 요청/응답 필드 변경
- 에이전트 단계 추가/삭제/계산식 변경
- 외부 API 호출 방식 변경
- 프론트 표시 항목 변경
- 환경변수 추가/변경
- 실행 방법 또는 주요 에러 처리 방식 변경

## 구현 운영 원칙

- 사용자 지시문을 그대로 기계적으로 구현하지 않고, 현재 목표와 코드 구조에 비춰 적합성을 판단합니다.
- 요청한 방식보다 더 안정적이거나 사용자 경험에 맞는 구현 방식이 명확하면 더 적합한 방식으로 조정해 진행합니다.
- API 스키마, 데이터 흐름, UX, 외부 API 호출 방식에 영향이 큰 변경은 구현 이유와 영향을 짧게 설명합니다.
- 요구가 모호하거나 잘못 구현하면 위험한 경우에는 진행 전에 확인 질문을 합니다.
- 구현 변경이 발생하면 이 문서도 함께 최신화합니다.
- 후속 배포 기능 변경 시 원본 프로젝트와 배포 저장소 `runningRouteRecommend_website_FE/route-agent/`의 소스 및 문서를 함께 반영해 배포본이 오래된 코드로 남지 않도록 합니다.
