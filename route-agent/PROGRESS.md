# route-agent 진척도 보고서

작성일: 2026-11-02

## 전체 진척도

Amplify 실패 로그의 lock 누락을 Linux x64 / Node 22.23.4에서 재현하고 수정했습니다. 동일 환경의 깨끗한 `npm ci`와 통합 빌드가 통과했습니다. 사용자가 지정한 `Cursor/rrR` 모노레포 FE에도 수정사항을 반영하고 상위 공유 패키지를 포함해 빌드를 확인했습니다. rewrite 자동 적용은 Amplify 빌드 역할 권한으로 수행하고 적용 여부를 배포 메타데이터로 확인합니다.

최신 운영 백엔드는 Supabase `polerun-test`의 `route-agent` Edge Function입니다. TypeScript 이식, 전용 Secrets 등록, 실제 함수 배포와 직행/다중 경유 API 200 검증을 완료했습니다. 기존 Python 백엔드는 로컬 개발 호환용으로 유지합니다.

연결 코드는 커밋 `126a7e2`로 GitHub의 운영 `main`에 반영했습니다. 현재 `/agent/`의 HTTP 응답은 아직 404이며, Amplify 빌드/배포 상태를 추가 확인해야 합니다. 백엔드 배포 완료와 웹 공개 완료는 구분합니다.

현재 프로젝트는 초기 구조 세팅을 넘어, 자연어 기반 경유 일정 추천 MVP가 동작하는 단계까지 구현되었습니다. 단일 장소 추천에서 출발해 현재는 사용자의 행동을 분리하고, 각 행동을 장소 유형으로 매핑한 뒤 다중 경유 일정을 계산하는 구조로 확장되었습니다.

체감 진척도는 다음과 같습니다.

- 프로젝트 구조 및 실행 환경: 완료
- 백엔드 API 기본 구조: 완료
- 자연어 이해 및 일정 파이프라인: 1차 구현 완료
- 카카오 장소 검색 연동: 구현 완료
- T map 대중교통 경로 연동: 구현 완료, 단 API 쿼터/권한 상태에 영향 받음
- 도보 + 대중교통 혼합 경로 처리: 구현 완료
- 출발 시간 자동 산정: 구현 완료
- 다중 행동 기반 일정 추천: 구현 완료
- 경유 행동이 없는 직행 일정 처리: 구현 완료
- 프론트 결과 카드, 타임라인, 지도 표시: 구현 완료
- 이동 타임라인 대중교통 상세 표시: 1차 구현 완료
- 환경변수 로드 경로 고정, API 키 검증 및 웹 오류 안내: 구현 완료
- `www.run2yourstyle.com/agent/` 배포 준비: 완료, 실제 AWS 배포는 미수행
- 기존 Amplify 앱 `d26hsuzbpwq4zg` / 러닝 사이트 저장소 통합: 구현 및 빌드 검증 완료, 백엔드 및 콘솔 설정 필요
- 초기 통합 코드 GitHub push: `codex/route-agent-integration`, 커밋 `7364649`. 이후 Supabase 연결 버전 추가
- Supabase Edge Function 이식/배포: 완료. 파이프라인 10개 테스트 및 실제 외부 API 연동 검증 통과
- 실사용 품질 검증 및 예외 케이스 보강: 진행 필요

## 구현 완료 항목

### 프로젝트 구성

- `route-agent` 프로젝트 디렉토리 구성 완료
- `backend`, `frontend` 분리
- FastAPI, React, Vite, Tailwind CSS 기반 세팅 완료
- 백엔드/프론트 환경변수 예시 파일 구성 완료
- 실행 방법 문서화 완료

### 백엔드 API

- FastAPI 앱 생성
- CORS 설정
- 실행 위치와 관계없이 `backend/.env` 로드 (프로세스 환경변수 우선)
- 빈 API 키/잘못된 헤더 값 사전 검증, 설정 오류 HTTP 503 응답 및 프론트 안내
- `POST /api/query` 엔드포인트 구현
- 응답 스키마 확장 완료
- 운영 도메인 CORS 및 `GET /health` 추가

현재 주요 응답 필드는 다음을 포함합니다.

- `cafe`: 대표 추천 장소
- `route`: 경로 요약
- `tasks`: 자연어에서 추출한 행동 목록
- `stops`: 추천된 경유 장소 목록
- `timeline`: 동적 타임라인 데이터
- `departure_time`: 추천 출발 시각
- `arrival_time`: 약속 장소 도착 목표 시각
- `planned_stay_minutes`, `total_stay_minutes`
- `to_cafe_minutes`, `to_dest_minutes`
- `cafe_arrive_time`, `cafe_depart_time`
- `message`

### 에이전트 파이프라인

