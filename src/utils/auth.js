/**
 * Authentication utility functions.
 */

import { getBackendUrl } from './api.js'

const BACKEND_URL = getBackendUrl()

export const isAuthenticated = () => {
  return !!localStorage.getItem('access_token')
}

export const logout = async () => {
  try {
    // Call logout endpoint
    await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch (error) {
    console.error('Logout error:', error)
  } finally {
    // Clear access token
    localStorage.removeItem('access_token')
    
    // Redirect to login
    window.location.href = '/login'
  }
}


