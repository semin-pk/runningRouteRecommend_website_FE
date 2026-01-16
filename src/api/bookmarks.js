import api from './axios.js'

export const getBookmarks = async () => {
  const response = await api.get('/api/v1/users/bookmarks')
  return response.data
}

export const addBookmark = async (routeId) => {
  const response = await api.post(`/api/v1/users/bookmarks/${routeId}`)
  return response.data
}

export const removeBookmark = async (routeId) => {
  const response = await api.delete(`/api/v1/users/bookmarks/${routeId}`)
  return response.data
}
