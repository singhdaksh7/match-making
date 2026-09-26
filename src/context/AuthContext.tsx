import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, apiClient } from '@/services/api/client'
import { backendUserToFrontendUser } from '@/services/api/adapters'
import type { User } from '@/types'

export const DEMO_EMAIL = 'admin@vastraa.demo'
export const DEMO_PASSWORD = 'ChangeMe123!'

interface AuthContextValue {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    apiClient.get<{ user: unknown }>('/api/v1/auth/me')
      .then((result) => active && setUser(backendUserToFrontendUser(result.user)))
      .catch(() => undefined)
      .finally(() => active && setReady(true))
    return () => { active = false }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await apiClient.post<{ user: unknown }>('/api/v1/auth/login', { email, password })
      setUser(backendUserToFrontendUser(result.user))
      return { success: true }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return { success: false, error: 'Invalid email or password.' }
      if (error instanceof ApiError && error.code === 'NETWORK') return { success: false, error: 'Vastraa is unavailable. Please try again shortly.' }
      return { success: false, error: 'We could not sign you in. Please try again.' }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await apiClient.post('/api/v1/auth/logout') } catch { /* local session should still end */ }
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
