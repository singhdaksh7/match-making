import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { requireAuth } from '../middleware/auth.js'
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../lib/jwt.js'

export const authRouter = Router()

const REFRESH_COOKIE = 'vastraa_rt'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many login attempts. Try again later.' } },
})

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  }
}

function toPublicUser(user: { id: string; name: string; email: string; role: string; avatarUrl: string | null }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl ?? undefined }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Constant-shape response whether the user exists or not, to avoid user enumeration.
    const valid = user && user.isActive ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !valid) throw Errors.unauthorized('Invalid email or password')

    const accessToken = signAccessToken({ sub: user.id, role: user.role })
    const { token: refreshToken, tokenHash } = generateRefreshToken()
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt: refreshTokenExpiry() },
    })

    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
    res.json({ accessToken, user: toPublicUser(user) })
  }),
)

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!raw) throw Errors.unauthorized('No session found')

    const tokenHash = hashToken(raw)
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions())
      throw Errors.unauthorized('Session expired, please log in again')
    }

    // Rotate: revoke the old refresh token and issue a new one (detects reuse/theft).
    const { token: nextRefreshToken, tokenHash: nextHash } = generateRefreshToken()
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: { userId: stored.userId, tokenHash: nextHash, expiresAt: refreshTokenExpiry() },
      }),
    ])

    const accessToken = signAccessToken({ sub: stored.user.id, role: stored.user.role })
    res.cookie(REFRESH_COOKIE, nextRefreshToken, cookieOptions())
    res.json({ accessToken, user: toPublicUser(stored.user) })
  }),
)

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (raw) {
      const tokenHash = hashToken(raw)
      await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } })
    }
    res.clearCookie(REFRESH_COOKIE, cookieOptions())
    res.status(204).send()
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user || !user.isActive) throw Errors.unauthorized()
    res.json({ user: toPublicUser(user) })
  }),
)

// Exported for tests that need to mint a token without hitting the DB-backed login flow.
export { verifyAccessToken }
