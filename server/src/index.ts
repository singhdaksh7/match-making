import { createApp } from './app.js'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`Vastraa API listening on port ${env.PORT} (${env.NODE_ENV})`)
})

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
