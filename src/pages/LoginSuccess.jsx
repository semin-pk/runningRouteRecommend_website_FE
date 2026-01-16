/**
 * Login success page - handles OAuth callback redirect.
 */

import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

function LoginSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const nextParam = searchParams.get('next')
    const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/'
    
    if (accessToken) {
      // Store access token
      localStorage.setItem('access_token', accessToken)
      
      // Redirect to home after a brief delay
      setTimeout(() => {
        navigate(safeNext)
      }, 1000)
    } else {
      // No token - redirect to login
      navigate('/login')
    }
  }, [searchParams, navigate])

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
    }}>
      <h1>로그인 성공!</h1>
      <p>홈으로 이동 중...</p>
    </div>
  )
}

export default LoginSuccess














