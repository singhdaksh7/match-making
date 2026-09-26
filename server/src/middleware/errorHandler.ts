import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { ApiError } from '../utils/errors.js'
import { logger } from '../lib/logger.js'
import { env } from '../lib/env.js'

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } })
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid input', details: err.flatten() },
    })
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'conflict', message: 'A record with this value already exists' } })
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Resource not found' } })
    }
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')

  // Never leak stack traces or internal details to clients.
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong. Please try again.',
      ...(env.NODE_ENV !== 'production' ? { detail: err instanceof Error ? err.message : String(err) } : {}),
    },
  })
}
