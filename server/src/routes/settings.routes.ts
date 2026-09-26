import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [business, settings] = await Promise.all([
      prisma.business.findUnique({ where: { id: 'business' } }),
      prisma.appSettings.findUnique({ where: { id: 'settings' } }),
    ])
    res.json({ business, settings })
  }),
)

const businessSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().default(''),
  type: z.string().default(''),
  phone: z.string().default(''),
  whatsapp: z.string().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  address: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
})

settingsRouter.patch(
  '/business',
  requireOwner,
  asyncHandler(async (req, res) => {
    const input = businessSchema.partial().parse(req.body)
    const business = await prisma.business.upsert({
      where: { id: 'business' },
      update: input,
      create: { id: 'business', ...businessSchema.parse(req.body) },
    })
    res.json({ business })
  }),
)

const appSettingsSchema = z.object({
  showPrice: z.boolean(),
  showStock: z.boolean(),
  defaultExpiry: z.enum(['1d', '7d', '30d', 'never']),
  defaultMOQ: z.number().int().positive(),
  lowStockThreshold: z.number().int().nonnegative(),
})

settingsRouter.patch(
  '/app',
  requireOwner,
  asyncHandler(async (req, res) => {
    const input = appSettingsSchema.partial().parse(req.body)
    const settings = await prisma.appSettings.upsert({
      where: { id: 'settings' },
      update: input,
      create: { id: 'settings', ...appSettingsSchema.parse(req.body) },
    })
    res.json({ settings })
  }),
)
