# 프론트엔드 환경 변수 설정 가이드

## .env.local 파일 생성

프로젝트 루트 디렉토리(`runningRouteRecommend_website_FE/`)에 `.env.local` 파일을 생성하세요.

## 필수 환경 변수

```env
# Kakao JavaScript API Key
VITE_KAKAO_JS_KEY=your_kakao_javascript_api_key_here

# Backend URL
VITE_BACKEND_URL=http://localhost:8000
```

## 환경 변수 설명

- **VITE_KAKAO_JS_KEY**: 카카오 개발자 콘솔에서 발급받은 JavaScript 키
- **VITE_BACKEND_URL**: 백엔드 서버 URL (기본값: http://localhost:8000)

## Windows에서 .env.local 파일 생성

1. 메모장 열기
2. 위의 내용 복사하여 붙여넣기
3. 실제 값으로 수정
4. 파일 이름을 `.env.local`로 저장 (파일 형식: 모든 파일)
5. `runningRouteRecommend_website_FE` 폴더에 저장

## macOS/Linux에서 .env.local 파일 생성

```bash
cd runningRouteRecommend_website_FE
nano .env.local
# 또는
vim .env.local
```

위의 내용을 복사하여 붙여넣고, 실제 값으로 수정한 후 저장하세요.

## 참고사항

- Vite는 `.env.local` 파일을 자동으로 로드합니다
- 환경 변수는 `VITE_` 접두사가 있어야 클라이언트 코드에서 사용 가능합니다
- `.env.local` 파일은 Git에 커밋하지 마세요 (이미 `.gitignore`에 포함되어 있음)
- 백엔드 URL이 다르면 `VITE_BACKEND_URL`을 수정하세요

## 환경 변수 사용

코드에서 다음과 같이 사용할 수 있습니다:

```javascript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY
```

