import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { getBackendUrl, getBackendUrlWithPath } from './utils/api.js'
import { fetchCurrentWeather } from './services/weather'
import { mapWeatherCodeToGroup, decideThemeId, applyThemeId, getHeroMessage } from './utils/theme'
import { getCachedWeather, setCachedWeather } from './utils/weatherCache'
import { fetchRouteTabs, fetchRoutesByKeyword } from './api/routes.js'
import { getBookmarks, addBookmark, removeBookmark } from './api/bookmarks.js'
import { addRouteHistory } from './api/routeHistories.js'
import { addStoreThemeLog } from './api/storeThemeLogs.js'

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY
const BACKEND_URL = getBackendUrl()

const DEFAULT_LAT = 37.566545
const DEFAULT_LNG = 126.977996



function useKakaoLoader() {
	const [loaded, setLoaded] = useState(false)
	const [error, setError] = useState(null)
	useEffect(() => {
		console.log('KAKAO_JS_KEY:', KAKAO_JS_KEY)
		
		if (!KAKAO_JS_KEY) {
			console.error('KAKAO_JS_KEY is not set')
			setError('카카오 지도 API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.')
			return
		}

		// 이미 로드된 경우
		if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
			console.log('Kakao already loaded')
			setLoaded(true)
			return
		}

		// 스크립트가 이미 로드 중인지 확인
		const existingScript = document.querySelector('script[src*="dapi.kakao.com"]')
		if (existingScript) {
			console.log('Kakao script already exists, waiting for load...')
			// 기존 스크립트가 로드될 때까지 기다림
			const checkLoaded = () => {
				if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
					console.log('Kakao Maps API ready')
					setLoaded(true)
				} else {
					setTimeout(checkLoaded, 100)
				}
			}
			checkLoaded()
			return
		}

		// 새 스크립트 로드
		const script = document.createElement('script')
		script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`
		script.async = true
		
		script.onload = () => {
			console.log('Kakao script loaded, initializing...')
			// kakao.maps.load() 사용하여 완전한 로딩 대기
			if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
				window.kakao.maps.load(() => {
					console.log('Kakao Maps API fully loaded')
					setLoaded(true)
				})
			} else {
				// fallback: 직접 확인
				const checkLoaded = () => {
					if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
						console.log('Kakao Maps API ready (fallback)')
						setLoaded(true)
					} else {
						setTimeout(checkLoaded, 100)
					}
				}
				checkLoaded()
			}
		}
		
		script.onerror = (e) => {
			console.error('Failed to load Kakao script:', e)
			setError('Failed to load Kakao Maps')
		}
		
		document.head.appendChild(script)
		
		return () => {
			if (document.head.contains(script)) {
				document.head.removeChild(script)
			}
		}
	}, [])
	return { loaded, error }
}

function MapPicker({ onPick, onSelectLocation }) {
	const ref = useRef(null)
	const [coords, setCoords] = useState(null)
	const { loaded, error } = useKakaoLoader()

	useEffect(() => {
		if (!loaded || !ref.current) return
		
		console.log('Initializing Kakao Map...')
		const kakao = window.kakao
		
		try {
			// 지도 생성
			const map = new kakao.maps.Map(ref.current, {
				center: new kakao.maps.LatLng(37.5665, 126.978),
				level: 5,
			})
			
			// 마커 생성
			const marker = new kakao.maps.Marker({ 
				position: map.getCenter() 
			})
			marker.setMap(map)
			
			// 클릭 이벤트 등록 (위치 확정)
			kakao.maps.event.addListener(map, 'click', function (mouseEvent) {
				const latlng = mouseEvent.latLng
				marker.setPosition(latlng)
				const lat = latlng.getLat()
				const lng = latlng.getLng()
				setCoords({ lat, lng })
				
				// 기존 onPick (러닝 코스 추천용)
				if (onPick) {
					onPick(lat, lng)
				}
				
				// 위치 확정 콜백 (테마 갱신용)
				if (onSelectLocation) {
					onSelectLocation(lat, lng)
				}
			})
			
			console.log('Kakao Map initialized successfully')
		} catch (error) {
			console.error('Error initializing Kakao Map:', error)
		}
	}, [loaded, onPick, onSelectLocation])

	if (error) {
		return (
			<div>
				<div className="map-error">
					<div style={{ textAlign: 'center', color: '#000' }}>
						<div>❌ {error}</div>
						<div style={{ fontSize: 12, marginTop: 8 }}>카카오 지도 API 키를 확인해주세요</div>
					</div>
				</div>
			</div>
		)
	}

	if (!loaded) {
		return (
			<div>
				<div className="map-loading">
					<div style={{ textAlign: 'center', color: '#000' }}>
						<div>🔄 카카오 지도 로딩 중...</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div>
			<div ref={ref} className="map-container" />
			<div className="map-coords">
				{coords ? `선택 위치: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : '지도를 클릭하여 시작 위치를 선택하세요'}
			</div>
		</div>
	)
}

