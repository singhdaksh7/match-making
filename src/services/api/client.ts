import { BRAND } from '@/config/brand'

export type ApiErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'NETWORK' | 'SERVER' | 'UNKNOWN'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fields?: Record<string, string>
  /** Structured server details, e.g. the dependencies that block a delete. */
  readonly details?: unknown
  constructor(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}

type Envelope<T> = { data: T; meta?: { page: number; limit: number; total: number } }

// Empty in production means same-origin (/api).  Vite proxies it to the local
// API during development, keeping HTTP-only session cookies first-party.
const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

function errorCode(status: number, code?: string): ApiErrorCode {
  if (code === 'UNAUTHENTICATED' || status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 400 || status === 422) return 'VALIDATION'
  if (status >= 500) return 'SERVER'
  return 'UNKNOWN'
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
    if (response.status === 204) return undefined as T
    const body = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string>; details?: unknown } }
    if (!response.ok) throw new ApiError(response.status, errorCode(response.status, body.error?.code), body.error?.message ?? 'Request failed.', body.error?.fields, body.error?.details)
    return (body.data ?? body) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'NETWORK', `Unable to reach ${BRAND.name}. Check your connection and try again.`)
  }
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
}

export type ApiPage<T> = Envelope<T[]>
