import api from './axios.js'

export const getLatestLegal = async () => {
  const response = await api.get('/api/v1/legal/latest')
  return response.data
}
