import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isAuthenticated } from '../utils/auth.js'
import { getStoresByTheme } from '../api/storeThemeLogs.js'
import { previewRouteFromStores } from '../api/routes.js'
import './MyStoresPage.css'

export default function MyStoresPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [storesByTheme, setStoresByTheme] = useState({})
  const [themes, setThemes] = useState([])
  const [activeTheme, setActiveTheme] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [errorState, setErrorState] = useState(false)

  const loadStores = async () => {
    setErrorState(false)
    setLoading(true)
    if (!isAuthenticated()) {
      setLoading(false)
      navigate('/login?next=/mypage/stores')
      return
    }
    try {
      const data = await getStoresByTheme()
      const defaultThemes = ['카페', '맛집']
      const themeKeys = Object.keys(data || {})
      const orderedThemes = [
        ...defaultThemes.filter((theme) => themeKeys.includes(theme)),
        ...themeKeys.filter((theme) => !defaultThemes.includes(theme)),
      ]
      setStoresByTheme(data || {})
      setThemes(orderedThemes)
      setActiveTheme(orderedThemes[0] || '')
    } catch (error) {
      if (error?.response?.status === 401) {
        navigate('/login?next=/mypage/stores')
        return
      }
      console.error('Failed to load stores by theme:', error)
      setErrorState(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const preset = location.state?.storesByTheme
    if (preset && Object.keys(preset).length > 0) {
      const defaultThemes = ['카페', '맛집']
      const themeKeys = Object.keys(preset || {})
      const orderedThemes = [
        ...defaultThemes.filter((theme) => themeKeys.includes(theme)),
        ...themeKeys.filter((theme) => !defaultThemes.includes(theme)),
      ]
      setStoresByTheme(preset)
      setThemes(orderedThemes)
      setActiveTheme(orderedThemes[0] || '')
      setLoading(false)
      return
    }
    loadStores()
  }, [navigate, location.state])

  const storeMap = useMemo(() => {
    const map = {}
    Object.values(storesByTheme || {}).forEach((stores) => {
      stores.forEach((store) => {
        map[store.store_id] = store
      })
    })
    return map
  }, [storesByTheme])

  const handleToggleStore = (storeId) => {
    setSelectedStoreIds((prev) => {
      const exists = prev.includes(storeId)
      const next = exists ? prev.filter((id) => id !== storeId) : [...prev, storeId]
      return next
    })
  }

  const haversineKm = (lat1, lng1, lat2, lng2) => {
    const toRad = (value) => (value * Math.PI) / 180
    const R = 6371
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const calculateDistance = () => {
    if (selectedStoreIds.length < 2) return 0
    let total = 0
    for (let i = 0; i < selectedStoreIds.length - 1; i += 1) {
      const a = storeMap[selectedStoreIds[i]]
      const b = storeMap[selectedStoreIds[i + 1]]
      if (!a || !b) continue
      total += haversineKm(a.lat, a.lng, b.lat, b.lng)
    }
    return total
  }

  const handlePreview = async () => {
    if (selectedStoreIds.length < 2) return
    const firstStore = storeMap[selectedStoreIds[0]]
    if (!firstStore) return
    setPreviewLoading(true)
    try {
      const result = await previewRouteFromStores({
        start: { lat: firstStore.lat, lng: firstStore.lng },
        storeIds: selectedStoreIds,
        roundTrip: false,
      })
      if (result.route_url) {
        window.open(result.route_url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        navigate('/login?next=/mypage/stores')
        return
      }
      console.error('Failed to preview route:', error)
      alert('경로 미리보기에 실패했습니다.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const renderStoreCard = (store) => {
    const orderIndex = selectedStoreIds.indexOf(store.store_id)
    const isSelected = orderIndex >= 0
    return (
      <div
        key={store.store_id}
        className={`theme-store-card ${isSelected ? 'selected' : ''}`}
        onClick={() => handleToggleStore(store.store_id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleToggleStore(store.store_id)
          }
        }}
      >
        {isSelected && <span className="theme-store-order">{orderIndex + 1}</span>}
        <div className="theme-store-name">{store.name}</div>
        <div className="theme-store-meta">📍 {store.address}</div>
        {store.phone && <div className="theme-store-meta">📞 {store.phone}</div>}
        {store.summary ? (
          <div className="theme-store-summary">
            {store.summary.main_menu?.length > 0 && (
              <div>메뉴: {store.summary.main_menu.join(', ')}</div>
            )}
            {store.summary.atmosphere?.length > 0 && (
              <div>분위기: {store.summary.atmosphere.join(', ')}</div>
            )}
            {store.summary.recommended_for?.length > 0 && (
              <div>추천: {store.summary.recommended_for.join(', ')}</div>
            )}
          </div>
        ) : (
          <div className="theme-store-summary muted">요약 없음</div>
        )}
      </div>
    )
  }

  const formatDistance = () => {
    const distance = calculateDistance()
    if (Number.isNaN(distance)) return '0.0'
    return Number(distance).toFixed(1)
  }

  const orderedThemes = themes

  return (
    <div className="my-stores-container my-stores-bg">
      <header className="my-stores-header glass-card">
        <button
          type="button"
          className="my-stores-back"
          onClick={() => navigate(-1)}
          aria-label="뒤로가기"
        >
          &larr;
        </button>
        <h1 className="my-stores-title">내가 방문한 가게</h1>
        <div className="my-stores-spacer" />
      </header>

      {loading ? (
        <div className="glass-card my-stores-placeholder">불러오는 중...</div>
      ) : errorState ? (
        <div className="glass-card my-stores-empty">
          <div className="empty-title">불러오지 못했어요</div>
          <button
            type="button"
            className="my-stores-btn"
            onClick={loadStores}
          >
            다시 시도
          </button>
        </div>
      ) : themes.length === 0 ? (
        <div className="glass-card my-stores-empty">
          <div className="empty-title">아직 방문/선택한 가게가 없어요</div>
          <button
            type="button"
            className="my-stores-btn"
            onClick={() => navigate('/')}
          >
            가게 찾아보기
          </button>
        </div>
      ) : (
        <>
          <div className="theme-tabs">
            {orderedThemes.map((theme) => (
              <button
                key={theme}
                type="button"
                className={`theme-tab ${activeTheme === theme ? 'active' : ''}`}
                onClick={() => setActiveTheme(theme)}
              >
                {theme}
              </button>
            ))}
          </div>

          <div className="theme-columns fade-in">
            {orderedThemes.map((theme) => (
              <div key={theme} className="theme-column">
                <div className="theme-column-title">{theme}</div>
                <div className="theme-store-list">
                  {(storesByTheme[theme] || []).map(renderStoreCard)}
                </div>
              </div>
            ))}
          </div>

          <div className="theme-mobile-list fade-in">
            <div className="theme-column-title">{activeTheme}</div>
            <div className="theme-store-list">
              {(storesByTheme[activeTheme] || []).map(renderStoreCard)}
            </div>
          </div>
        </>
      )}

      <div className="my-stores-bottom-bar glass-card">
        <div className="bottom-summary">
          {selectedStoreIds.length < 2
            ? '가게를 2개 이상 선택해 주세요'
            : `선택 ${selectedStoreIds.length}개 · 예상 ${formatDistance()} km`}
        </div>
        <button
          type="button"
          className="my-stores-cta"
          disabled={selectedStoreIds.length < 2 || previewLoading}
          onClick={handlePreview}
        >
          {previewLoading ? '경로 계산 중...' : '이 가게들로 경로 만들기'}
        </button>
      </div>
    </div>
  )
}
