import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const collectionRouter = Router()
collectionRouter.use(requireAuth)

collectionRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.collection.findMany({ include: { products: true }, orderBy: { createdAt: 'desc' } })
    res.json({ items: items.map((c) => ({ ...c, productIds: c.products.map((p) => p.productId) })) })
  }),
)

const collectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  coverImage: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  productIds: z.array(z.string()).default([]),
})

collectionRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = collectionSchema.parse(req.body)
    const collection = await prisma.collection.create({
      data: {
        name: input.name,
        description: input.description,
        coverImage: input.coverImage,
        status: input.status,
        products: { create: input.productIds.map((productId) => ({ productId })) },
      },
    })
    res.status(201).json({ collection })
  }),
)
