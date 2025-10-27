# AWS Amplify 환경변수 설정 가이드

## 1. AWS Amplify 콘솔에서 환경변수 설정

### 방법 1: AWS Amplify 콘솔 사용
1. [AWS Amplify 콘솔](https://console.aws.amazon.com/amplify/)에 로그인
2. 해당 앱 선택
3. 왼쪽 메뉴에서 **"Environment variables"** 클릭
4. **"Manage variables"** 버튼 클릭
5. 다음 환경변수들을 추가:

```
VITE_KAKAO_JS_KEY = 061ee82c589939c377c6dd83daf03cfb
VITE_BACKEND_URL = https://zv6w3k3tt3.execute-api.ap-northeast-2.amazonaws.com/v1/
```

6. **"Save"** 클릭
7. **"Redeploy this version"** 클릭하여 재배포

### 방법 2: AWS CLI 사용
```bash
# Amplify 앱 ID 확인
aws amplify list-apps

# 환경변수 설정
aws amplify put-backend-environment \
  --app-id YOUR_APP_ID \
  --environment-name main \
  --environment-variables '{
    "VITE_KAKAO_JS_KEY": "061ee82c589939c377c6dd83daf03cfb",
    "VITE_BACKEND_URL": "https://zv6w3k3tt3.execute-api.ap-northeast-2.amazonaws.com/v1/"
  }'
```

## 2. 로컬 개발 환경 설정

### .env.local 파일 생성
프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 추가:

```env
VITE_KAKAO_JS_KEY=061ee82c589939c377c6dd83daf03cfb
VITE_BACKEND_URL=https://zv6w3k3tt3.execute-api.ap-northeast-2.amazonaws.com/v1/
```

**주의**: `.env.local` 파일은 `.gitignore`에 추가되어 Git에 커밋되지 않도록 해야 합니다.

## 3. 보안 고려사항

### 카카오 API 키 보안
- 카카오 개발자 콘솔에서 **도메인 제한** 설정
- `https://www.run2style.com` 도메인만 허용하도록 설정
- 불필요한 서비스는 비활성화

### 백엔드 API 보안
- API Gateway에서 CORS 설정 확인
- 필요한 경우 API 키 또는 인증 토큰 추가
- Rate Limiting 설정

## 4. CORS 설정 (백엔드)

Lambda 함수에서 CORS 헤더를 추가해야 합니다:

```python
def lambda_handler(event, context):
    # CORS 헤더 설정
    headers = {
        'Access-Control-Allow-Origin': 'https://www.run2style.com',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Credentials': 'false'
    }
    
    # OPTIONS 요청 처리
    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    # 실제 로직 처리
    # ...
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps(response_data)
    }
```

## 5. 배포 후 확인

1. 환경변수가 제대로 설정되었는지 확인:
   - 브라우저 개발자 도구 → Console에서 확인
   - `console.log(import.meta.env.VITE_KAKAO_JS_KEY)` 추가하여 테스트

2. CORS 오류 해결 확인:
   - Network 탭에서 API 요청 상태 확인
   - CORS 관련 오류 메시지가 없는지 확인

## 6. 문제 해결

### 환경변수가 undefined로 나오는 경우
- Amplify 콘솔에서 환경변수가 올바르게 설정되었는지 확인
- 앱을 재배포했는지 확인
- 변수명이 `VITE_`로 시작하는지 확인

### CORS 오류가 계속 발생하는 경우
- 백엔드 Lambda 함수에서 CORS 헤더가 올바르게 설정되었는지 확인
- API Gateway에서 CORS가 활성화되어 있는지 확인
- 도메인이 정확히 일치하는지 확인 (http vs https, www vs non-www)
