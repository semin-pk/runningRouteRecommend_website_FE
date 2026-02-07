/**
 * Signup page with required legal consents.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getLatestLegal } from '../api/legal.js'
import { signup } from '../api/auth.js'

function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [termsDoc, setTermsDoc] = useState(null)
  const [privacyDoc, setPrivacyDoc] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDoc, setModalDoc] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchLegal = async () => {
      try {
        const data = await getLatestLegal()
        if (!mounted) return
        setTermsDoc(data.terms)
        setPrivacyDoc(data.privacy)
      } catch (err) {
        console.error('[Signup] 약관 조회 실패:', err)
        if (mounted) {
          setError('약관 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
        }
      }
    }
    fetchLegal()
    return () => {
      mounted = false
    }
  }, [])

  const allRequiredChecked = termsAgreed && privacyAgreed
  const canSubmit = useMemo(() => {
    return (
      email.trim() &&
      password.trim() &&
      nickname.trim() &&
      allRequiredChecked &&
      termsDoc &&
      privacyDoc &&
      !isSubmitting
    )
  }, [email, password, nickname, allRequiredChecked, termsDoc, privacyDoc, isSubmitting])

  const handleOpenModal = (doc) => {
    setModalDoc(doc)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setModalDoc(null)
  }

  const handleAgreeAll = (checked) => {
    setTermsAgreed(checked)
    setPrivacyAgreed(checked)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!allRequiredChecked) {
      setError('필수 약관에 동의해야 합니다.')
      return
    }
    if (!termsDoc || !privacyDoc) {
      setError('약관 정보를 불러오지 못했습니다.')
      return
    }

    try {
      setIsSubmitting(true)
      await signup({
        email: email.trim(),
        password,
        nickname: nickname.trim(),
        consents: {
          terms_version: termsDoc.version,
          privacy_version: privacyDoc.version,
          terms_agreed: true,
          privacy_agreed: true,
        },
      })
      navigate('/login')
    } catch (err) {
      console.error('[Signup] 회원가입 실패:', err)
      const message =
        err?.response?.data?.error || '회원가입에 실패했습니다. 다시 시도해주세요.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}
    >
      <h1 style={{ marginBottom: '1.5rem' }}>회원가입</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
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
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        <input
          type="text"
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />

        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={allRequiredChecked}
              onChange={(e) => handleAgreeAll(e.target.checked)}
            />
            전체 동의 (필수 항목 포함)
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
            />
            (필수) 이용약관 동의
            <button
              type="button"
              onClick={() => handleOpenModal(termsDoc)}
              disabled={!termsDoc}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#2f6fed',
                cursor: termsDoc ? 'pointer' : 'not-allowed',
              }}
            >
              보기
            </button>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={privacyAgreed}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
            />
            (필수) 개인정보 수집·이용 동의
            <button
              type="button"
              onClick={() => handleOpenModal(privacyDoc)}
              disabled={!privacyDoc}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#2f6fed',
                cursor: privacyDoc ? 'pointer' : 'not-allowed',
              }}
            >
              보기
            </button>
          </label>
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: '0.9rem' }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '0.9rem',
            backgroundColor: canSubmit ? '#111827' : '#cbd5f5',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {isSubmitting ? '가입 처리 중...' : '가입하기'}
        </button>
      </form>

      {modalOpen && modalDoc && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              backgroundColor: '#fff',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              borderRadius: '10px',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>약관 보기</h2>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ border: 'none', background: 'none', fontSize: '1.2rem' }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>
              시행일: {modalDoc.effective_at?.slice(0, 10)}
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                marginTop: '1rem',
                lineHeight: 1.6,
              }}
            >
              {modalDoc.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default Signup
