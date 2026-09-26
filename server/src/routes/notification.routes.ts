import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const notificationRouter = Router()
notificationRouter.use(requireAuth)

notificationRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    res.json({ items })
  }),
)

notificationRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } })
    res.json({ notification })
  }),
)

notificationRouter.post(
  '/read-all',
  asyncHandler(async (_req, res) => {
    await prisma.notification.updateMany({ where: { read: false }, data: { read: true } })
    res.status(204).send()
  }),
)