- `understanding_agent`
  - GPT-4o Function Calling 기반 자연어 구조화
  - 목적지, 약속 시간, 출발 시간, 도착 여유 시간 추출
  - `tasks` 배열 추출

- `plan_tasks_to_stops`
  - 행동을 장소 유형으로 매핑
  - 예: 점심/식사 → 식당, 카페/대기 → 카페, 꽃/선물 → 꽃집

- `place_agent`
  - 카카오 Local API 검색
  - 현재 위치와 목적지 사이 경로 앵커 기반 검색
  - stop별 후보 최대 3개 수집

- `route_agent`
  - 다중 stop 조합 평가
  - 경유 stop이 없으면 현재 위치 → 목적지 직행 경로 계산
  - 현재 위치 → stop1 → stop2 → 목적지 경로 계산
  - 800m 이내는 도보 계산
  - 800m 초과는 T map 대중교통 API 호출
  - 최종 선택 경로는 계획된 구간 출발 시각을 `searchDttm`으로 넣어 T map을 재조회
  - T map legs에서 지하철 노선명, 버스 번호, 도보 구간, 구간별 예상 탑승/하차 시각 추출
  - 출발 시간이 없으면 약속 시간 기준 역산
  - 출발 시간이 있으면 가능 여부 판단

- `coordinator_agent`
  - GPT-4o 일반 응답으로 최종 한국어 메시지 생성
  - 여러 stop이 있을 경우 행동과 장소를 섞지 않도록 프롬프트 보강

### 프론트엔드

- 자연어 쿼리 입력 UI 구현
- 현재 위치 사용 기능 구현
- 위치 검색 및 지정 기능 구현
- API 호출 및 로딩/에러 처리 구현
- `ResultCard`
  - AI 메시지
  - 대표 추천 장소
  - 다중 stop 일정 목록
  - 추천 출발 시간
  - 계획 체류 시간
  - 도착 목표 시각

- `Timeline`
  - 기존 단일 장소 타임라인 지원
  - 새 `timeline` 배열 기반 동적 타임라인 지원
  - 이동/체류/도착 흐름 표시
  - 이동 구간별 도보/버스/지하철 상세, 노선명 또는 버스 번호, 예상 시각 표시

- `MapView`
  - 현재 위치, 모든 stop, 목적지 마커 표시
  - 카카오맵 bounds 자동 조정

### 문서화

- `README.md` 작성 완료
- `PROJECT_STATUS.md` 작성 및 최신화 규칙 추가
- 구현 운영 원칙 문서화 완료
- 현재 진척도 문서 `PROGRESS.md` 추가
- `DEPLOYMENT.md`: 기존 CloudFront/S3와 ECS Express Mode를 이용한 배포 절차

### 배포 준비

- 기존 러닝 사이트 저장소를 확인하고 원래 앱 소스/라우터/Vite 설정을 유지하는 분리 빌드 구성 추가
- 기존 사이트 artifacts와 `dist/agent/`를 함께 게시하는 `amplify.yml` 및 진입 rewrite 예시 추가
- 기존 API와 구분하는 `VITE_ROUTE_AGENT_API_BASE_URL` 사용. 미설정 시 기존 사이트만 빌드
- 프론트 운영 assets 경로 `/agent/`, API 주소 `VITE_API_BASE_URL` 설정
- HTTPS 운영 API 주소의 누락/형식 검증
- 백엔드 Dockerfile 및 비밀 파일 제외 설정
- ECS Express Mode 서비스 설정 예시, SSM secrets 참조
- CloudFront `/agent` 진입 경로 재작성 함수
- 실제 AWS 계정 연결/서버 생성/S3 업로드는 아직 수행하지 않음

## 현재 가능한 시나리오

다음과 같은 요청을 처리하는 구조가 준비되어 있습니다.

```text
오늘 8시까지 일산역에 가야해
```

예상 처리:

- 경유 행동 없음
- 경로: 현재 위치 → 일산역
- 임의 경유지 없이 추천 출발 시간 계산

```text
서울역에서 16:00에 약속이 있는데 꽃 선물을 사서 가고 싶어
```

예상 처리:

- 행동: 꽃 선물 구매
- 장소 유형: 꽃집
- 경로: 현재 위치 → 꽃집 → 서울역
- 추천 출발 시간 계산

```text
서울역에서 16:00에 약속이 있는데 서울역 주변에서 점심 먹고 카페에 있다가 약속장소에 가고 싶어
```

예상 처리:

- 행동 1: 점심 먹기 → 식당
- 행동 2: 카페 대기 → 카페
- 경로: 현재 위치 → 식당 → 카페 → 서울역
- 전체 이동 시간, 체류 시간, 출발 시간 계산

## 확인된 검증

