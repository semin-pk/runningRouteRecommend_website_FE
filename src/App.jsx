import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

// URL 정리 함수 (끝의 슬래시 제거)
const getBackendUrl = (path) => {
	const baseUrl = BACKEND_URL?.replace(/\/+$/, '') || ''
	const cleanPath = path?.replace(/^\/+/, '') || ''
	return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl
}



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
	
	// 새로운 상태 (테마 검색 및 가게 선택)
	const [mode, setMode] = useState('theme') // 'theme' or 'waypoint'
	const [searchTheme, setSearchTheme] = useState('')
	const [searchLoading, setSearchLoading] = useState(false)
	const [storeCandidates, setStoreCandidates] = useState(null)
	const [selectedStore, setSelectedStore] = useState(null)
	const [confirmedStore, setConfirmedStore] = useState(null)
	const [routeResult, setRouteResult] = useState(null)
	const [searchError, setSearchError] = useState(null)

	const canSubmit = lat !== null && lng !== null && totalDistanceKm > 0 && waypoints.length > 0

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
			
			const r = await fetch(getBackendUrl('api/recommend'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Origin': window.location.origin
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
	
	// 테마 검색 함수
	const searchStoresByTheme = async () => {
		if (!lat || !lng || !searchTheme.trim()) {
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
		setSelectedStore(null)
		setConfirmedStore(null)
		setRouteResult(null)
		
		try {
			const requestBody = {
				theme: searchTheme.trim(),
				latitude: lat,
				longitude: lng,
				radius_m: 2000
			}
			
			const r = await fetch(getBackendUrl('api/stores/search'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Origin': window.location.origin
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
			setStoreCandidates(data.stores || [])
		} catch (e) {
			const errorText = await e.text ? await e.text() : String(e)
			setSearchError(errorText)
		} finally {
			setSearchLoading(false)
		}
	}
	
	// 가게 확정 함수
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
			
			const r = await fetch(getBackendUrl('api/stores/confirm'), {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Origin': window.location.origin
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
	
	// 리뷰 요약 상태 확인 (폴링)
	useEffect(() => {
		if (!storeCandidates || storeCandidates.length === 0) return
		
		const processingStores = storeCandidates.filter(s => s.summary_status === 'processing')
		if (processingStores.length === 0) return
		
		const checkReviews = async () => {
			try {
				const promises = processingStores.map(store => 
					fetch(getBackendUrl(`api/stores/${store.store_id}`), {
						method: 'GET',
						headers: { 
							'Accept': 'application/json',
							'Origin': window.location.origin
						},
						mode: 'cors',
						credentials: 'omit'
					}).then(r => r.ok ? r.json() : null)
				)
				
				const results = await Promise.all(promises)
				const updatedStores = storeCandidates.map(store => {
					const result = results.find(r => r && r.store_id === store.store_id)
					if (result && result.review_summary) {
						return {
							...store,
							summary_status: 'ready',
							review_summary: result.review_summary
						}
					}
					return store
				})
				
				if (updatedStores.some(s => s.summary_status === 'ready' && 
					storeCandidates.find(orig => orig.store_id === s.store_id)?.summary_status === 'processing')) {
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

	return (
		<div className="app-container">
			<header className="app-header">
				<img src="/logo.png" alt="Run2Style Logo" className="app-logo" />
				<h2 className="app-title">러닝 코스 랜덤 추천</h2>
			</header>
			<MapPicker onPick={onPick} />
			
			{/* 모드 선택 탭 */}
			<div className="mode-selector" style={{ margin: '20px 0', textAlign: 'center' }}>
				<button
					onClick={() => setMode('theme')}
					style={{
						padding: '10px 20px',
						margin: '0 10px',
						backgroundColor: mode === 'theme' ? '#4CAF50' : '#f0f0f0',
						color: mode === 'theme' ? 'white' : '#333',
						border: 'none',
						borderRadius: '5px',
						cursor: 'pointer',
						fontSize: '16px'
					}}
				>
					테마 검색
				</button>
				<button
					onClick={() => setMode('waypoint')}
					style={{
						padding: '10px 20px',
						margin: '0 10px',
						backgroundColor: mode === 'waypoint' ? '#4CAF50' : '#f0f0f0',
						color: mode === 'waypoint' ? 'white' : '#333',
						border: 'none',
						borderRadius: '5px',
						cursor: 'pointer',
						fontSize: '16px'
					}}
				>
					경유지 설정
				</button>
			</div>
			
			{/* 테마 검색 모드 */}
			{mode === 'theme' && (
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
						<label>테마 검색어</label>
						<div style={{ display: 'flex', gap: '10px' }}>
							<input 
								type="text" 
								value={searchTheme}
								onChange={(e) => setSearchTheme(e.target.value)}
								placeholder="예: 카페, 맛집, 맥주 등"
								style={{ flex: 1, padding: '10px' }}
								onKeyPress={(e) => e.key === 'Enter' && searchStoresByTheme()}
							/>
							<button
								onClick={searchStoresByTheme}
								disabled={!lat || !lng || !searchTheme.trim() || searchLoading}
								style={{
									padding: '10px 20px',
									backgroundColor: '#4CAF50',
									color: 'white',
									border: 'none',
									borderRadius: '5px',
									cursor: 'pointer'
								}}
							>
								{searchLoading ? '검색중...' : '검색'}
							</button>
						</div>
					</div>
					
					{searchError && <div className="error-message">{searchError}</div>}
					
					{/* 가게 후보 목록 */}
					{storeCandidates && storeCandidates.length > 0 && (
						<div className="store-candidates" style={{ marginTop: '20px' }}>
							<h3 style={{ marginBottom: '15px', color: '#333' }}>추천 가게 (3개)</h3>
							{storeCandidates.map((store, index) => (
								<div
									key={store.store_id}
									onClick={() => setSelectedStore(store)}
									style={{
										border: selectedStore?.store_id === store.store_id ? '3px solid #4CAF50' : '1px solid #ddd',
										borderRadius: '8px',
										padding: '15px',
										marginBottom: '15px',
										cursor: 'pointer',
										backgroundColor: selectedStore?.store_id === store.store_id ? '#f0f9f0' : 'white',
										transition: 'all 0.2s'
									}}
								>
									<div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px', color: '#333' }}>
										{index + 1}. {store.name}
									</div>
									<div style={{ color: '#666', marginBottom: '5px' }}>
										📍 {store.address}
									</div>
									{store.phone && (
										<div style={{ color: '#666', marginBottom: '5px' }}>
											📞 {store.phone}
										</div>
									)}
									<div style={{ marginTop: '10px' }}>
										{store.summary_status === 'processing' ? (
											<div style={{ color: '#ff9800', fontSize: '14px' }}>
												⏳ AI가 장소를 찾고 있어요. 잠시만 기다려주세요.
											</div>
										) : store.review_summary ? (
											<div style={{ fontSize: '14px' }}>
												<div style={{ color: '#4CAF50', fontWeight: 'bold', marginBottom: '5px' }}>
													✓ 리뷰 요약 완료
												</div>
												{store.review_summary.main_menu && store.review_summary.main_menu.length > 0 && (
													<div style={{ color: '#666', marginBottom: '3px' }}>
														메뉴: {store.review_summary.main_menu.join(', ')}
													</div>
												)}
												{store.review_summary.atmosphere && store.review_summary.atmosphere.length > 0 && (
													<div style={{ color: '#666', marginBottom: '3px' }}>
														분위기: {store.review_summary.atmosphere.join(', ')}
													</div>
												)}
												{store.review_summary.recommended_for && store.review_summary.recommended_for.length > 0 && (
													<div style={{ color: '#666' }}>
														추천: {store.review_summary.recommended_for.join(', ')}
													</div>
												)}
											</div>
										) : null}
									</div>
								</div>
							))}
							
							{selectedStore && (
								<div style={{ marginTop: '20px', textAlign: 'center' }}>
									<button
										onClick={confirmStore}
										disabled={searchLoading}
										style={{
											padding: '12px 30px',
											backgroundColor: '#2196F3',
											color: 'white',
											border: 'none',
											borderRadius: '5px',
											cursor: 'pointer',
											fontSize: '16px',
											fontWeight: 'bold'
										}}
									>
										{searchLoading ? '확정 중...' : '확정'}
									</button>
								</div>
							)}
						</div>
					)}
					
					{/* 경로 결과 */}
					{confirmedStore && routeResult && (
						<div className="result-container" style={{ marginTop: '20px' }}>
							<h3 className="result-title">✅ 경로 확정 완료</h3>
							<div className="result-summary">
								목표 러닝 거리: <strong>{routeResult.total_distance_km}km</strong> | 
								실제 총 거리: <strong>{routeResult.actual_total_distance_km}km</strong> ({routeResult.is_round_trip ? '왕복' : '편도'})
							</div>
							<a 
								href={routeResult.route_url} 
								target="_blank" 
								rel="noreferrer"
								className="route-link"
								style={{
									display: 'inline-block',
									marginTop: '15px',
									padding: '12px 30px',
									backgroundColor: '#4CAF50',
									color: 'white',
									textDecoration: 'none',
									borderRadius: '5px',
									fontWeight: 'bold'
								}}
							>
								🗺️ 경로 확인하기
							</a>
						</div>
					)}
				</div>
			)}
			
			{/* 경유지 설정 모드 (기존) */}
			{mode === 'waypoint' && (
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
						className="submit-btn"
					>
						{loading ? '추천중...' : '러닝 코스 추천 받기'}
					</button>
				</div>
			</div>
			)}

			{error && <div className="error-message">{error}</div>}

			{result && (
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
									<div key={waypoint.order} className="waypoint-result">
										<div className="waypoint-result-title">
											<span style={{ color: '#000' }}>📍 경유지 {waypoint.order}:</span> 
											<span style={{ color: '#000', marginLeft: 8 }}>{waypoint.place_name}</span>
										</div>
										<div className="waypoint-result-theme">
											테마: <strong>{waypoint.theme_keyword}</strong> | 
											거리: <strong>{waypoint.distance_km.toFixed(2)}km</strong>
										</div>
										{waypoint.address_name && (
											<div className="waypoint-result-address">
												주소: {waypoint.address_name}
											</div>
										)}
										{waypoint.phone && (
											<div className="waypoint-result-phone">
												전화: {waypoint.phone}
											</div>
										)}
									</div>
								))}
								
								<div className="candidates-info">
									검토된 장소: {result.candidates_considered}개 중 선택
								</div>
							</div>
						) : (
							<div style={{ color: '#000' }}>
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
