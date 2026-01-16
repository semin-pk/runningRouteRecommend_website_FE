import api from './axios.js'

export const getMyPage = async () => {
  const response = await api.get('/api/v1/users/mypage')
  return response.data
}
