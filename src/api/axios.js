/**
 * Axios instance with interceptors for authentication.
 */

import axios from 'axios'
import { getBackendUrl } from '../utils/api.js'

const BACKEND_URL = getBackendUrl()

// Create axios instance
const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true, // Important: include cookies in requests
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: Add access token to headers
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor: Handle 401 and refresh token
api.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        // Try to refresh access token
        const refreshResponse = await axios.post(
          `${BACKEND_URL}/api/v1/auth/refresh`,
          {},
          {
            withCredentials: true, // Include refresh token cookie
          }
        )

        const { access_token } = refreshResponse.data

        // Save new access token
        localStorage.setItem('access_token', access_token)

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed - clear token and redirect to login
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api


