import api from './axios.js'

export const addStoreThemeLog = async ({ theme, storeId }) => {
  const response = await api.post('/api/v1/users/store-theme-logs', {
    theme,
    store_id: storeId,
  })
  return response.data
}

export const getStoresByTheme = async () => {
  const response = await api.get('/api/v1/users/stores/by-theme')
  return response.data
}
