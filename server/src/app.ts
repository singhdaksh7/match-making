import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { authRouter } from './routes/auth.routes.js'
import { productRouter } from './routes/product.routes.js'
import { categoryRouter } from './routes/category.routes.js'
import { attributeRouter } from './routes/attribute.routes.js'
import { customerRouter } from './routes/customer.routes.js'
import { collectionRouter } from './routes/collection.routes.js'
import { catalogueRouter } from './routes/catalogue.routes.js'
import { publicRouter } from './routes/public.routes.js'
import { enquiryRouter } from './routes/enquiry.routes.js'
import { inventoryRouter } from './routes/inventory.routes.js'
import { notificationRouter } from './routes/notification.routes.js'
import { settingsRouter } from './routes/settings.routes.js'
import { mediaRouter } from './routes/media.routes.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1) // behind Traefik — needed for correct req.ip / rate limiting
  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' } }))

  const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api', apiLimiter)

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

  app.use('/media', express.static(path.resolve(env.MEDIA_DIR), { maxAge: '30d', immutable: true }))

  app.use('/api/auth', authRouter)
  app.use('/api/products', productRouter)
  app.use('/api/categories', categoryRouter)
  app.use('/api/attributes', attributeRouter)
  app.use('/api/customers', customerRouter)
  app.use('/api/collections', collectionRouter)
  app.use('/api/catalogues', catalogueRouter)
  app.use('/api/public', publicRouter)
  app.use('/api/enquiries', enquiryRouter)
  app.use('/api/inventory', inventoryRouter)
  app.use('/api/notifications', notificationRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/media', mediaRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
