import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
