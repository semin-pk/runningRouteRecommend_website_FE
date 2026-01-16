import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios.js'
import { isAuthenticated } from '../utils/auth.js'
import './ProfileEdit.css'

export default function ProfileEdit() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      if (!isAuthenticated()) {
        navigate('/login?next=/mypage/profile/edit')
        return
      }

      try {
        const response = await api.get('/api/v1/auth/me')
        const data = response.data
        setNickname(data?.nickname || '')
        setProfileImageUrl(data?.profile_image_url || '')
      } catch (error) {
        if (error?.response?.status === 401) {
          navigate('/login?next=/mypage/profile/edit')
          return
        }
        console.error('Failed to load profile:', error)
        alert('프로필 정보를 불러오지 못했습니다.')
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [navigate])

  const handleSave = async (event) => {
    event.preventDefault()

    const trimmedNickname = nickname.trim()
    const trimmedProfileUrl = profileImageUrl.trim()
    const payload = {}

    if (trimmedNickname) {
      payload.nickname = trimmedNickname
    }
    if (trimmedProfileUrl) {
      payload.profile_image = trimmedProfileUrl
    }

    if (Object.keys(payload).length === 0) {
      alert('수정할 값을 입력해주세요.')
      return
    }

    setIsSaving(true)
    try {
      await api.patch('/api/v1/users/me', payload)
      navigate('/mypage')
    } catch (error) {
      console.error('Failed to update profile:', error)
      const message = error?.response?.data?.detail || '프로필 저장에 실패했습니다.'
      alert(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="profile-edit-container profile-edit-bg">
      <header className="profile-edit-header glass-card">
        <button
          type="button"
          className="profile-edit-back"
          onClick={() => navigate(-1)}
          aria-label="뒤로가기"
        >
          &larr;
        </button>
        <h1 className="profile-edit-title">프로필 수정</h1>
        <div className="profile-edit-spacer" />
      </header>

      <form className="profile-edit-card glass-card" onSubmit={handleSave}>
        <div className="profile-edit-preview">
          {profileImageUrl && !isLoading ? (
            <img src={profileImageUrl} alt="프로필 미리보기" />
          ) : (
            <div className="profile-edit-placeholder">👤</div>
          )}
        </div>

        <label className="profile-edit-label">
          프로필 이미지 URL
          <input
            type="url"
            placeholder="https://..."
            value={profileImageUrl}
            onChange={(event) => setProfileImageUrl(event.target.value)}
            className="profile-edit-input"
            disabled={isLoading || isSaving}
          />
        </label>

        <label className="profile-edit-label">
          닉네임
          <input
            type="text"
            placeholder="닉네임"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            className="profile-edit-input"
            disabled={isLoading || isSaving}
          />
        </label>

        <div className="profile-edit-actions">
          <button
            type="submit"
            className="profile-edit-btn primary"
            disabled={isLoading || isSaving}
          >
            {isSaving ? '저장 중...' : '저장하기'}
          </button>
          <button
            type="button"
            className="profile-edit-btn outline"
            onClick={() => navigate('/mypage')}
            disabled={isSaving}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
