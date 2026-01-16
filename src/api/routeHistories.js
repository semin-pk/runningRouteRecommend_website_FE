import api from './axios.js'

export const getRouteHistories = async (limit = 5) => {
  const response = await api.get('/api/v1/users/history', {
    params: { limit },
  })
  return response.data
}

export const addRouteHistory = async (routeId) => {
  const response = await api.post(`/api/v1/users/history/${routeId}`)
  return response.data
}
