# route-agent

자연어 요청을 받아 현재 위치 주변 카페를 찾고, 약속 장소까지의 이동 시간을 계산해 체류 가능한 시간을 추천하는 AI 경로 설정 에이전트입니다.

현재 구현 상태와 최신 동작 요약은 [PROJECT_STATUS.md](./PROJECT_STATUS.md)를 확인하세요. 기능을 추가하거나 동작을 바꿀 때는 `PROJECT_STATUS.md`도 함께 최신화해야 합니다.

`https://www.run2yourstyle.com/agent/` 배포 방법은 [DEPLOYMENT.md](./DEPLOYMENT.md)에 정리되어 있습니다. 프론트 운영 빌드는 `/agent/` 경로를 사용하며, 백엔드 실행 환경은 별도로 생성해야 합니다.

## 1. 환경변수 설정

백엔드 API 키를 설정합니다.

```bash
cd backend
cp .env.example .env
```

`backend/.env`에 실제 키를 입력합니다. 예시 파일은 키 이름만 제공하므로 복사만 하면 값이 비어 있습니다.

```env
OPENAI_API_KEY=your_openai_api_key
KAKAO_REST_API_KEY=your_kakao_rest_api_key
TMAP_APP_KEY=your_tmap_app_key
```

백엔드는 실행 디렉토리와 관계없이 `backend/.env`를 읽습니다. 이미 프로세스에 설정된 환경변수가 우선하며, 키를 변경한 뒤에는 백엔드를 재시작해야 합니다.

프론트엔드 카카오맵 JS 키를 설정합니다.

```bash
cd ../frontend
cp .env.example .env
```

`frontend/.env`에 실제 키를 입력합니다.

```env
VITE_KAKAO_MAP_KEY=your_kakao_javascript_key
VITE_API_BASE_URL=
```

로컬에서 `VITE_API_BASE_URL`을 비워두면 `http://localhost:8000`을 사용합니다. 운영 빌드는 `.env.production`에 실제 HTTPS API 주소를 설정해야 합니다.

## 2. 백엔드 실행

새 터미널에서 실행합니다.

```bash
cd route-agent/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

백엔드는 `http://localhost:8000`에서 실행됩니다.

## 3. 프론트엔드 실행

다른 터미널에서 실행합니다.

```bash
cd route-agent/frontend
npm install
npm run dev
```

프론트엔드는 보통 `http://localhost:5173`에서 실행됩니다.

## 4. 테스트용 curl

백엔드가 실행 중일 때 아래 명령어로 `POST /api/query`를 테스트할 수 있습니다.

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "서울역에 16:00 약속이 있는데 샌드위치 있고 콘센트 있는 카페에서 기다리고 싶어",
    "user_lat": 37.5665,
    "user_lng": 126.9780
  }'
```

예상 응답 형식:

```json
{
  "cafe": {},
  "route": {},
  "timeline": [
    {
      "type": "travel",
      "label": "약속 장소까지 이동",
      "duration_minutes": 42,
      "mode": "TRANSIT",
      "details": [
        {
          "mode_label": "지하철",
          "line_name": "경의중앙선",
          "start_time": "19:10",
          "end_time": "19:45"
        }
      ]
    }
  ],
  "stay_minutes": 60,
  "message": "추천 메시지"
}
```

`timeline[].details`에는 가능한 경우 도보/버스/지하철 구분, 지하철 노선명, 버스 번호, 구간별 탑승/하차 예상 시각이 포함됩니다.

## 5. 자주 발생하는 에러

### `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`, `TMAP_APP_KEY` 관련 오류

`backend/.env`가 없거나 값이 비어 있을 때 발생합니다. 백엔드는 해당 외부 API를 호출하기 전에 키를 검증하고, 누락 또는 형식 오류를 HTTP 503의 `detail`로 반환합니다. 웹 화면에도 이 안내가 표시됩니다.

`.env`가 없다면 아래 명령으로 생성합니다. 기존 `.env`가 있다면 그대로 열어 수정하세요.

```bash
cd route-agent/backend
cp -n .env.example .env
```

그 다음 `.env`에 실제 API 키를 입력하고 백엔드를 다시 실행하세요.

### `httpx.LocalProtocolError: Illegal header value b'Bearer '`

OpenAI 요청의 `OPENAI_API_KEY` 값이 비어 있어 발생한 오류입니다. `backend/.env`의 `OPENAI_API_KEY=` 뒤에 실제 키를 입력하고 백엔드를 재시작하세요. 키 앞뒤 공백은 제거되며, 키 안의 공백/줄바꿈/잘못된 문자는 검증 오류로 안내합니다.

`.env`에 키가 있는데도 누락 안내가 나오면 서버를 실행하는 터미널에 빈 환경변수가 설정되어 있는지 확인하세요. 로컬 `.env` 값을 사용하려면 아래 명령을 실행한 뒤 서버를 다시 시작합니다.

```bash
unset OPENAI_API_KEY KAKAO_REST_API_KEY TMAP_APP_KEY
uvicorn main:app --reload --port 8000
```

### 카카오맵이 보이지 않음

`frontend/.env`에 `VITE_KAKAO_MAP_KEY`가 없거나 카카오 개발자 콘솔에서 JavaScript 키 도메인 설정이 맞지 않을 때 발생합니다.

해결:

```bash
cd route-agent/frontend
cp .env.example .env
```

`.env`에 카카오 JavaScript 키를 입력하고, 카카오 개발자 콘솔의 플랫폼 Web 도메인에 아래 주소를 등록하세요.

```text
http://localhost:5173
http://127.0.0.1:5173
```

환경변수를 바꾼 뒤에는 `npm run dev`를 다시 실행해야 합니다.

### CORS 오류

프론트엔드 주소가 백엔드 CORS 허용 주소와 다르면 발생합니다. 기본 허용 주소는 `http://localhost:5173`, `http://127.0.0.1:5173`, `https://www.run2yourstyle.com`입니다.

해결:

허용 주소를 변경하려면 백엔드 환경변수 `CORS_ORIGINS`에 쉼표로 구분한 주소를 지정하고 서버를 재시작하세요. 경로(`/agent`)는 포함하지 않습니다.

### `ModuleNotFoundError: No module named 'fastapi'`

백엔드 의존성이 설치되지 않았거나 가상환경이 활성화되지 않았을 때 발생합니다.

해결:

```bash
cd route-agent/backend
source .venv/bin/activate
pip install -r requirements.txt
```

### `npm: command not found`

Node.js가 설치되어 있지 않을 때 발생합니다.

해결:

Node.js LTS 버전을 설치한 뒤 다시 실행하세요.

### 현재 위치를 가져오지 못함

브라우저 위치 권한이 거부되었거나 보안 컨텍스트가 아닐 때 발생합니다.

해결:

브라우저에서 위치 권한을 허용하고 `http://localhost:5173`으로 접속하세요.
