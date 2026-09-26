import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'
import { Errors } from '../utils/errors.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: 'owner' | 'staff' }
    }
  }
}

/** Reads the access token from the Authorization header (never from a URL param or body). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return next(Errors.unauthorized())

  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(Errors.unauthorized('Session expired, please log in again'))
  }
}

export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'owner') return next(Errors.forbidden('Owner access required'))
  next()
}
