import api from './axios.js'

export const signup = async (payload) => {
  const response = await api.post('/api/v1/auth/signup', payload)
  return response.data
}

export const loginLocal = async (payload) => {
  const response = await api.post('/api/v1/auth/login/local', payload)
  return response.data
}

export const logout = async () => {
  const response = await api.post('/api/v1/auth/logout')
  return response.data
}
