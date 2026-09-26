import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { env } from './env.js'

export interface AccessTokenPayload {
  sub: string
  role: 'owner' | 'staff'
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
}

/** Raw refresh token = a random opaque string; only its SHA-256 hash is persisted. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString('hex')
  const tokenHash = hashToken(token)
  return { token, tokenHash }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiry(): Date {
  const d = new Date()
  d.setDate(d.getDate() + env.REFRESH_TOKEN_TTL_DAYS)
  return d
}