export default function App() {
	const navigate = useNavigate()
	
	// 인증 상태
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [userInfo, setUserInfo] = useState(null)
	
	// 선택된 좌표 (테마 결정용)
	const [selectedLat, setSelectedLat] = useState(37.566545)
	const [selectedLng, setSelectedLng] = useState(126.977996)
	
	// 기존 상태
	const [lat, setLat] = useState(null)
	const [lng, setLng] = useState(null)
	const [totalDistanceKm, setTotalDistanceKm] = useState(7)
	const [isRoundTrip, setIsRoundTrip] = useState(true)
	const [waypoints, setWaypoints] = useState([
		{ theme_keyword: '카페', order: 1 },
		{ theme_keyword: '맛집', order: 2 },
		{ theme_keyword: '맥주', order: 3 }
	])
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState(null)
	const [error, setError] = useState(null)
	
	// 새로운 상태 (상세 검색 및 빠른 검색)
	const [mode, setMode] = useState('quick') // 'quick' (빠른 검색) or 'detail' (상세 검색)
	const [searchThemes, setSearchThemes] = useState(['']) // 여러 테마 입력 (상세 검색용)
	const [searchLoading, setSearchLoading] = useState(false)
	const [storeCandidates, setStoreCandidates] = useState(null)
	const [routeCandidates, setRouteCandidates] = useState(null) // 경로 후보 (경유지 2개 이상일 때)
	const [selectedStore, setSelectedStore] = useState(null)
	const [selectedRoute, setSelectedRoute] = useState(null)
	const [confirmedStore, setConfirmedStore] = useState(null)
	const [routeResult, setRouteResult] = useState(null)
	const [confirmedRouteId, setConfirmedRouteId] = useState(null) // 확정된 route_id
	const [searchError, setSearchError] = useState(null)
	const [searchType, setSearchType] = useState(null) // 'single' or 'route'
	const [routeSummary, setRouteSummary] = useState(null)
	const [summaryLoading, setSummaryLoading] = useState(false)
	const [summaryError, setSummaryError] = useState(null)

	const canSubmit = lat !== null && lng !== null && totalDistanceKm > 0 && waypoints.length > 0

	// 한 줄 카피 상태
	const [heroMessage, setHeroMessage] = useState("🏃 오늘 컨디션에 맞춰 코스를 골라볼까요?")
	const [currentWeatherGroup, setCurrentWeatherGroup] = useState("clear")
	const [currentThemeId, setCurrentThemeId] = useState("day_clear")
	
	// 안전 모드 토글 상태
	const [safetyModeEnabled, setSafetyModeEnabled] = useState(false)

	// 추천 코스 탭 상태
	const [tabs, setTabs] = useState([])
	const [selectedTab, setSelectedTab] = useState('__ALL__') // 기본값: 전체
	const [routes, setRoutes] = useState([])
	const [selectedRecommendedRoute, setSelectedRecommendedRoute] = useState(null) // 추천 경로 탭에서 선택한 경로
	const [selectedRouteStoresWithStatus, setSelectedRouteStoresWithStatus] = useState([]) // 선택한 경로의 stores (summary_status 포함)
	const [confirmEnabled, setConfirmEnabled] = useState(false) // 확정 버튼 활성화 여부
	const [loadingTabs, setLoadingTabs] = useState(false)
	const [loadingRoutes, setLoadingRoutes] = useState(false)
	const [errorTabs, setErrorTabs] = useState(null)
	const [errorRoutes, setErrorRoutes] = useState(null)
	const [bookmarkRouteIds, setBookmarkRouteIds] = useState([])
	const [toast, setToast] = useState(null)

	// AbortController ref (이전 요청 취소용)
	const abortControllerRef = useRef(null)
	
	// 디바운스 타이머 ref
	const debounceTimerRef = useRef(null)

	// 날씨 API 호출 및 테마 적용 (디바운스 + AbortController + 캐시 적용)
	useEffect(() => {
		// 이전 디바운스 타이머 취소
		if (debounceTimerRef.current !== null) {
			clearTimeout(debounceTimerRef.current)
			debounceTimerRef.current = null
		}

		// 이전 요청 취소
		if (abortControllerRef.current) {
			abortControllerRef.current.abort()
		}

		// 디바운스: 500ms 대기
		debounceTimerRef.current = setTimeout(() => {
			const currentLat = selectedLat
			const currentLng = selectedLng
			
			console.log('📍 좌표 변경됨 (디바운스 후):', currentLat, currentLng)

			// 캐시 확인
			const cached = getCachedWeather(currentLat, currentLng)
			if (cached) {
				console.log('✅ 캐시에서 날씨 데이터 사용')
				const group = mapWeatherCodeToGroup(cached.weatherCode)
				const themeId = decideThemeId(group)

				applyThemeId(themeId)
				
				// 카피 업데이트
				setCurrentWeatherGroup(group)
				setCurrentThemeId(themeId)
				setHeroMessage(getHeroMessage(themeId, group))
				
				// 날씨가 정상으로 돌아오면 안전 모드 자동 해제
				if (group !== 'rainy' && group !== 'snowy') {
					setSafetyModeEnabled(false)
				}

				console.log('Weather OK (캐시):', {
					weatherCode: cached.weatherCode,
					temperature: cached.temperature
				})
				console.log('WeatherGroup:', group)
				console.log('ThemeId applied:', themeId)
				return
			}

			// 새 AbortController 생성
			const abortController = new AbortController()
			abortControllerRef.current = abortController

			// API 호출
			fetchCurrentWeather(currentLat, currentLng, abortController.signal)
				.then((result) => {
					// 요청이 취소되었는지 확인
					if (abortController.signal.aborted) {
						console.warn('⚠️ 요청이 취소되었습니다')
						return
					}

					// 캐시에 저장
					setCachedWeather(currentLat, currentLng, result.weatherCode, result.temperature)

					const group = mapWeatherCodeToGroup(result.weatherCode)
					const themeId = decideThemeId(group)

					applyThemeId(themeId) // ✅ 실제 적용
					
					// 카피 업데이트
					setCurrentWeatherGroup(group)
					setCurrentThemeId(themeId)
					setHeroMessage(getHeroMessage(themeId, group))
					
					// 날씨가 정상으로 돌아오면 안전 모드 자동 해제
					if (group !== 'rainy' && group !== 'snowy') {
						setSafetyModeEnabled(false)
					}

					console.log('Weather OK:', result)
					console.log('WeatherGroup:', group)
					console.log('ThemeId applied:', themeId)
				})
				.catch((error) => {
					// Abort 에러는 무시 (warn만)
					if (error.name === 'AbortError') {
						console.warn('⚠️ 날씨 요청이 취소되었습니다')
						return
					}
					
					// 다른 에러는 로그만 (테마는 기존 유지)
					console.error('Weather FAIL:', error)
				})
		}, 500) // 500ms 디바운스

		// cleanup: 컴포넌트 unmount 시 타이머와 요청 정리
		return () => {
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current)
				debounceTimerRef.current = null
			}
			if (abortControllerRef.current) {
				abortControllerRef.current.abort()
			}
		}
	}, [selectedLat, selectedLng])

	// 인증 상태 확인
	useEffect(() => {
		const checkAuth = async () => {
			const accessToken = localStorage.getItem('access_token')
			if (accessToken) {
				try {
					const response = await fetch(`${BACKEND_URL}/api/v1/auth/me`, {
						headers: {
							'Authorization': `Bearer ${accessToken}`,
						},
						credentials: 'include',
					})
					if (response.ok) {
						const user = await response.json()
						setUserInfo(user)
						setIsAuthenticated(true)
					} else {
						localStorage.removeItem('access_token')
						setIsAuthenticated(false)
					}
				} catch (error) {
					console.error('Auth check failed:', error)
					localStorage.removeItem('access_token')
					setIsAuthenticated(false)
				}
			} else {
				setIsAuthenticated(false)
			}
		}
		checkAuth()
	}, [])

	// 북마크 목록 로드 (로그인 상태에서만)
	useEffect(() => {
		const loadBookmarks = async () => {
			if (!isAuthenticated) {
				setBookmarkRouteIds([])
				return
			}
			try {
				const data = await getBookmarks()
				const ids = (data?.items || []).map(item => item.route_id).filter(Boolean)
				setBookmarkRouteIds(ids)
			} catch (error) {
				console.error('Failed to load bookmarks:', error)
			}
		}
		loadBookmarks()
	}, [isAuthenticated])

	const toggleBookmark = async (e, routeId) => {
		e.stopPropagation()
		if (!routeId) return
		if (!isAuthenticated) {
			navigate('/login?next=/mypage')
			return
		}
		const isBookmarked = bookmarkRouteIds.includes(routeId)
		try {
			if (isBookmarked) {
				await removeBookmark(routeId)
				setBookmarkRouteIds(prev => prev.filter(id => id !== routeId))
			} else {
				await addBookmark(routeId)
				setBookmarkRouteIds(prev => [...prev, routeId])
				setToast({
					message: '저장했어요! 마이페이지에서 확인하기',
					actionLabel: '마이페이지',
					action: () => navigate('/mypage'),
				})
			}
		} catch (error) {
			console.error('Failed to toggle bookmark:', error)
		}
	}

	useEffect(() => {
		if (!toast) return undefined
		const timer = setTimeout(() => setToast(null), 3000)
		return () => clearTimeout(timer)
	}, [toast])

	const getPrimaryTheme = () => {
		const theme = searchThemes.find(t => t.trim())
		return theme ? theme.trim() : ''
	}

	const logStoreTheme = (theme, storeId) => {
		if (!isAuthenticated || !storeId) return
		const safeTheme = theme && theme.trim() ? theme.trim() : '코스'
		addStoreThemeLog({ theme: safeTheme, storeId }).catch(() => {})
	}

	const logStoresByTheme = (stores, themeMap = {}) => {
		if (!stores || stores.length === 0) return
		stores.forEach((store) => {
			const storeId = store.store_id || store.storeId
			if (!storeId) return
			const theme = themeMap[storeId] || '코스'
			logStoreTheme(theme, storeId)
		})
	}

	const handleLogout = async () => {
		try {
			await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
				method: 'POST',
				credentials: 'include',
			})
		} catch (error) {
			console.error('Logout failed:', error)
		} finally {
			localStorage.removeItem('access_token')
			setIsAuthenticated(false)
			setUserInfo(null)
			navigate('/login')
		}
	}

	const onPick = useCallback((la, ln) => {
		setLat(la)
		setLng(ln)
	}, [])
	
	// 지도에서 위치 확정 시 호출되는 콜백
	const handleSelectLocation = useCallback((lat, lng) => {
		setSelectedLat(lat)
		setSelectedLng(lng)
		console.log('✅ 위치 확정:', lat, lng)
	}, [])

	const addWaypoint = () => {
		const newOrder = Math.max(...waypoints.map(w => w.order), 0) + 1
		setWaypoints([...waypoints, { theme_keyword: '', order: newOrder }])
	}

	const removeWaypoint = (order) => {
		setWaypoints(waypoints.filter(w => w.order !== order).map((w, index) => ({ ...w, order: index + 1 })))
	}

	const updateWaypoint = (order, theme_keyword) => {
		setWaypoints(waypoints.map(w => w.order === order ? { ...w, theme_keyword } : w))
	}

	const [draggedItem, setDraggedItem] = useState(null)

	const handleDragStart = (e, order) => {
		setDraggedItem(order)
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('text/plain', order.toString())
	}

	const handleDragOver = (e) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
	}

	const handleDrop = (e, targetOrder) => {
		e.preventDefault()
		const draggedOrder = e.dataTransfer.getData('text/plain')
		if (!draggedOrder || draggedOrder === targetOrder.toString()) return

		const draggedIndex = waypoints.findIndex(w => w.order === parseInt(draggedOrder))
		const targetIndex = waypoints.findIndex(w => w.order === targetOrder)
		
		if (draggedIndex === -1 || targetIndex === -1) return
		
		const newWaypoints = [...waypoints]
		const draggedWaypoint = newWaypoints[draggedIndex]
		
		// 드래그된 항목 제거
		newWaypoints.splice(draggedIndex, 1)
		// 타겟 위치에 삽입
		newWaypoints.splice(targetIndex, 0, draggedWaypoint)
		
		// 순서 재정렬
		const reorderedWaypoints = newWaypoints.map((w, index) => ({ ...w, order: index + 1 }))
		setWaypoints(reorderedWaypoints)
		setDraggedItem(null)
	}

	const handleDragEnd = () => {
		setDraggedItem(null)
	}

	const submit = async () => {
		if (!canSubmit) return
		
		if (!BACKEND_URL) {
			setError('백엔드 URL이 설정되지 않았습니다. 환경변수를 확인해주세요.')
			return
		}
		
		setLoading(true)
		setError(null)
		setResult(null)
		try {
			const requestBody = {
				start_lat: lat,
				start_lng: lng,
				total_distance_km: totalDistanceKm,
				waypoints: waypoints.filter(w => w.theme_keyword.trim().length > 0),
				is_round_trip: isRoundTrip
			}
			
			const r = await fetch(getBackendUrlWithPath('api/recommend'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				mode: 'cors',
				credentials: 'omit'
			})
			if (!r.ok) throw new Error(await r.text())
			const data = await r.json()
			setResult(data)
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			if (errorText.includes('OPEN_MAP_AND_LOCAL')) {
				setError('Kakao Local API가 활성화되지 않았습니다. 카카오 개발자 콘솔에서 "OPEN_MAP_AND_LOCAL" 서비스를 활성화해주세요.')
			} else {
				setError(errorText)
			}
		} finally {
			setLoading(false)
		}
	}
	
	// 상세 검색 함수 (여러 테마 지원)
	const searchStoresByTheme = async () => {
		const validThemes = searchThemes.filter(t => t.trim().length > 0)
		if (!lat || !lng || validThemes.length === 0) {
			setSearchError('위치와 테마를 모두 입력해주세요.')
			return
		}
		
		if (!BACKEND_URL) {
			setSearchError('백엔드 URL이 설정되지 않았습니다.')
			return
		}
		
		setSearchLoading(true)
		setSearchError(null)
		setStoreCandidates(null)
		setRouteCandidates(null)
		setSelectedStore(null)
		setSelectedRoute(null)
		setConfirmedStore(null)
		setRouteResult(null)
		setSearchType(null)
		
		try {
			const requestBody = {
				themes: validThemes.map(t => t.trim()),
				latitude: lat,
				longitude: lng,
				radius_m: 2000,
				start_lat: lat,
				start_lng: lng,
				total_distance_km: totalDistanceKm,
				is_round_trip: isRoundTrip
			}
			
			const r = await fetch(getBackendUrlWithPath('api/stores/search'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				mode: 'cors',
				credentials: 'omit'
			})
			
			if (!r.ok) {
				const errorText = await r.text()
				throw new Error(errorText)
			}
			
			const data = await r.json()
			console.log('[상세 검색] 응답 데이터:', data)
			console.log('[상세 검색] search_type:', data.search_type)
			console.log('[상세 검색] stores:', data.stores)
			console.log('[상세 검색] routes:', data.routes)
			
			setSearchType(data.search_type)
			
			if (data.search_type === 'single') {
				// 경유지 1개: 가게 선택
				console.log('[상세 검색] 단일 테마 모드, 가게 개수:', data.stores?.length || 0)
				setStoreCandidates(data.stores || [])
			} else if (data.search_type === 'route') {
				// 경유지 2개 이상: 경로 선택
				console.log('[상세 검색] 경로 모드, 경로 개수:', data.routes?.length || 0)
				console.log('[상세 검색] 경로 상세 구조:', JSON.stringify(data.routes, null, 2))
				if (data.routes && data.routes.length > 0) {
					console.log('[상세 검색] 첫 번째 경로 구조:', {
						route_id: data.routes[0].route_id,
						stores_count: data.routes[0].stores?.length || 0,
						stores_structure: data.routes[0].stores?.[0] ? {
							store_id: data.routes[0].stores[0].store_id,
							name: data.routes[0].stores[0].name,
							summary_status: data.routes[0].stores[0].summary_status,
							has_review_summary: !!data.routes[0].stores[0].review_summary
						} : null
					})
				}
				setRouteCandidates(data.routes || [])
			} else {
				console.warn('[상세 검색] 알 수 없는 search_type:', data.search_type)
			}
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
		} finally {
			setSearchLoading(false)
		}
	}
	
	// 공통 경로 확정 함수 (모든 플로우에서 사용)
	const confirmRoute = async (source = 'route') => {
		// source: 'quick' (빠른검색), 'single' (상세검색 단일 가게), 'route' (상세검색 경로), 'recommended' (추천 경로 탭)
		
		if (!lat || !lng) {
			setSearchError('위치를 선택해주세요.')
			return
		}
		
		if (!BACKEND_URL) {
			setSearchError('백엔드 URL이 설정되지 않았습니다.')
			return
		}
		
		// stores 배열 생성
		let stores = []
		let totalDistance = totalDistanceKm
		let estimatedTime = null
		let isRoundTripValue = isRoundTrip
		
		if (source === 'quick') {
			// 빠른검색: result.waypoints에서 store_id와 order 추출
			if (!result || !result.waypoints || result.waypoints.length === 0) {
				setSearchError('경유지를 선택해주세요.')
				return
			}
			stores = result.waypoints
				.filter(wp => wp.store_id) // store_id가 있는 경우만
				.map(wp => ({
					store_id: wp.store_id,
					order: wp.order
				}))
			if (stores.length === 0) {
				setSearchError('경유지에 가게 정보가 없습니다.')
				return
			}
			totalDistance = result.total_distance_km || totalDistanceKm
		} else if (source === 'single') {
			// 상세검색 단일 가게: selectedStore.store_id 사용
			if (!selectedStore || !selectedStore.store_id) {
				setSearchError('가게를 선택해주세요.')
				return
			}
			stores = [{
				store_id: selectedStore.store_id,
				order: 1
			}]
		} else if (source === 'recommended') {
			// 추천 경로 탭: selectedRecommendedRoute 사용
			if (!selectedRecommendedRoute || !selectedRecommendedRoute.stores || selectedRecommendedRoute.stores.length === 0) {
				setSearchError('경로를 선택해주세요.')
				return
			}
			stores = selectedRecommendedRoute.stores.map((s, index) => ({
				store_id: s.store_id,
				order: s.order || (index + 1)
			}))
			totalDistance = selectedRecommendedRoute.total_distance_km || totalDistanceKm
			estimatedTime = selectedRecommendedRoute.estimated_time_min || null
			isRoundTripValue = selectedRecommendedRoute.is_roundtrip !== undefined ? selectedRecommendedRoute.is_roundtrip : isRoundTrip
		} else if (source === 'route') {
			// 상세검색 경로: selectedRoute.stores 사용
			if (!selectedRoute || !selectedRoute.stores || selectedRoute.stores.length === 0) {
				setSearchError('경로를 선택해주세요.')
				return
			}
			
			console.log('[경로 확정] selectedRoute:', selectedRoute)
			console.log('[경로 확정] selectedRoute.stores:', selectedRoute.stores)
			console.log('[경로 확정] selectedRoute.stores[0]:', selectedRoute.stores[0])
			
			stores = selectedRoute.stores
				.filter(s => {
					const hasStoreId = s && (s.store_id || (typeof s === 'object' && 'store_id' in s))
					if (!hasStoreId) {
						console.warn('[경로 확정] store_id가 없는 항목:', s)
					}
					return hasStoreId
				})
				.map((s, index) => {
					const storeId = s.store_id || (typeof s === 'object' && 'store_id' in s ? s.store_id : null)
					const order = s.order || (index + 1)
					console.log(`[경로 확정] store ${index}: store_id=${storeId}, order=${order}`)
					return {
						store_id: storeId,
						order: order
					}
				})
			
			console.log('[경로 확정] 최종 stores 배열:', stores)
			
			if (stores.length === 0) {
				setSearchError('경로에 가게 정보가 없습니다.')
				return
			}
			totalDistance = selectedRoute.total_distance_km || totalDistanceKm
		}
		
		setSearchLoading(true)
		setSearchError(null)
		setRouteSummary(null)
		setSummaryError(null)
		setSummaryLoading(false)
		
		try {
			// user_id: 로그인된 경우 userInfo에서, 아니면 임시 값 (백엔드에서 optional 처리됨)
			const userId = userInfo?.user_id || userInfo?.id || undefined
			
			console.log('[경로 확정] stores 배열:', stores)
			console.log('[경로 확정] source:', source)
			
			const requestBody = {
				...(userId && { user_id: userId }), // user_id가 있으면 포함
				start_lat: lat,
				start_lng: lng,
				end_lat: null,
				end_lng: null,
				total_distance_km: totalDistance,
				estimated_time_min: estimatedTime,
				is_roundtrip: isRoundTripValue,
				polyline: null,
				stores: stores,
				route_context: null
			}
			
			console.log('[경로 확정] requestBody:', JSON.stringify(requestBody, null, 2))
			
			const r = await fetch(getBackendUrlWithPath('api/routes/confirm'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				mode: 'cors',
				credentials: 'omit'
			})
			
			if (!r.ok) {
				const errorText = await r.text()
				throw new Error(errorText)
			}
			
			const data = await r.json()
			
			// route_id 저장
			if (data.route_id) {
				setConfirmedRouteId(data.route_id)
				setSummaryLoading(true)
				try {
					const summaryRes = await fetch(getBackendUrlWithPath(`api/routes/${data.route_id}/summarize`), {
						method: 'POST',
						mode: 'cors',
						credentials: 'omit'
					})
					if (summaryRes.ok) {
						const summaryData = await summaryRes.json()
						setRouteSummary(summaryData)
					} else {
						setSummaryError('요약을 불러오지 못했어요.')
					}
				} catch (e) {
					setSummaryError('요약을 불러오지 못했어요.')
				} finally {
					setSummaryLoading(false)
				}
			}
			
			// routeResult는 기존 호환성을 위해 유지 (필요시 사용)
			setRouteResult(data)
			
			// 성공 메시지
			console.log('✅ 경로 확정 완료:', data.route_id)

			// 테마 로그 적재 (silent)
			const themeMap = {}
			if (source === 'quick' && result?.waypoints) {
				result.waypoints.forEach((wp) => {
					if (wp.store_id) {
						themeMap[wp.store_id] = (wp.theme_keyword || '').trim() || '코스'
					}
				})
			}
			if (source === 'single' && selectedStore?.store_id) {
				themeMap[selectedStore.store_id] = getPrimaryTheme() || '코스'
			}
			logStoresByTheme(stores, themeMap)
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
			console.error('경로 확정 실패:', errorText)
		} finally {
			setSearchLoading(false)
		}
	}

	const renderRouteSummary = () => {
		if (summaryLoading) {
			return <div className="review-processing">⏳ 경로 요약 생성 중...</div>
		}
		if (summaryError) {
			return <div className="error-message">{summaryError}</div>
		}
		if (!routeSummary) return null

		return (
			<div className="route-summary-panel">
				<div className="review-complete">✓ 경로 요약 완료</div>
				{routeSummary.one_liner && (
					<div className="review-item">요약: {routeSummary.one_liner}</div>
				)}
				{routeSummary.route_tags && routeSummary.route_tags.length > 0 && (
					<div className="review-item">태그: {routeSummary.route_tags.join(', ')}</div>
				)}
				{routeSummary.best_for && routeSummary.best_for.length > 0 && (
					<div className="review-item">추천 대상: {routeSummary.best_for.join(', ')}</div>
				)}
			</div>
		)
	}
	
	// 가게 확정 함수 (단일 테마일 때) - confirmRoute로 리다이렉트
	const confirmStore = async () => {
		await confirmRoute('single')
	}
	
	// 경로 URL 가져오기 함수
	const getRouteUrl = async (routeId) => {
		if (!BACKEND_URL) {
			setSearchError('백엔드 URL이 설정되지 않았습니다.')
			return null
		}
		
		try {
			const r = await fetch(getBackendUrlWithPath(`api/routes/${routeId}`), {
				method: 'GET',
				mode: 'cors',
				credentials: 'omit'
			})
			
			if (!r.ok) {
				const errorText = await r.text()
				throw new Error(errorText)
			}
			
			const data = await r.json()
			return data.route_url
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
			console.error('경로 URL 가져오기 실패:', errorText)
			return null
		}
	}
	
	// 경로 확인하기 버튼 클릭 핸들러
	const handleRouteViewClick = async (e, routeId) => {
		e.preventDefault()
		
		if (routeId) {
			addRouteHistory(routeId)
				.then(() => {
					setToast({ message: '최근 선택 코스에 저장됨' })
				})
				.catch(() => {})
		}

		const routeUrl = await getRouteUrl(routeId)
		if (routeUrl) {
			window.open(routeUrl, '_blank', 'noopener,noreferrer')
		}
	}
	
	// 테마 입력 추가/제거 함수
	const addTheme = () => {
		setSearchThemes([...searchThemes, ''])
	}
	
	const removeTheme = (index) => {
		if (searchThemes.length > 1) {
			setSearchThemes(searchThemes.filter((_, i) => i !== index))
		}
	}
	
	const updateTheme = (index, value) => {
		const newThemes = [...searchThemes]
		newThemes[index] = value
		setSearchThemes(newThemes)
	}
	
	// 리뷰 요약 상태 확인 (폴링) - 가게 후보용
	useEffect(() => {
		if (!storeCandidates || storeCandidates.length === 0) return
		
		const processingStores = storeCandidates.filter(s => s.summary_status === 'processing')
		if (processingStores.length === 0) return
		
		const checkReviews = async () => {
			try {
				const promises = processingStores.map(store => 
					fetch(getBackendUrlWithPath(`api/stores/${store.store_id}/review`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null).catch(() => null)
				)
				
				const results = await Promise.all(promises)
				const updatedStores = storeCandidates.map(store => {
					const result = results.find(r => r && r.store_id === store.store_id)
					// API 호출이 성공(200)하면 review_summary가 있음 → summary_status='ready'로 업데이트
					if (result && store.summary_status === 'processing') {
						return {
							...store,
							summary_status: 'ready',
							review_summary: result
						}
					}
					return store
				})
				
				// 변경사항이 있으면 업데이트
				if (updatedStores.some((s, idx) => 
					s.summary_status === 'ready' && 
					storeCandidates[idx]?.summary_status === 'processing')) {
					setStoreCandidates(updatedStores)
				}
			} catch (e) {
				console.error('Failed to check reviews:', e)
			}
		}
		
		const interval = setInterval(checkReviews, 3000) // 3초마다 확인
		return () => clearInterval(interval)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [storeCandidates])
	
	// 리뷰 요약 상태 확인 (폴링) - 빠른 검색 결과용
	const resultRef = useRef(result)
	useEffect(() => {
		resultRef.current = result
	}, [result])
	
	useEffect(() => {
		if (!result || !result.waypoints || result.waypoints.length === 0) return
		
		const processingWaypoints = result.waypoints.filter(w => w.store_id && w.summary_status === 'processing')
		if (processingWaypoints.length === 0) return
		
		const checkWaypointReviews = async () => {
			const currentResult = resultRef.current
			if (!currentResult || !currentResult.waypoints || currentResult.waypoints.length === 0) return
			
			try {
				const processingWaypoints = currentResult.waypoints.filter(w => w.store_id && w.summary_status === 'processing')
				if (processingWaypoints.length === 0) return
				
				const promises = processingWaypoints.map(waypoint =>
					fetch(getBackendUrlWithPath(`api/stores/${waypoint.store_id}/review`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null).catch(() => null)
				)
				
				const results = await Promise.all(promises)
				const updatedWaypoints = currentResult.waypoints.map(waypoint => {
					if (!waypoint.store_id || waypoint.summary_status !== 'processing') {
						return waypoint
					}
					const fetchedReview = results.find(r => r && r.store_id === waypoint.store_id)
					if (fetchedReview) {
						return {
							...waypoint,
							summary_status: 'ready',
							review_summary: fetchedReview
						}
					}
					return waypoint
				})
				
				const hasUpdate = updatedWaypoints.some((w, idx) =>
					w.summary_status === 'ready' && currentResult.waypoints[idx]?.summary_status === 'processing'
				)
				
				if (hasUpdate) {
					setResult({ ...currentResult, waypoints: updatedWaypoints })
				}
			} catch (e) {
				console.error('Failed to check waypoint reviews:', e)
			}
		}
		
		checkWaypointReviews()
		const interval = setInterval(checkWaypointReviews, 3000) // 3초마다 확인
		return () => clearInterval(interval)
	}, [result])
	
	// 리뷰 요약 상태 확인 (폴링) - 경로 후보용
	const routeCandidatesRef = useRef(routeCandidates)
	
	// routeCandidates가 변경될 때마다 ref 업데이트
	useEffect(() => {
		routeCandidatesRef.current = routeCandidates
	}, [routeCandidates])
	
	useEffect(() => {
		// routeCandidates가 없으면 interval 생성하지 않음
		if (!routeCandidates || routeCandidates.length === 0) return
		
		// processingStores가 0인 상태가 연속으로 몇 번 지속되었는지 추적
		let consecutiveZeroCount = 0
		const MAX_CONSECUTIVE_ZERO = 2 // 연속 2회(6초) 0이면 종료
		
		// interval ID를 저장하여 cleanup에서 확실히 제거
		let intervalId = null
		
		const checkReviews = async () => {
			try {
				// 매번 최신 routeCandidates를 ref에서 가져오기
				const currentRoutes = routeCandidatesRef.current
				if (!currentRoutes || currentRoutes.length === 0) {
					console.log('[poll] routes length', 0, '- skip: no routes in ref')
					consecutiveZeroCount++
					if (consecutiveZeroCount >= MAX_CONSECUTIVE_ZERO) {
						console.log('[poll] stopping: no routes in ref for', consecutiveZeroCount, 'consecutive times')
						if (intervalId) clearInterval(intervalId)
					}
					return
				}
				
				// 디버깅: 경로 구조 확인
				console.log('[poll] routes length', currentRoutes.length)
				console.log('[poll] 첫 번째 경로 구조:', currentRoutes[0] ? {
					route_id: currentRoutes[0].route_id,
					has_stores: !!currentRoutes[0].stores,
					stores_type: Array.isArray(currentRoutes[0].stores) ? 'array' : typeof currentRoutes[0].stores,
					stores_length: currentRoutes[0].stores?.length || 0,
					stores_keys: currentRoutes[0].stores?.[0] ? Object.keys(currentRoutes[0].stores[0]) : []
				} : 'no first route')
				
				// 모든 경로의 모든 가게에서 processing 상태인 것 찾기
				// route.stores가 배열인지 확인하고, 각 store가 store_id와 summary_status를 가지고 있는지 확인
				const allStores = currentRoutes.flatMap(route => {
					// route.stores가 배열이고 각 요소가 객체인지 확인
					if (!route || !route.stores || !Array.isArray(route.stores)) {
						console.warn('[poll] route.stores is not an array:', route)
						return []
					}
					return route.stores.filter(store => {
						// store_id와 summary_status가 있는지 확인
						if (!store || !store.store_id || !store.summary_status) {
							console.warn('[poll] store missing required fields:', store)
							return false
						}
						return true
					})
				})
				
				const processingStores = allStores.filter(s => {
					const isProcessing = s.summary_status === 'processing'
					if (isProcessing && !s.store_id) {
						console.warn('[poll] processing store missing store_id:', s)
					}
					return isProcessing
				})
				
				// 디버깅 로그
				console.log('[poll] allStores count', allStores.length)
				console.log('[poll] processingStores count', processingStores.length)
				console.log('[poll] processing store_ids', processingStores.map(s => s.store_id))
				
				// processingStores가 0이면 연속 카운트 증가
				if (processingStores.length === 0) {
					consecutiveZeroCount++
					console.log('[poll] no processing stores (consecutive count:', consecutiveZeroCount, ')')
					
					// 연속으로 MAX_CONSECUTIVE_ZERO회 0이면 폴링 종료
					if (consecutiveZeroCount >= MAX_CONSECUTIVE_ZERO) {
						console.log('[poll] all stores are ready! stopping polling after', consecutiveZeroCount, 'consecutive checks')
						if (intervalId) {
							clearInterval(intervalId)
							intervalId = null
						}
					}
					return // 요청만 skip
				}
				
				// processingStores가 있으면 연속 카운트 리셋
				consecutiveZeroCount = 0
				
				// processingStores가 있으면 GET 요청 실행
				const promises = processingStores.map(store => 
					fetch(getBackendUrlWithPath(`api/stores/${store.store_id}/review`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null).catch(() => null)
				)
				
				const results = await Promise.all(promises)
				
				// 최신 routeCandidates를 다시 가져와서 업데이트
				const latestRoutes = routeCandidatesRef.current
				if (!latestRoutes || latestRoutes.length === 0) {
					console.log('[poll] skip update: no routes in ref')
					return // 업데이트만 skip
				}
				
				// API 호출이 성공(200)한 store_id 목록 추출 (review_summary가 있음)
				const readyStoreIds = results
					.filter(r => r && r.store_id)
					.map(r => r.store_id)
				
				if (readyStoreIds.length === 0) {
					console.log('[poll] no ready stores found')
					return
				}
				
				console.log('[poll] ready store_ids to update:', readyStoreIds)
				
				// 불변 업데이트: routes 전체를 map, 각 route의 stores 배열을 map, store_id 일치하는 항목만 교체
				const updatedRoutes = latestRoutes.map(route => {
					// route의 stores 배열에서 업데이트가 필요한 store가 있는지 확인
					const hasStoreToUpdate = route.stores.some(store => 
						readyStoreIds.includes(store.store_id) && store.summary_status === 'processing'
					)
					
					if (!hasStoreToUpdate) {
						// 업데이트할 store가 없으면 route 객체 그대로 반환
						return route
					}
					
					// 업데이트가 필요한 경우: stores 배열을 map하여 해당 store_id만 교체
					const updatedStores = route.stores.map(store => {
						// store_id가 ready 목록에 있고, 현재 processing 상태인 경우만 업데이트
						if (readyStoreIds.includes(store.store_id) && store.summary_status === 'processing') {
							const result = results.find(r => r && r.store_id === store.store_id)
							if (result) {
								console.log(`[poll] updating store ${store.store_id} (${store.name})`)
								return {
									...store, // 기존 store 속성 유지
									summary_status: 'ready', // 'ready'로 업데이트
									review_summary: result // review_summary 업데이트
								}
							}
						}
						// 업데이트할 필요 없으면 store 객체 그대로 반환
						return store
					})
					
					// route 객체를 불변 업데이트
					return {
						...route, // 기존 route 속성 유지
						stores: updatedStores // 업데이트된 stores 배열로 교체
					}
				})
				
				// 실제로 변경사항이 있는지 확인 (참조 비교)
				const hasUpdate = updatedRoutes.some((route, routeIdx) => {
					const originalRoute = latestRoutes[routeIdx]
					if (!originalRoute) return false
					
					// stores 배열이 변경되었는지 확인
					return route.stores.some((store, storeIdx) => {
						const originalStore = originalRoute.stores[storeIdx]
						if (!originalStore) return false
						
						// summary_status가 processing에서 ready로 변경되었는지 확인
						return originalStore.summary_status === 'processing' && 
						       store.summary_status === 'ready'
					})
				})
				
				if (hasUpdate) {
					console.log('[poll] updating routeCandidates: partial update by store_id')
					setRouteCandidates(updatedRoutes)
				} else {
					console.log('[poll] no updates needed (already updated or no changes)')
				}
			} catch (e) {
				console.error('Failed to check reviews:', e)
			}
		}
		
		// routeCandidates가 존재하면 무조건 interval 생성
		// 즉시 한 번 실행하고, 이후 3초마다 확인
		checkReviews()
		intervalId = setInterval(checkReviews, 3000) // 3초마다 확인
		
		// cleanup: 컴포넌트 unmount 시 또는 routeCandidates 변경 시 interval 제거
		return () => {
			console.log('[poll] cleanup: clearing interval')
			if (intervalId) {
				clearInterval(intervalId)
				intervalId = null
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [routeCandidates])

	// 추천 코스 탭 로드
	useEffect(() => {
		const loadTabs = async () => {
			setLoadingTabs(true)
			setErrorTabs(null)
			try {
				const data = await fetchRouteTabs({ limit: 10, days: 30 })
				setTabs(data.tabs || [])
				// 기본값은 "__ALL__"이므로 자동으로 전체 경로 로드
			} catch (error) {
				console.error('Failed to load route tabs:', error)
				setErrorTabs(error.message || '탭을 불러오는데 실패했습니다.')
			} finally {
				setLoadingTabs(false)
			}
		}
		loadTabs()
	}, [])

	// 선택된 탭으로 경로 로드
	useEffect(() => {
		if (!selectedTab) return

		const loadRoutes = async () => {
			setLoadingRoutes(true)
			setErrorRoutes(null)
			try {
				if (selectedTab === '__ALL__') {
					// 전체 추천 리스트 구성
					// 상위 N개(6개) 키워드만 사용
					const topKeywords = tabs.slice(0, 6).map(tab => tab.keyword)
					
					if (topKeywords.length === 0) {
						setRoutes([])
						setLoadingRoutes(false)
						return
					}
					
					// 각 keyword에 대해 /api/routes/by-keyword 호출 (limit=3)
					const promises = topKeywords.map(keyword =>
						fetchRoutesByKeyword({ keyword, limit: 3, days: 90 })
							.catch(err => {
								console.error(`Failed to load routes for keyword ${keyword}:`, err)
								return [] // 에러 시 빈 배열 반환
							})
					)
					
					const results = await Promise.all(promises)
					
					// 결과 합치기
					let allRoutes = []
					results.forEach(routeList => {
						if (Array.isArray(routeList)) {
							allRoutes = allRoutes.concat(routeList)
						}
					})
					
					// route_id 기준 중복 제거
					const uniqueRoutes = []
					const seenRouteIds = new Set()
					for (const route of allRoutes) {
						if (route.route_id && !seenRouteIds.has(route.route_id)) {
							seenRouteIds.add(route.route_id)
							uniqueRoutes.push(route)
						}
					}
					
					// 최신순(created_at desc)으로 정렬
					uniqueRoutes.sort((a, b) => {
						const dateA = a.created_at ? new Date(a.created_at) : new Date(0)
						const dateB = b.created_at ? new Date(b.created_at) : new Date(0)
						return dateB - dateA // 내림차순
					})
					
					setRoutes(uniqueRoutes)
				} else {
					// 특정 키워드로 경로 로드
					const data = await fetchRoutesByKeyword({ keyword: selectedTab, limit: 10, days: 90 })
					setRoutes(data || [])
				}
			} catch (error) {
				console.error('Failed to load routes:', error)
				setErrorRoutes(error.message || '경로를 불러오는데 실패했습니다.')
			} finally {
				setLoadingRoutes(false)
			}
		}
		loadRoutes()
	}, [selectedTab, tabs])

	// 탭 클릭 핸들러
	const handleTabClick = (tabValue) => {
		setSelectedTab(tabValue)
		setSelectedRecommendedRoute(null) // 탭 변경 시 선택 초기화
		setSelectedRouteStoresWithStatus([])
		setConfirmEnabled(false)
	}
	
	// 추천 경로 카드 클릭 핸들러
	const handleRecommendedRouteClick = async (route) => {
		setSelectedRecommendedRoute(route)
		
		// stores에 summary_status 정보가 없으므로, 각 store_id에 대해 API 호출
		if (route.stores && route.stores.length > 0) {
			try {
				const storesWithStatus = await Promise.all(
					route.stores.map(async (store) => {
						const storeId = store.store_id
						if (!storeId) return { ...store, summary_status: 'unknown' }
						
						try {
							const response = await fetch(getBackendUrlWithPath(`api/stores/${storeId}`), {
								method: 'GET',
								mode: 'cors',
								credentials: 'omit'
							})
							
							if (response.ok) {
								const storeData = await response.json()
								return {
									...store,
									summary_status: storeData.summary_status || 'processing',
									review_summary: storeData.review_summary
								}
							} else {
								return { ...store, summary_status: 'processing' }
							}
						} catch (error) {
							console.error(`Failed to fetch store ${storeId}:`, error)
							return { ...store, summary_status: 'processing' }
						}
					})
				)
				setSelectedRouteStoresWithStatus(storesWithStatus)
			} catch (error) {
				console.error('Failed to fetch store statuses:', error)
				setSelectedRouteStoresWithStatus(route.stores.map(store => ({ ...store, summary_status: 'processing' })))
			}
		} else {
			setSelectedRouteStoresWithStatus([])
		}
	}

	const handleSelectStore = (store) => {
		setSelectedStore(store)
		if (store?.store_id) {
			logStoreTheme(getPrimaryTheme() || '코스', store.store_id)
		}
	}

	const handleSelectRouteCandidate = (route) => {
		setSelectedRoute(route)
		if (route?.stores && Array.isArray(route.stores)) {
			route.stores.forEach((store) => {
				if (store?.store_id) {
					logStoreTheme('코스', store.store_id)
				}
			})
		}
	}
	
	// confirmEnabled 계산
	useEffect(() => {
		if (!selectedRecommendedRoute || !selectedRouteStoresWithStatus || selectedRouteStoresWithStatus.length === 0) {
			setConfirmEnabled(false)
			return
		}
		
		// 모든 store가 complete인지 확인
		const allComplete = selectedRouteStoresWithStatus.every(store => {
			const status = store.summary_status
			// summary_status가 'ready' 또는 'complete'이면 완료
			// summary_status가 없으면 review_summary 존재 여부로 판정
			return status === 'ready' || status === 'complete' || (status === undefined && store.review_summary)
		})
		
		setConfirmEnabled(allComplete)
	}, [selectedRecommendedRoute, selectedRouteStoresWithStatus])
	
	// polling: selectedRecommendedRoute가 있고, pending인 store가 있을 때만
	useEffect(() => {
		if (!selectedRecommendedRoute || !selectedRouteStoresWithStatus || selectedRouteStoresWithStatus.length === 0) {
			return
		}
		
		const pendingStores = selectedRouteStoresWithStatus.filter(store => {
			const status = store.summary_status
			return status === 'processing' || (!status && !store.review_summary)
		})
		
		if (pendingStores.length === 0) {
			return // 모든 store가 complete이면 polling 불필요
		}
		
		const checkStoreReviews = async () => {
			try {
				const promises = pendingStores.map(store => {
					const storeId = store.store_id
					if (!storeId) return Promise.resolve(null)
					
					return fetch(getBackendUrlWithPath(`api/stores/${storeId}`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					})
						.then(r => r.ok ? r.json() : null)
						.catch(() => null)
				})
				
				const results = await Promise.all(promises)
				
				// selectedRouteStoresWithStatus 업데이트
				setSelectedRouteStoresWithStatus(prevStores => {
					return prevStores.map(store => {
						const result = results.find(r => r && r.store_id === store.store_id)
						if (result) {
							return {
								...store,
								summary_status: result.summary_status || 'ready',
								review_summary: result.review_summary
							}
						}
						return store
					})
				})
			} catch (error) {
				console.error('Failed to check store reviews:', error)
			}
		}
		
		checkStoreReviews()
		const interval = setInterval(checkStoreReviews, 3000) // 3초마다 확인
		
		return () => clearInterval(interval)
	}, [selectedRecommendedRoute, selectedRouteStoresWithStatus])

	return (
		<div className="app-container page-bg">
			{toast && (
				<div className="app-toast">
					<span>{toast.message}</span>
					{toast.actionLabel && (
						<button
							type="button"
							className="app-toast-btn"
							onClick={() => {
								toast.action?.()
								setToast(null)
							}}
						>
							{toast.actionLabel}
						</button>
					)}
					<button
						type="button"
						className="app-toast-close"
						onClick={() => setToast(null)}
					>
						닫기
					</button>
				</div>
			)}
			<header className="app-header">
				<div className="header-top">
					<button
						type="button"
						className="logo-button"
						onClick={() => navigate('/')}
						aria-label="홈으로 이동"
					>
						<img src="/logo.png" alt="Run2Style Logo" className="app-logo" />
					</button>
					<div className="header-actions">
						<button
							type="button"
							className="header-profile-btn"
							onClick={() => {
								const accessToken = localStorage.getItem('access_token')
								if (accessToken) {
									navigate('/mypage')
								} else {
									navigate('/login?next=/mypage')
								}
							}}
							aria-label="마이페이지"
						>
						{isAuthenticated && (userInfo?.profile_image_url || userInfo?.profile_image) ? (
								<img
								src={userInfo.profile_image_url || userInfo.profile_image}
									alt="프로필"
									className="header-profile-img"
								/>
							) : (
								<span className="header-profile-fallback">👤</span>
							)}
						</button>
						{isAuthenticated && userInfo && (
							<span className="user-info">
								{userInfo.nickname || userInfo.email}님
							</span>
						)}
						{isAuthenticated ? (
							<button
								onClick={handleLogout}
								className="header-btn logout-btn"
							>
								로그아웃
							</button>
						) : (
							<button
								onClick={() => navigate('/login')}
								className="header-btn login-btn"
							>
								로그인
							</button>
						)}
					</div>
				</div>
				<div className="hero-title-strip">
					<h2 className="app-title">러닝 코스 랜덤 추천</h2>
				</div>
			</header>
			
			{/* 콘텐츠 패널 */}
			<div className="content-panel">
				{/* Hero 영역 */}
				<div className="hero-section">
					<h1 className="hero-title">오늘은 어떤 러닝을 하고 싶나요?</h1>
					<div className="hero-message">
						{heroMessage}
					</div>
				</div>
				
				{/* 안전 러닝 배너 (rainy/snowy일 때만) */}
				{(currentWeatherGroup === 'rainy' || currentWeatherGroup === 'snowy') && (
					<div className="safety-banner">
						<div className="safety-banner-content">
							<span className="safety-icon">
								{currentWeatherGroup === 'rainy' ? '☔' : '❄️'}
							</span>
							<span className="safety-message">
								{currentWeatherGroup === 'rainy' 
									? '노면이 미끄러울 수 있어요. 짧고 안전하게 달려요'
									: '미끄럼 주의! 평지 위주로 짧게 추천해요'}
							</span>
							<button
								className={`safety-toggle-btn ${safetyModeEnabled ? 'active' : ''}`}
								onClick={() => setSafetyModeEnabled(!safetyModeEnabled)}
								aria-label="안전 모드 토글"
								aria-pressed={safetyModeEnabled}
							>
								{safetyModeEnabled ? '안전 모드 ON' : '안전 모드 OFF'}
							</button>
						</div>
						{safetyModeEnabled && (
							<div className="safety-guide">
								권장 거리: 3~5km | 평지 위주 코스 추천
							</div>
						)}
					</div>
				)}
				
				{/* 러닝 옵션 섹션 */}
				<div className="running-options-section">
					<div className="running-options-grid">
						<button 
							className="running-option-btn"
							onClick={() => {
								setWaypoints([{ theme_keyword: '', order: 1 }])
								setTotalDistanceKm(5)
							}}
						>
							<span className="option-icon">🏃</span>
							<span className="option-text">가볍게 달리기</span>
						</button>
						<button 
							className="running-option-btn"
							onClick={() => {
								setWaypoints([{ theme_keyword: '카페', order: 1 }])
								setTotalDistanceKm(6.8)
							}}
						>
							<span className="option-icon">☕</span>
							<span className="option-text">카페 들러가는 런닝</span>
						</button>
						<button 
							className="running-option-btn"
							onClick={() => {
								setWaypoints([{ theme_keyword: '야경', order: 1 }])
								setTotalDistanceKm(7.2)
							}}
						>
							<span className="option-icon">🌙</span>
							<span className="option-text">야간 감성 런닝</span>
						</button>
						<button 
							className="running-option-btn"
							onClick={() => {
								setWaypoints([{ theme_keyword: '맥주', order: 1 }])
								setTotalDistanceKm(6)
							}}
						>
							<span className="option-icon">🍺</span>
							<span className="option-text">러닝 후 한 잔</span>
						</button>
					</div>
				</div>

				{/* 추천 러닝 코스 섹션 */}
				<div className="recommended-courses-section">
					<h3 className="section-title">추천 러닝 코스는 어떠세요?</h3>
					
					{/* 탭 목록 */}
					{loadingTabs ? (
						<div className="courses-loading">로딩 중...</div>
					) : errorTabs ? (
						<div className="courses-error">{errorTabs}</div>
					) : tabs.length === 0 ? (
						<div className="courses-empty">아직 데이터가 부족해요. 첫 코스를 확정해보세요!</div>
					) : (
						<>
							<div className="courses-tabs">
								{/* 전체 탭 (고정) */}
								<button
									className={`course-tab ${selectedTab === '__ALL__' ? 'active' : ''}`}
									onClick={() => handleTabClick('__ALL__')}
								>
									<span className="course-tab-keyword">전체</span>
								</button>
								
								{/* 키워드 탭들 */}
								{tabs.map((tab) => (
									<button
										key={tab.keyword}
										className={`course-tab ${selectedTab === tab.keyword ? 'active' : ''}`}
										onClick={() => handleTabClick(tab.keyword)}
									>
										<span className="course-tab-keyword">{tab.keyword}</span>
										{tab.usage_count > 0 && (
											<span className="course-tab-count">{tab.usage_count}회</span>
										)}
									</button>
								))}
							</div>
							
							{/* 경로 목록 (가로 스크롤 카드) */}
							{loadingRoutes ? (
								<div className="courses-loading">경로를 불러오는 중...</div>
							) : errorRoutes ? (
								<div className="courses-error">{errorRoutes}</div>
							) : routes.length === 0 ? (
								<div className="courses-empty">
									{selectedTab === '__ALL__' 
										? '아직 추천 코스가 없어요. 첫 코스를 확정해보세요!' 
										: '이 키워드로 등록된 코스가 없어요.'}
								</div>
							) : (
								<>
									<div className="courses-carousel">
										{routes.map((route) => (
											<div 
												key={route.route_id} 
												className={`course-card ${selectedRecommendedRoute?.route_id === route.route_id ? 'selected' : ''}`}
												onClick={() => handleRecommendedRouteClick(route)}
											>
												<button
													type="button"
													className={`bookmark-toggle ${bookmarkRouteIds.includes(route.route_id) ? 'active' : ''}`}
													onClick={(e) => toggleBookmark(e, route.route_id)}
													aria-label="북마크"
												>
													{bookmarkRouteIds.includes(route.route_id) ? '★' : '☆'}
												</button>
												{/* keyword 뱃지 */}
												{route.keyword && (
													<div className="course-keyword-badge">{route.keyword}</div>
												)}
												
												{/* one_liner */}
												{route.one_liner && (
													<div className="course-info">{route.one_liner}</div>
												)}
												
												{/* 거리/시간 */}
												<div className="course-details">
													{route.total_distance_km && (
														<span>약 {route.total_distance_km}km</span>
													)}
													{route.estimated_time_min && (
														<span> · {route.estimated_time_min}분</span>
													)}
												</div>
												
												{/* stores 1~2개 */}
												{route.stores && route.stores.length > 0 && (
													<div className="course-stores">
														{route.stores.slice(0, 2).map((store, idx) => (
															<span key={idx} className="course-store-item">
																{store.order || idx + 1}. {store.name || store.store_id || '경유지'}
															</span>
														))}
													</div>
												)}
											</div>
										))}
									</div>
									
									{/* 확정 버튼 및 안내 문구 */}
									{selectedRecommendedRoute && (
										<div className="recommended-route-confirm-section" style={{ marginTop: '20px' }}>
											{!confirmEnabled && (
												<div className="confirm-message">
													AI 리뷰 요약이 완료되면 확인할 수 있어요.
												</div>
											)}
											<button
												onClick={(e) => handleRouteViewClick(e, selectedRecommendedRoute.route_id)}
												disabled={!confirmEnabled}
												className={`confirm-btn ${!confirmEnabled ? 'disabled' : ''}`}
											>
												경로 확인하기
											</button>
										</div>
									)}
								</>
							)}
						</>
					)}
				</div>
			</div>

			{/* 지도는 패널 바깥 */}
			<MapPicker onPick={onPick} onSelectLocation={handleSelectLocation} />
			
			{/* 폼 패널 */}
			<div className="form-panel">
				{/* 모드 선택 탭 */}
				<div className="mode-selector">
					<button
						className={`mode-btn ${mode === 'quick' ? 'active' : ''}`}
						onClick={() => {
							setMode('quick')
							setStoreCandidates(null)
							setRouteCandidates(null)
							setSelectedStore(null)
							setSelectedRoute(null)
							setRouteResult(null)
						}}
					>
						빠른 검색
					</button>
					<button
						className={`mode-btn ${mode === 'detail' ? 'active' : ''}`}
						onClick={() => {
							setMode('detail')
							setStoreCandidates(null)
							setRouteCandidates(null)
							setSelectedStore(null)
							setSelectedRoute(null)
							setRouteResult(null)
						}}
					>
						상세 검색
					</button>
				</div>
				
				{/* 빠른 검색 모드 */}
				{mode === 'quick' && (
					<div className="form-container">
					<div className="input-grid">
						<div className="input-group">
							<label>총 러닝 거리 (km)</label>
							<input 
								type="number" 
								value={totalDistanceKm} 
								min={1} 
								step={0.5} 
								onChange={(e) => setTotalDistanceKm(Number(e.target.value))} 
							/>
						</div>
						<div className="input-group">
							<label>왕복/편도</label>
							<div className="radio-group">
								<label className="radio-option">
									<input 
										type="radio" 
										checked={isRoundTrip} 
										onChange={() => setIsRoundTrip(true)}
									/>
									왕복
								</label>
								<label className="radio-option">
									<input 
										type="radio" 
										checked={!isRoundTrip} 
										onChange={() => setIsRoundTrip(false)}
									/>
									편도
								</label>
							</div>
						</div>
					</div>

					<div className="waypoints-section">
						<div className="waypoints-header">
							<div>
								<label className="waypoints-title">경유지 설정</label>
								<div className="waypoints-subtitle">
									드래그하여 순서를 변경할 수 있습니다
								</div>
							</div>
							<button 
								onClick={addWaypoint}
								className="add-waypoint-btn"
							>
								+ 경유지 추가
							</button>
						</div>
						
						{waypoints.map((waypoint, index) => (
							<div 
								key={waypoint.order} 
								draggable
								onDragStart={(e) => handleDragStart(e, waypoint.order)}
								onDragOver={handleDragOver}
								onDrop={(e) => handleDrop(e, waypoint.order)}
								onDragEnd={handleDragEnd}
								className={`waypoint-item ${draggedItem === waypoint.order ? 'dragging' : ''}`}
							>
								<span className="waypoint-order">
									<span className="drag-handle">⋮⋮</span>
									{waypoint.order}
								</span>
								<input 
									value={waypoint.theme_keyword}
									onChange={(e) => updateWaypoint(waypoint.order, e.target.value)}
									placeholder="경유지 키워드 (예: 카페, 맛집, 맥주)"
									className="waypoint-input"
									onMouseDown={(e) => e.stopPropagation()}
								/>
								<button 
									onClick={() => removeWaypoint(waypoint.order)}
									className="remove-waypoint-btn"
								>
									−
								</button>
							</div>
						))}
					</div>

					<div className="submit-container">
						<button 
							disabled={!canSubmit || loading} 
							onClick={submit} 
							className="submit-btn route-confirm-btn"
						>
							{loading ? '추천중...' : '이 루트로 달릴게요'}
						</button>
					</div>
				</div>
			)}
			
			{/* 상세 검색 모드 */}
			{mode === 'detail' && (
				<div className="form-container">
					<div className="input-grid">
						<div className="input-group">
							<label>총 러닝 거리 (km)</label>
							<input 
								type="number" 
								value={totalDistanceKm} 
								min={1} 
								step={0.5} 
								onChange={(e) => setTotalDistanceKm(Number(e.target.value))} 
							/>
						</div>
						<div className="input-group">
							<label>왕복/편도</label>
							<div className="radio-group">
								<label className="radio-option">
									<input 
										type="radio" 
										checked={isRoundTrip} 
										onChange={() => setIsRoundTrip(true)}
									/>
									왕복
								</label>
								<label className="radio-option">
									<input 
										type="radio" 
										checked={!isRoundTrip} 
										onChange={() => setIsRoundTrip(false)}
									/>
									편도
								</label>
							</div>
						</div>
					</div>
					
					<div className="input-group theme-search-group">
						<label>테마 검색어 (경유지별)</label>
						<div className="theme-inputs-container">
							{searchThemes.map((theme, index) => (
								<div key={index} className="theme-input-row">
									<input 
										type="text" 
										value={theme}
										onChange={(e) => updateTheme(index, e.target.value)}
										placeholder={`경유지 ${index + 1} 테마 (예: 카페, 맛집, 맥주 등)`}
										className="theme-input"
										onKeyPress={(e) => e.key === 'Enter' && searchStoresByTheme()}
									/>
									{searchThemes.length > 1 && (
										<button
											onClick={() => removeTheme(index)}
											className="remove-theme-btn"
										>
											삭제
										</button>
									)}
								</div>
							))}
							<button
								onClick={addTheme}
								className="add-theme-btn"
							>
								+ 테마 추가
							</button>
						</div>
						<button
							onClick={searchStoresByTheme}
							disabled={!lat || !lng || searchThemes.every(t => !t.trim()) || searchLoading}
							className="search-btn"
						>
							{searchLoading ? '검색중...' : '검색'}
						</button>
					</div>
					
					{searchError && <div className="error-message">{searchError}</div>}
					
					{/* 가게 후보 목록 (경유지 1개일 때) */}
					{searchType === 'single' && storeCandidates !== null && (
						<div className="store-candidates" style={{ marginTop: '20px' }}>
							{storeCandidates.length > 0 ? (
								<>
									<h3 className="candidates-title">추천 가게 (3개)</h3>
									{storeCandidates.map((store, index) => (
								<div
									key={store.store_id}
									onClick={() => handleSelectStore(store)}
									className={`store-card ${selectedStore?.store_id === store.store_id ? 'selected' : ''}`}
								>
									<div className="store-name">
										{index + 1}. {store.name}
									</div>
									<div className="store-address">
										📍 {store.address}
									</div>
									{store.phone && (
										<div className="store-phone">
											📞 {store.phone}
										</div>
									)}
									<div style={{ marginTop: '10px' }}>
										{(!store.summary_status || store.summary_status === 'processing') && !store.review_summary ? (
											<div className="review-processing">
												⏳ AI가 리뷰를 요약 중입니다...
											</div>
										) : store.review_summary ? (
											<div className="review-summary">
												<div className="review-complete">
													✓ 리뷰 요약 완료
												</div>
												{store.review_summary.main_menu && store.review_summary.main_menu.length > 0 && (
													<div className="review-item">
														메뉴: {store.review_summary.main_menu.join(', ')}
													</div>
												)}
												{store.review_summary.atmosphere && store.review_summary.atmosphere.length > 0 && (
													<div className="review-item">
														분위기: {store.review_summary.atmosphere.join(', ')}
													</div>
												)}
												{store.review_summary.recommended_for && store.review_summary.recommended_for.length > 0 && (
													<div className="review-item">
														추천: {store.review_summary.recommended_for.join(', ')}
													</div>
												)}
											</div>
										) : null}
									</div>
								</div>
									))}
									
									{selectedStore && (
										<div className="confirm-container">
											<button
												onClick={confirmStore}
												disabled={searchLoading}
												className="confirm-btn"
											>
												{searchLoading ? '확정 중...' : '확정'}
											</button>
										</div>
									)}
								</>
							) : (
								<div className="no-results">
									검색 결과가 없습니다. 다른 테마나 위치로 검색해보세요.
								</div>
							)}
						</div>
					)}
					
					{/* 경로 후보 목록 (경유지 2개 이상일 때) */}
					{searchType === 'route' && routeCandidates !== null && (
						<div className="route-candidates" style={{ marginTop: '20px' }}>
							{routeCandidates.length > 0 ? (
								<>
									<h3 className="candidates-title">추천 경로 (최대 3개)</h3>
									{routeCandidates.map((route, routeIndex) => (
								<div
									key={route.route_id}
									onClick={() => handleSelectRouteCandidate(route)}
									className={`route-card ${selectedRoute?.route_id === route.route_id ? 'selected' : ''}`}
								>
									<div className="route-title">
										경로 {routeIndex + 1} (총 거리: {route.total_distance_km}km)
									</div>
									{route.stores && route.stores.map((store, storeIndex) => (
										<div key={store.store_id} className="route-store-item">
											<div className="store-name">
												{storeIndex + 1}. {store.name}
											</div>
											<div className="store-address">
												📍 {store.address}
											</div>
											{store.phone && (
												<div className="store-phone">
													📞 {store.phone}
												</div>
											)}
											<div className="review-section">
												{(!store.summary_status || store.summary_status === 'processing') && !store.review_summary ? (
													<div className="review-processing">
														⏳ AI가 리뷰를 요약 중입니다...
													</div>
												) : store.review_summary ? (
													<div className="review-summary">
														<div className="review-complete">
															✓ 리뷰 요약 완료
														</div>
														{store.review_summary.main_menu && store.review_summary.main_menu.length > 0 && (
															<div className="review-item">
																메뉴: {store.review_summary.main_menu.join(', ')}
															</div>
														)}
														{store.review_summary.atmosphere && store.review_summary.atmosphere.length > 0 && (
															<div className="review-item">
																분위기: {store.review_summary.atmosphere.join(', ')}
															</div>
														)}
														{store.review_summary.recommended_for && store.review_summary.recommended_for.length > 0 && (
															<div className="review-item">
																추천: {store.review_summary.recommended_for.join(', ')}
															</div>
														)}
													</div>
												) : null}
											</div>
										</div>
									))}
								</div>
							))}
							
									{selectedRoute && (
										<div className="confirm-container">
											<button
												onClick={() => confirmRoute('route')}
												disabled={searchLoading}
												className="confirm-btn"
											>
												{searchLoading ? '확정 중...' : '경로 확정'}
											</button>
										</div>
									)}
								</>
							) : (
								<div className="no-results">
									검색 결과가 없습니다. 다른 테마나 위치로 검색해보세요.
								</div>
							)}
						</div>
					)}
					
					{/* 경로 결과 */}
					{routeResult && (
						<div className="result-container" style={{ marginTop: '20px' }}>
							<h3 className="result-title">✅ 경로 확정 완료</h3>
							<div className="result-summary">
								목표 러닝 거리: <strong>{routeResult.total_distance_km ?? totalDistanceKm ?? '-'}km</strong> | 
								실제 총 거리: <strong>{routeResult.actual_total_distance_km ?? '-'}km</strong> ({routeResult.is_round_trip ?? routeResult.is_roundtrip ?? isRoundTrip ? '왕복' : '편도'})
							</div>
							{renderRouteSummary()}
							{routeResult.waypoints && routeResult.waypoints.length > 0 && (
								<div className="route-waypoints-list">
									{routeResult.waypoints.map((waypoint, index) => (
										<div key={waypoint.order} className="route-waypoint-item">
											<div className="waypoint-result-title">{index + 1}. {waypoint.place_name}</div>
											{(!waypoint.summary_status || waypoint.summary_status === 'processing') && !waypoint.review_summary ? (
												<div className="review-processing">
													⏳ AI가 리뷰를 요약 중입니다...
												</div>
											) : waypoint.review_summary ? (
												<div className="route-review-summary">
													<div className="review-complete">
														✓ 리뷰 요약 완료
													</div>
													{waypoint.review_summary.main_menu && waypoint.review_summary.main_menu.length > 0 && (
														<div className="review-item">메뉴: {waypoint.review_summary.main_menu.join(', ')}</div>
													)}
													{waypoint.review_summary.atmosphere && waypoint.review_summary.atmosphere.length > 0 && (
														<div className="review-item">분위기: {waypoint.review_summary.atmosphere.join(', ')}</div>
													)}
													{waypoint.review_summary.recommended_for && waypoint.review_summary.recommended_for.length > 0 && (
														<div className="review-item">추천: {waypoint.review_summary.recommended_for.join(', ')}</div>
													)}
												</div>
											) : null}
										</div>
									))}
								</div>
							)}
							{/* 경로 확인하기 버튼 (확정 완료 후) */}
							{confirmedRouteId ? (
								<button 
									onClick={(e) => handleRouteViewClick(e, confirmedRouteId)}
									className="route-link"
									style={{ marginTop: '20px', display: 'block', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit' }}
								>
									🗺️ 경로 확인하기
								</button>
							) : routeResult.route_url ? (
								<a 
									href={routeResult.route_url} 
									target="_blank" 
									rel="noreferrer"
									className="route-link"
								>
									🗺️ 걷기 길찾기 열기
								</a>
							) : null}
						</div>
					)}
				</div>
			)}
			</div>

			{error && <div className="error-message">{error}</div>}

					{/* 빠른 검색 결과 */}
			{mode === 'quick' && result && (
				<div className="result-container">
					<div style={{ marginBottom: 12 }}>
						<h3 className="result-title">🏃‍♂️ 러닝 코스 추천 결과</h3>
						<div className="result-summary">
							목표 러닝 거리: <strong>{result.total_distance_km}km</strong> | 
							실제 총 거리: <strong>{result.actual_total_distance_km}km</strong> ({result.is_round_trip ? '왕복' : '편도'})
						</div>
						
						{result.waypoints && result.waypoints.length > 0 ? (
							<div>
								{result.waypoints.map((waypoint, index) => (
									<div 
										key={waypoint.order} 
										className="waypoint-result"
									>
									<div className="waypoint-result-title">
										{waypoint.order}. {waypoint.place_name}
									</div>
									<div className="waypoint-result-address">
										📍 {waypoint.road_address_name || waypoint.address_name || ''}
									</div>
									{waypoint.phone && (
										<div className="waypoint-result-phone">
											📞 {waypoint.phone}
										</div>
									)}
									<div className="review-section">
										{(!waypoint.summary_status || waypoint.summary_status === 'processing') && !waypoint.review_summary ? (
											<div className="review-processing">
												⏳ AI가 리뷰를 요약 중입니다...
											</div>
										) : waypoint.review_summary ? (
											<div className="review-summary">
												<div className="review-complete">
													✓ 리뷰 요약 완료
												</div>
												{waypoint.review_summary.main_menu && waypoint.review_summary.main_menu.length > 0 && (
													<div className="review-item">
														메뉴: {waypoint.review_summary.main_menu.join(', ')}
													</div>
												)}
												{waypoint.review_summary.atmosphere && waypoint.review_summary.atmosphere.length > 0 && (
													<div className="review-item">
														분위기: {waypoint.review_summary.atmosphere.join(', ')}
													</div>
												)}
												{waypoint.review_summary.recommended_for && waypoint.review_summary.recommended_for.length > 0 && (
													<div className="review-item">
														추천: {waypoint.review_summary.recommended_for.join(', ')}
													</div>
												)}
											</div>
										) : null}
									</div>
									</div>
								))}
								
								<div className="candidates-info">
									검토된 장소: {result.candidates_considered}개 중 선택
								</div>
							</div>
						) : (
							<div className="no-results">
								경유지를 찾을 수 없습니다. 다른 키워드나 거리를 시도해보세요.
							</div>
						)}
						
						{/* 경로 확정 버튼 */}
						{result.waypoints && result.waypoints.length > 0 && (
							<div className="confirm-container" style={{ marginTop: '20px' }}>
								<button
									onClick={() => confirmRoute('quick')}
									disabled={searchLoading}
									className="confirm-btn"
								>
									{searchLoading ? '확정 중...' : '경로 확정'}
								</button>
							</div>
						)}
						{renderRouteSummary()}
					</div>
					
					{/* 경로 확인하기 버튼 (확정 완료 후) */}
					{confirmedRouteId && (
						<button 
							onClick={(e) => handleRouteViewClick(e, confirmedRouteId)}
							className="route-link"
							style={{ marginTop: '20px', display: 'block', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit' }}
						>
							🗺️ 경로 확인하기
						</button>
					)}
					
					{/* 기존 경로 링크 (확정 전) */}
					{!confirmedRouteId && result.route_url && (
						<a 
							href={result.route_url} 
							target="_blank" 
							rel="noreferrer"
							className="route-link"
						>
							🗺️ 걷기 길찾기 열기
						</a>
					)}
				</div>
			)}
		</div>
	)
}
