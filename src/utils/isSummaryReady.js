/**
 * 리뷰 요약 완료 상태 확인 유틸리티
 */

/**
 * store 또는 waypoint의 리뷰 요약이 완료되었는지 확인
 * @param {Object} item - store 또는 waypoint 객체
 * @returns {boolean} - 리뷰 요약이 완료되었으면 true
 */
function isItemSummaryReady(item) {
	if (!item) return false
	
	// summary_status가 'ready' 또는 'complete'이면 완료
	if (item.summary_status === 'ready' || item.summary_status === 'complete') {
		return true
	}
	
	// review_summary가 존재하면 완료
	if (item.review_summary) {
		return true
	}
	
	return false
}

/**
 * store 또는 waypoint의 리뷰 요약이 pending 상태인지 확인
 * @param {Object} item - store 또는 waypoint 객체
 * @returns {boolean} - 리뷰 요약이 pending 상태이면 true
 */
export function isItemSummaryPending(item) {
	if (!item) return false
	
	// summary_status가 'processing'이거나, summary_status가 없고 review_summary도 없으면 pending
	return item.summary_status === 'processing' || (!item.summary_status && !item.review_summary)
}

/**
 * selectedCandidate에 포함된 모든 store의 리뷰 요약이 완료되었는지 확인
 * @param {Object|null} candidate - selectedCandidate 객체: { type: 'quick'|'store'|'route', data: ... }
 * @returns {boolean} - 모든 store의 리뷰 요약이 완료되었으면 true
 */
export function isCandidateReady(candidate) {
	if (!candidate || !candidate.type || !candidate.data) {
		return false
	}
	
	switch (candidate.type) {
		case 'quick':
			// 빠른검색: data는 waypoints 배열
			const waypoints = candidate.data
			if (!Array.isArray(waypoints) || waypoints.length === 0) {
				return false
			}
			// 모든 waypoint가 완료되었는지 확인
			return waypoints.every(waypoint => isItemSummaryReady(waypoint))
		
		case 'store':
			// 상세검색 단일: data는 store 객체
			const store = candidate.data
			return isItemSummaryReady(store)
		
		case 'route':
			// 상세검색 경로: data는 route 객체, route.stores 배열 확인
			const route = candidate.data
			if (!route || !route.stores || !Array.isArray(route.stores)) {
				return false
			}
			if (route.stores.length === 0) {
				return false
			}
			// 모든 store가 완료되었는지 확인
			return route.stores.every(storeItem => isItemSummaryReady(storeItem))
		
		default:
			console.warn(`Unknown candidate type: ${candidate.type}`)
			return false
	}
}