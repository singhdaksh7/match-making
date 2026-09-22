import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { OWNER } from '@/data/business'
import { loadJSON, saveJSON } from '@/services/storage'
import type { User } from '@/types'

const AUTH_KEY = 'auth_user'

export const DEMO_EMAIL = 'admin@vastraa.demo'
export const DEMO_PASSWORD = 'admin123'

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => { success: boolean; error?: string }
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadJSON<User | null>(AUTH_KEY, null))

  const login = useCallback((email: string, password: string) => {
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      setUser(OWNER)
      saveJSON(AUTH_KEY, OWNER)
      return { success: true }
    }
    return { success: false, error: 'Invalid email or password. Use the demo credentials shown below.' }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    saveJSON(AUTH_KEY, null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
