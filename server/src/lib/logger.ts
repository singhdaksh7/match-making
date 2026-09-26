import pino from 'pino'
import { env } from './env.js'

// Redact anything that could carry credentials or PII into logs.
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.pin',
      '*.pinHash',
    ],
    censor: '[redacted]',
  },
})
