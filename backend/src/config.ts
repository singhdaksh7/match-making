import 'dotenv/config'
export const config = {
  port: Number(process.env.PORT ?? 4000), databaseUrl: process.env.DATABASE_URL,
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024),
  uploadProvider: process.env.UPLOAD_PROVIDER ?? 'local',
  // Keep production sessions HTTPS-only, while allowing the explicitly local
  // production-like HTTP stack to exercise authenticated browser flows.
  cookieSecure: process.env.COOKIE_SECURE === undefined ? process.env.NODE_ENV === 'production' : process.env.COOKIE_SECURE === 'true',
  // Production default stays at 10 req/15min unless explicitly overridden (e.g. by the
  // local verification compose stack, to tolerate repeated automated login runs).
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
}
if (!config.databaseUrl) console.warn('DATABASE_URL is not configured; database routes cannot start.')
