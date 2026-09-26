import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const categoryRouter = Router()
categoryRouter.use(requireAuth)

categoryRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      include: { attributes: { include: { attribute: { include: { values: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({
      items: categories.map((c) => ({ ...c, attributeIds: c.attributes.map((a) => a.attributeId) })),
    })
  }),
)

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  attributeIds: z.array(z.string()).default([]),
})

categoryRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body)
    const category = await prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        imageUrl: input.imageUrl,
        status: input.status,
        attributes: { create: input.attributeIds.map((attributeId) => ({ attributeId })) },
      },
    })
    res.status(201).json({ category })
  }),
)

categoryRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = categorySchema.partial().parse(req.body)
    const { attributeIds, ...rest } = input
    const category = await prisma.$transaction(async (tx) => {
      if (attributeIds) {
        await tx.categoryAttribute.deleteMany({ where: { categoryId: req.params.id } })
        await tx.categoryAttribute.createMany({
          data: attributeIds.map((attributeId) => ({ categoryId: req.params.id, attributeId })),
        })
      }
      return tx.category.update({ where: { id: req.params.id }, data: rest })
    })
    res.json({ category })
  }),
)

categoryRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }),
)
