/**
 * 카카오맵 길찾기 유틸리티
 */

/**
 * 카카오맵 웹 길찾기 페이지를 새 탭에서 엽니다.
 * 
 * @param {Object} params
 * @param {Object} params.start - 출발지 좌표 { lat, lng }
 * @param {Object} params.end - 도착지 좌표 { lat, lng }
 * @param {string} [params.startName='출발지'] - 출발지 이름 (기본값: '출발지')
 * @param {string} [params.endName='도착지'] - 도착지 이름 (기본값: '도착지')
 */
export function openKakaoDirections({ start, end, startName = '출발지', endName = '도착지' }) {
	if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
		console.error('openKakaoDirections: start and end coordinates are required')
		return
	}
	
	const url = `https://map.kakao.com/?sName=${encodeURIComponent(startName)}&sx=${start.lng}&sy=${start.lat}&eName=${encodeURIComponent(endName)}&ex=${end.lng}&ey=${end.lat}`
	
	window.open(url, '_blank', 'noopener,noreferrer')
}




