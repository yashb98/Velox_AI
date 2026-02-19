// src/lib/api.ts
// 5.4 — Updated to use Clerk session token instead of localStorage 'token'.
//        Clerk.session.getToken() returns a fresh short-lived JWT on every request.

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach Clerk JWT if a session exists
api.interceptors.request.use(
  async (config) => {
    try {
      // window.Clerk is injected by ClerkProvider; gracefully skip if missing
      const clerk = (window as any).Clerk
      if (clerk?.session) {
        const token = await clerk.session.getToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    } catch {
      // No active Clerk session — request proceeds without auth header
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor — surface 401s (expired / missing token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Let Clerk's <RedirectToSignIn /> handle the redirect via App.tsx guards
      console.warn('API 401 — session may have expired')
    }
    return Promise.reject(error)
  }
)

export default api

