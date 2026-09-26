import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, DEMO_EMAIL, DEMO_PASSWORD } from '@/context/AuthContext'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.success) navigate('/dashboard')
    else setError(result.error ?? 'Login failed')
  }

  return (
    <div className="flex min-h-screen bg-[#faf8f5]">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-stone-900 p-12 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1200&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/70 to-stone-900/40" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-serif text-lg font-semibold text-stone-900">V</div>
          <p className="font-serif text-xl font-semibold">Vastraa Wholesale</p>
        </div>
        <div className="relative max-w-md">
          <p className="font-serif text-4xl font-medium leading-tight">Fashion. Variety. Delivered.</p>
          <p className="mt-4 text-sm text-stone-300">
            Manage your inventory, build personalized catalogues, and turn WhatsApp conversations into wholesale orders — all from one dashboard.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 font-serif text-lg font-semibold text-white">V</div>
            <p className="font-serif text-xl font-semibold text-stone-900">Vastraa Wholesale</p>
          </div>

          <h1 className="font-serif text-2xl font-semibold text-stone-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-stone-500">Sign in to manage your wholesale catalogue business.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vastraa.demo"
                  required
                  className="w-full rounded-xl border border-stone-200 py-3 pl-10 pr-4 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-stone-200 py-3 pl-10 pr-10 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#e6d5bd] bg-[#f5ede2] px-4 py-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#7a5230]" />
            <div className="text-xs text-[#7a5230]">
              <p className="font-semibold">Demo credentials</p>
              <p className="mt-0.5">Email: <span className="font-mono">{DEMO_EMAIL}</span></p>
              <p>Password: <span className="font-mono">{DEMO_PASSWORD}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
