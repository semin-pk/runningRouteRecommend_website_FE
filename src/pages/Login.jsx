/**
 * Login page with social login buttons.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { getBackendUrl } from '../utils/api.js'

const BACKEND_URL = getBackendUrl()

function Login() {
  const navigate = useNavigate()

  useEffect(() => {
    // If already logged in, redirect to home
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      navigate('/')
    }
  }, [navigate])

  const handleSocialLogin = (provider) => {
    // Redirect to backend OAuth start endpoint
    window.location.href = `${BACKEND_URL}/auth/${provider}/start`
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
      <h1 style={{ marginBottom: '2rem' }}>로그인</h1>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem',
        width: '100%',
        maxWidth: '300px',
      }}>
        <button
          onClick={() => handleSocialLogin('kakao')}
          style={{
            padding: '1rem',
            backgroundColor: '#FEE500',
            color: '#000000',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          카카오로 로그인
        </button>

        <button
          onClick={() => handleSocialLogin('naver')}
          style={{
            padding: '1rem',
            backgroundColor: '#03C75A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          네이버로 로그인
        </button>

        <button
          onClick={() => handleSocialLogin('google')}
          style={{
            padding: '1rem',
            backgroundColor: '#FFFFFF',
            color: '#000000',
            border: '1px solid #dadce0',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          구글로 로그인
        </button>
      </div>
    </div>
  )
}

export default Login


