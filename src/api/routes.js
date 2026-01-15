/**
 * Routes API utilities
 */

import api from './axios.js'

/**
 * 경로 탭 목록 조회
 * @param {Object} params
 * @param {number} params.limit - 반환할 탭 개수 (기본 10)
 * @param {number} params.days - 조회 기간 (일, 기본 30일)
 * @returns {Promise<{tabs: Array}>}
 */
export async function fetchRouteTabs({ limit = 10, days = 30 } = {}) {
  const response = await api.get('/api/routes/tabs', {
    params: {
      limit,
      days,
    },
  })
  return response.data
}

/**
 * 키워드별 경로 목록 조회
 * @param {Object} params
 * @param {string} params.keyword - 키워드
 * @param {number} params.limit - 반환할 경로 개수 (기본 10)
 * @param {number} params.days - 조회 기간 (일, 기본 90일)
 * @returns {Promise<Array>}
 */
export async function fetchRoutesByKeyword({ keyword, limit = 10, days = 90 } = {}) {
  if (!keyword) {
    throw new Error('keyword is required')
  }
  const response = await api.get('/api/routes/by-keyword', {
    params: {
      keyword,
      limit,
      days,
    },
  })
  return response.data
}

/**
 * 경로 ID로 카카오맵 길찾기 URL 조회
 * @param {string} routeId - 경로 ID
 * @returns {Promise<{url: string}>}
 */
export async function fetchDirectionsUrl(routeId) {
  if (!routeId) {
    throw new Error('routeId is required')
  }
  const response = await api.get(`/api/routes/${routeId}/directions-url`)
  return response.data
}
