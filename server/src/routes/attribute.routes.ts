import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const attributeRouter = Router()
attributeRouter.use(requireAuth)

attributeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.attribute.findMany({ include: { values: true }, orderBy: { createdAt: 'desc' } })
    res.json({ items })
  }),
)

const attributeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['color', 'text', 'size']),
})

attributeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = attributeSchema.parse(req.body)
    const attribute = await prisma.attribute.create({ data: input })
    res.status(201).json({ attribute })
  }),
)

attributeRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = attributeSchema.partial().parse(req.body)
    const attribute = await prisma.attribute.update({ where: { id: req.params.id }, data: input })
    res.json({ attribute })
  }),
)

const valueSchema = z.object({ value: z.string().min(1), hex: z.string().optional() })

attributeRouter.post(
  '/:id/values',
  asyncHandler(async (req, res) => {
    const input = valueSchema.parse(req.body)
    const value = await prisma.attributeValue.create({ data: { ...input, attributeId: req.params.id } })
    res.status(201).json({ value })
  }),
)

attributeRouter.delete(
  '/:id/values/:valueId',
  asyncHandler(async (req, res) => {
    await prisma.attributeValue.delete({ where: { id: req.params.valueId } })
    res.status(204).send()
  }),
)
