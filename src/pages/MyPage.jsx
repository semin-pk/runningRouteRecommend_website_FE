import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAuthenticated } from '../utils/auth.js'
import api from '../api/axios.js'
import { removeBookmark } from '../api/bookmarks.js'
import { getMyPage } from '../api/mypage.js'
import './MyPage.css'

export default function MyPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [bookmarks, setBookmarks] = useState([])
  const [histories, setHistories] = useState([])
  const [storesByTheme, setStoresByTheme] = useState({})
  const [themes, setThemes] = useState([])
  const [activeTheme, setActiveTheme] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteChecked, setDeleteChecked] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadMyPage = async () => {
    setLoadError(false)
    setIsLoading(true)
    if (!isAuthenticated()) {
      setIsLoading(false)
      navigate('/login?next=/mypage')
      return
    }
    try {
      const data = await getMyPage()
      setProfile(data?.profile || null)
      setBookmarks(data?.bookmarks || [])
      setHistories(data?.histories || [])
      const themeKeys = Object.keys(data?.stores_by_theme || {})
      setStoresByTheme(data?.stores_by_theme || {})
      setThemes(themeKeys)
      setActiveTheme(themeKeys[0] || '')
    } catch (error) {
      if (error?.response?.status === 401) {
        navigate('/login?next=/mypage')
        return
      }
      console.error('Failed to load mypage:', error)
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMyPage()
  }, [navigate])

  const formatDate = (isoString) => {
    if (!isoString) return '-'
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return '-'
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}.${mm}.${dd}`
  }


  const handleRemoveBookmark = async (routeId) => {
    try {
      await removeBookmark(routeId)
      setBookmarks((prev) => prev.filter((item) => item.route_id !== routeId))
    } catch (error) {
      console.error('Failed to remove bookmark:', error)
      alert('저장 해제에 실패했습니다.')
    }
  }

  const handleDeleteAccount = async () => {
    if (!deleteChecked || deleteLoading) return
    setDeleteLoading(true)
    try {
      await api.delete('/api/v1/users/me')
      localStorage.removeItem('access_token')
      setShowDeleteModal(false)
      setDeleteChecked(false)
      alert('회원탈퇴가 완료되었습니다')
      navigate('/login')
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem('access_token')
        navigate('/login')
        return
      }
      console.error('Failed to delete account:', error)
      alert('탈퇴 처리 중 오류가 발생했어요')
    } finally {
      setDeleteLoading(false)
    }
  }

  const profileImage =
    profile?.profile_image || profile?.profile_image_url || profile?.profileImage
  const nickname = profile?.nickname || profile?.email || '-'
  const provider = profile?.provider || profile?.social_provider || '-'

  return (
    <div className="mypage-container mypage-bg">
      <header className="mypage-header glass-card">
        <button
          type="button"
          className="mypage-back"
          onClick={() => navigate('/')}
          aria-label="뒤로가기"
        >
          &lt;
        </button>
        <h1 className="mypage-title">마이페이지</h1>
        <div className="mypage-header-spacer" />
      </header>

      <section className="mypage-card glass-card">
        <h2 className="mypage-section-title">내 프로필</h2>
        <div className="profile-row">
          {profileImage && !isLoading ? (
            <img src={profileImage} alt="프로필" className="profile-avatar" />
          ) : (
            <div className="profile-avatar" />
          )}
          <div className="profile-info">
            <div className="profile-name">{isLoading ? '-' : nickname}</div>
            <div className="profile-provider">{isLoading ? '-' : provider}</div>
          </div>
        </div>
        <div className="profile-actions">
          <button
            type="button"
            className="mypage-btn"
            onClick={() => navigate('/mypage/profile/edit')}
          >
            프로필 수정
          </button>
          <button
            type="button"
            className="mypage-btn outline"
            onClick={() => {
              setShowDeleteModal(true)
            }}
          >
            회원탈퇴
          </button>
        </div>
      </section>

      <section className="mypage-card glass-card">
        <div className="section-header">
          <h2 className="mypage-section-title">⭐ 내가 저장한 경로</h2>
          <span className="section-link">모두 보기 &gt;</span>
        </div>
        {isLoading ? (
          <div className="placeholder-card">
            <div className="placeholder-title">-</div>
            <div className="placeholder-text">거리: - km</div>
            <button type="button" className="mypage-btn small" disabled>
              길찾기
            </button>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-title">마이페이지를 불러오지 못했어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={loadMyPage}
            >
              다시 시도
            </button>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">아직 저장한 경로가 없어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={() => navigate('/')}
            >
              경로 추천 받으러 가기
            </button>
          </div>
        ) : (
          <div className="bookmark-list fade-in">
            {bookmarks.map((item) => {
              const storeNames = item.stores?.map((store) => store.name).filter(Boolean) || []
              const summary = storeNames.slice(0, 2).join(' · ')
              return (
                <div key={item.route_id} className="bookmark-card">
                  <div className="bookmark-header">
                    <div className="bookmark-title">{item.title || '저장한 경로'}</div>
                    <button
                      type="button"
                      className="bookmark-remove"
                      onClick={() => handleRemoveBookmark(item.route_id)}
                    >
                      저장 해제
                    </button>
                  </div>
                  {summary && <div className="bookmark-summary">{summary}</div>}
                  <div className="bookmark-meta">
                    거리: {item.total_distance_km ?? '-'} km
                  </div>
                  <button
                    type="button"
                    className="mypage-btn small"
                    disabled={!item.route_url}
                    onClick={() => {
                      if (item.route_url) {
                        window.open(item.route_url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    길찾기
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mypage-card glass-card">
        <div className="section-header">
          <h2 className="mypage-section-title">🕘 내가 선택했던 코스 히스토리</h2>
          <span className="section-link">&gt;</span>
        </div>
        {isLoading ? (
          <div className="placeholder-card">
            <div className="placeholder-title">-</div>
            <div className="placeholder-text">거리: - km</div>
            <div className="placeholder-text">일자: -</div>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-title">마이페이지를 불러오지 못했어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={loadMyPage}
            >
              다시 시도
            </button>
          </div>
        ) : histories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">아직 선택한 코스가 없어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={() => navigate('/')}
            >
              코스 추천 받으러 가기
            </button>
          </div>
        ) : (
          <div className="history-list fade-in">
            {histories.map((item) => {
              const storeNames =
                item.stores?.map((store) => store.name).filter(Boolean) || []
              const summary = storeNames.slice(0, 2).join(' · ')
              return (
                <div key={item.route_id} className="history-card">
                  <div className="history-title">최근 선택 코스</div>
                  {summary && <div className="history-summary">{summary}</div>}
                  <div className="history-meta">
                    선택 날짜: {formatDate(item.selected_at)}
                  </div>
                  <button
                    type="button"
                    className="mypage-btn small"
                    disabled={!item.route_url}
                    onClick={() => {
                      if (item.route_url) {
                        window.open(item.route_url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    길찾기
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mypage-card glass-card">
        <div className="section-header">
          <h2 className="mypage-section-title">🧾 내가 방문한 가게/요약 모아보기</h2>
          <button
            type="button"
            className="section-link-btn"
            onClick={() => navigate('/mypage/stores', { state: { storesByTheme } })}
          >
            상세 보기 &gt;
          </button>
        </div>
        {isLoading ? (
          <div className="placeholder-card">
            <div className="placeholder-title">-</div>
            <div className="placeholder-text">불러오는 중...</div>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-title">마이페이지를 불러오지 못했어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={loadMyPage}
            >
              다시 시도
            </button>
          </div>
        ) : themes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">아직 방문한 가게가 없어요</div>
            <button
              type="button"
              className="mypage-btn"
              onClick={() => navigate('/')}
            >
              코스 추천 받으러 가기
            </button>
          </div>
        ) : (
          <>
            <div className="tab-row">
              {themes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`tab-btn ${activeTheme === theme ? 'active' : ''}`}
                  onClick={() => setActiveTheme(theme)}
                >
                  {theme}
                </button>
              ))}
            </div>
            <div className="store-list fade-in">
              {(storesByTheme[activeTheme] || []).slice(0, 3).map((store) => (
                <div key={store.store_id} className="store-card">
                  <span className="store-order-badge hidden">1</span>
                  <div className="store-name">{store.name}</div>
                  <div className="store-meta">전화: {store.phone || '-'}</div>
                  <div className="store-meta">주소: {store.address || '-'}</div>
                  <div className="store-summary">
                    {store.summary ? (
                      <>
                        {store.summary.main_menu?.length > 0 && (
                          <div>메뉴: {store.summary.main_menu.join(', ')}</div>
                        )}
                        {store.summary.atmosphere?.length > 0 && (
                          <div>분위기: {store.summary.atmosphere.join(', ')}</div>
                        )}
                        {store.summary.recommended_for?.length > 0 && (
                          <div>추천: {store.summary.recommended_for.join(', ')}</div>
                        )}
                      </>
                    ) : (
                      '요약: -'
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 className="modal-title">회원탈퇴</h3>
            <p className="modal-text">
              회원탈퇴 시 저장한 경로, 히스토리, 가게 기록을 더 이상 사용할 수 없습니다.
              정말 탈퇴하시겠어요?
            </p>
            <label className="modal-check">
              <input
                type="checkbox"
                checked={deleteChecked}
                onChange={(e) => setDeleteChecked(e.target.checked)}
              />
              안내사항을 확인했습니다
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="mypage-btn outline"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteChecked(false)
                }}
                disabled={deleteLoading}
              >
                취소
              </button>
              <button
                type="button"
                className="mypage-btn"
                onClick={handleDeleteAccount}
                disabled={!deleteChecked || deleteLoading}
              >
                {deleteLoading ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
