import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { getBackendUrl, getBackendUrlWithPath } from './utils/api.js'

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY
const BACKEND_URL = getBackendUrl()



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

function MapPicker({ onPick }) {
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
			
			// 클릭 이벤트 등록
			kakao.maps.event.addListener(map, 'click', function (mouseEvent) {
				const latlng = mouseEvent.latLng
				marker.setPosition(latlng)
				const lat = latlng.getLat()
				const lng = latlng.getLng()
				setCoords({ lat, lng })
				onPick(lat, lng)
			})
			
			console.log('Kakao Map initialized successfully')
		} catch (error) {
			console.error('Error initializing Kakao Map:', error)
		}
	}, [loaded, onPick])

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
	const [searchError, setSearchError] = useState(null)
	const [searchType, setSearchType] = useState(null) // 'single' or 'route'

	const canSubmit = lat !== null && lng !== null && totalDistanceKm > 0 && waypoints.length > 0

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
	
	// 가게 확정 함수 (단일 테마일 때)
	const confirmStore = async () => {
		if (!selectedStore || !lat || !lng) {
			setSearchError('가게와 위치를 선택해주세요.')
			return
		}
		
		if (!BACKEND_URL) {
			setSearchError('백엔드 URL이 설정되지 않았습니다.')
			return
		}
		
		setSearchLoading(true)
		setSearchError(null)
		
		try {
			const requestBody = {
				store_id: selectedStore.store_id,
				start_lat: lat,
				start_lng: lng,
				total_distance_km: totalDistanceKm,
				is_round_trip: isRoundTrip
			}
			
			const r = await fetch(getBackendUrlWithPath('api/stores/confirm'), {
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
			setConfirmedStore(selectedStore)
			setRouteResult(data)
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
		} finally {
			setSearchLoading(false)
		}
	}
	
	// 경로 확정 함수 (경유지 2개 이상일 때)
	const confirmRoute = async () => {
		if (!selectedRoute || !lat || !lng) {
			setSearchError('경로와 위치를 선택해주세요.')
			return
		}
		
		if (!BACKEND_URL) {
			setSearchError('백엔드 URL이 설정되지 않았습니다.')
			return
		}
		
		setSearchLoading(true)
		setSearchError(null)
		
		try {
			const storeIds = selectedRoute.stores.map(s => s.store_id)
			const requestBody = {
				store_ids: storeIds,
				start_lat: lat,
				start_lng: lng,
				total_distance_km: totalDistanceKm,
				is_round_trip: isRoundTrip
			}
			
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
			setRouteResult(data)
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
		} finally {
			setSearchLoading(false)
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
					fetch(getBackendUrlWithPath(`api/stores/${store.store_id}`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null)
				)
				
				const results = await Promise.all(promises)
				const updatedStores = storeCandidates.map(store => {
					const result = results.find(r => r && r.store_id === store.store_id)
					// summary_status가 ready가 되었거나 review_summary가 생겼으면 업데이트
					if (result && result.summary_status === 'ready' && store.summary_status === 'processing') {
						return {
							...store,
							summary_status: result.summary_status,
							review_summary: result.review_summary || store.review_summary
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
					fetch(getBackendUrlWithPath(`api/stores/${store.store_id}`), {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null)
				)
				
				const results = await Promise.all(promises)
				
				// 최신 routeCandidates를 다시 가져와서 업데이트
				const latestRoutes = routeCandidatesRef.current
				if (!latestRoutes || latestRoutes.length === 0) {
					console.log('[poll] skip update: no routes in ref')
					return // 업데이트만 skip
				}
				
				// ready가 된 store_id 목록 추출
				const readyStoreIds = results
					.filter(r => r && r.summary_status === 'ready')
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
							if (result && result.summary_status === 'ready') {
								console.log(`[poll] updating store ${store.store_id} (${store.name})`)
								return {
									...store, // 기존 store 속성 유지
									summary_status: result.summary_status, // 'ready'로 업데이트
									review_summary: result.review_summary || store.review_summary // review_summary 업데이트
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

	return (
		<div className="app-container">
			<header className="app-header" style={{ position: 'relative' }}>
				<img src="/logo.png" alt="Run2Style Logo" className="app-logo" />
				<h2 className="app-title">러닝 코스 랜덤 추천</h2>
				<div style={{ 
					position: 'absolute', 
					right: '20px', 
					top: '50%', 
					transform: 'translateY(-50%)',
					display: 'flex',
					alignItems: 'center',
					gap: '10px'
				}}>
					{isAuthenticated && userInfo && (
						<span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
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
			</header>
			
			{/* 러닝 옵션 섹션 */}
			<div className="running-options-section">
				<h3 className="section-title">오늘은 어떤 러닝을 하고 싶나요?</h3>
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
				<div className="courses-carousel">
					<div className="course-card">
						<div className="course-icon">☕</div>
						<div className="course-title">연남 커미런</div>
						<div className="course-info">약 6.8km · 러닝 후 들러기 좋은 카페</div>
						<div className="course-map-preview"></div>
					</div>
					<div className="course-card">
						<div className="course-icon">🌙</div>
						<div className="course-title">한강 야간 런닝</div>
						<div className="course-info">약 7.2km · 야간 뉴 코스</div>
						<div className="course-time">35-45분</div>
					</div>
					<div className="course-card">
						<div className="course-icon">🏃</div>
						<div className="course-title">가벼운 런닝</div>
						<div className="course-info">약 5km · 초보자 추천</div>
						<div className="course-map-preview"></div>
					</div>
				</div>
			</div>

			<MapPicker onPick={onPick} />
			
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
					
					<div className="input-group" style={{ marginTop: '20px' }}>
						<label>테마 검색어 (경유지별)</label>
						<div style={{ marginBottom: '10px' }}>
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
									onClick={() => setSelectedStore(store)}
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
								<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
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
									onClick={() => setSelectedRoute(route)}
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
												onClick={confirmRoute}
												disabled={searchLoading}
												className="confirm-btn"
											>
												{searchLoading ? '확정 중...' : '경로 확정'}
											</button>
										</div>
									)}
								</>
							) : (
								<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
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
								목표 러닝 거리: <strong>{routeResult.total_distance_km}km</strong> | 
								실제 총 거리: <strong>{routeResult.actual_total_distance_km}km</strong> ({routeResult.is_round_trip ? '왕복' : '편도'})
							</div>
							{routeResult.waypoints && routeResult.waypoints.length > 0 && (
								<div className="route-waypoints-list">
									{routeResult.waypoints.map((waypoint, index) => (
										<div key={waypoint.order} className="route-waypoint-item">
											<div className="waypoint-result-title">{index + 1}. {waypoint.place_name}</div>
											{waypoint.review_summary ? (
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
							<a 
								href={routeResult.route_url} 
								target="_blank" 
								rel="noreferrer"
								className="route-link"
							>
								🗺️ 경로 확인하기
							</a>
						</div>
					)}
				</div>
			)}

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
										{!waypoint.review_summary ? (
											<div className="review-processing">
												⏳ AI가 리뷰를 요약 중입니다.
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
					</div>
					<a 
						href={result.route_url} 
						target="_blank" 
						rel="noreferrer"
						className="route-link"
					>
						🗺️ 걷기 길찾기 열기
					</a>
				</div>
			)}
		</div>
	)
}
