/**
 * Login page with social login buttons.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { getBackendUrl } from '../utils/api.js'
import { loginLocal } from '../api/auth.js'

const BACKEND_URL = getBackendUrl()

function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // If already logged in, redirect to home
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      const nextParam = searchParams.get('next')
      const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/'
      navigate(safeNext)
    }
  }, [navigate, searchParams])

  const handleSocialLogin = (provider) => {
    // 중복 클릭 방지
    if (isRedirecting) {
      console.log('[Login] 이미 리다이렉트 중입니다. 중복 요청 무시')
      return
    }
    
    setIsRedirecting(true)
    console.log(`[Login] ${provider} 로그인 시작 - 리다이렉트 중...`)
    
    const nextParam = searchParams.get('next')
    const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : ''
    const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''
    // Redirect to backend OAuth start endpoint
    window.location.href = `${BACKEND_URL}/api/v1/auth/${provider}/start${nextQuery}`
  }

  const handleLocalLogin = async (event) => {
    event.preventDefault()
    if (isSubmitting) return
    setError('')
    try {
      setIsSubmitting(true)
      const data = await loginLocal({
        email: email.trim(),
        password,
      })
      localStorage.setItem('access_token', data.access_token)
      const nextParam = searchParams.get('next')
      const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/'
      navigate(safeNext)
    } catch (err) {
      console.error('[Login] 로컬 로그인 실패:', err)
      const message = err?.response?.data?.error || '로그인에 실패했습니다.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <h1 style={{ marginBottom: '1.5rem' }}>로그인</h1>

      <form
        onSubmit={handleLocalLogin}
        style={{
          width: '100%',
          maxWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          marginBottom: '1.5rem',
        }}
      >
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        {error && <div style={{ color: '#d32f2f', fontSize: '0.9rem' }}>{error}</div>}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '0.9rem',
            backgroundColor: isSubmitting ? '#cbd5f5' : '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? '로그인 중...' : '이메일로 로그인'}
        </button>
      </form>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem',
        width: '100%',
        maxWidth: '300px',
      }}>
        <button
          onClick={() => handleSocialLogin('kakao')}
          disabled={isRedirecting}
          style={{
            padding: '1rem',
            backgroundColor: isRedirecting ? '#CCCCCC' : '#FEE500',
            color: '#000000',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: isRedirecting ? 'not-allowed' : 'pointer',
            opacity: isRedirecting ? 0.6 : 1,
          }}
        >
          {isRedirecting ? '리다이렉트 중...' : '카카오로 로그인'}
        </button>

        <button
          onClick={() => handleSocialLogin('naver')}
          disabled={isRedirecting}
          style={{
            padding: '1rem',
            backgroundColor: isRedirecting ? '#CCCCCC' : '#03C75A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: isRedirecting ? 'not-allowed' : 'pointer',
            opacity: isRedirecting ? 0.6 : 1,
          }}
        >
          {isRedirecting ? '리다이렉트 중...' : '네이버로 로그인'}
        </button>

        {/* 구글 로그인 비활성화 */}
        {/* <button
          onClick={() => handleSocialLogin('google')}
          disabled={isRedirecting}
          style={{
            padding: '1rem',
            backgroundColor: '#FFFFFF',
            color: '#000000',
            border: '1px solid #dadce0',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: isRedirecting ? 'not-allowed' : 'pointer',
            opacity: isRedirecting ? 0.6 : 1,
          }}
        >
          {isRedirecting ? '리다이렉트 중...' : '구글로 로그인'}
        </button> */}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={() => navigate('/signup')}
          style={{
            background: 'none',
            border: 'none',
            color: '#2f6fed',
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          이메일로 회원가입
        </button>
      </div>
    </div>
  )
}

export default Login


