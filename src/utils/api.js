/**
 * 공통 API 유틸리티
 */

// 백엔드 URL 정규화 (끝의 슬래시 제거)
export const getBackendUrl = () => {
  const url = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8000'
  return url
}

// 경로와 함께 백엔드 URL 생성
export const getBackendUrlWithPath = (path) => {
  const baseUrl = getBackendUrl()
  const cleanPath = path?.replace(/^\/+/, '') || ''
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl
}