최근 확인된 검증은 다음과 같습니다.

```bash
backend/.venv/bin/python -m py_compile backend/agents.py backend/main.py
VITE_API_BASE_URL=https://YOUR_BACKEND_HOST npm run build
```

두 검증 모두 통과한 상태입니다.

배포 준비 검증에서는 테스트용 HTTPS 주소로 `/agent/` 빌드와 Docker 이미지 빌드가 통과했습니다. 운영 CORS preflight/오류 응답, `/health`, 기존 루트 경로를 유지하는 CloudFront 재작성도 확인했습니다. 실제 운영 API 주소와 API 키를 넣은 AWS 배포 및 외부 API 검증은 남아 있습니다.

추가로 기존 러닝 사이트 저장소에서 단독 빌드와 agent 포함 통합 빌드를 검증했습니다. 기존 루트 HTML/JS/CSS 유지, `dist/agent/` 생성, 지도 키 fallback 및 별도 HTTPS agent API 주소 반영을 확인했습니다. 작업 브랜치는 `codex/route-agent-integration`이며 운영 브랜치 변경과 AWS 콘솔 설정은 수행하지 않았습니다.

2026-11-02 설정 오류 수정 검증에서 빈 키로 외부 요청이 생성되지 않는지, HTTP 503 응답에 원인 안내와 CORS 헤더가 유지되는지, 정상 키의 인증 헤더가 보존되는지 확인했습니다. 실행 중인 로컬 백엔드에서도 키 누락 안내 응답을 확인했습니다. 현재 `.env`의 키가 비어 있어 실제 외부 API를 통한 경로 검색 검증은 키 입력 후 진행해야 합니다.

mock 경로를 사용해 다음도 확인했습니다.

- 자동 출발 시간 계산
- 사용자 지정 출발 시간 기준 계산
- 식당 → 카페 → 목적지 다중 경유 타임라인 생성
- 지하철/버스/도보 leg 상세 데이터 생성

## 남은 과제

Supabase backend의 운영 코드는 `supabase/functions/route-agent/`이며 API 주소는 `https://scdpsgypefxtjbrnmovk.supabase.co/functions/v1/route-agent`입니다. 신규 프로젝트는 무료 한도로 생성하지 못해, 사용자가 선택한 기존 `polerun-test`에 함수만 추가했습니다. 기존 DB/함수는 변경하지 않았습니다. 프론트 Amplify 반영 상태는 실제 `/agent/` 응답으로 별도 확인해야 합니다.

### 실제 API 기반 시나리오 검증

- 카카오 API와 T map API를 실제 키로 반복 테스트해야 합니다.
- T map은 `429 QUOTA_EXCEEDED`, `403 INVALID_API_KEY` 등 외부 상태에 영향을 받습니다.
- 실제 운영 전에는 API 사용량, 권한, 쿼터를 안정적으로 확인해야 합니다.

### 추천 품질 개선

- 현재 경로 주변 검색은 실제 도로 경로가 아니라 현재 위치와 목적지 사이 직선 앵커 기반입니다.
- 식당/카페 후보 품질은 카카오 keyword 결과에 크게 의존합니다.
- 추후에는 평점, 영업시간, 카테고리 세분화, 거리 가중치 등을 반영할 수 있습니다.

### UI 개선

- 다중 stop 결과를 더 명확하게 보여주는 UI 개선 여지가 있습니다.
- 현재 `cafe`라는 호환 필드는 대표 장소 의미로 유지되고 있어, 장기적으로는 `primary_place` 같은 이름으로 정리하는 것이 좋습니다.
- 지도에서 stop별 색상/번호/범례를 더 명확히 표시할 수 있습니다.
- 지하철 시간표는 현재 T map 응답 또는 leg 소요시간 기반 예상 시각으로 표시합니다. 별도 실시간/공식 시간표 API 연동은 추후 과제입니다.

### 테스트 자동화

- 현재는 수동 검증과 mock 스크립트 기반 확인이 중심입니다.
- 백엔드 계산 로직은 단위 테스트로 분리하는 것이 좋습니다.
- 특히 다음 로직은 테스트가 필요합니다.
  - task 추출 fallback
  - 행동 → 장소 매핑
  - 다중 stop 조합 평가
  - 출발 시간 역산
  - 도보 fallback
  - T map 오류 처리

## 현재 상태 요약

현재 route-agent는 “약속 전 단일 장소 추천” 수준을 넘어 “약속 전 여러 행동을 일정으로 계획하는 AI 경로 에이전트” 형태로 발전했습니다. 핵심 기능은 구현되어 있으며, 다음 단계는 실제 API 환경에서 반복 테스트하고 추천 품질과 UI 표현을 다듬는 것입니다.
