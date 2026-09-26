import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const enquiryRouter = Router()
enquiryRouter.use(requireAuth)

enquiryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25)
    const status = req.query.status as string | undefined
    const where = status ? { status: status as never } : {}

    const [total, items] = await prisma.$transaction([
      prisma.enquiry.count({ where }),
      prisma.enquiry.findMany({
        where,
        include: { items: true, customer: { select: { id: true, businessName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  }),
)

enquiryRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: req.params.id },
      include: { items: true, timeline: { orderBy: { at: 'asc' } }, customer: true, catalogue: { select: { id: true, name: true, slug: true } } },
    })
    if (!enquiry) return res.status(404).json({ error: { code: 'not_found', message: 'Enquiry not found' } })
    res.json({ enquiry })
  }),
)

const statusSchema = z.object({
  status: z.enum(['New', 'Contacted', 'Negotiating', 'Converted', 'Closed']),
  note: z.string().max(500).optional(),
})

enquiryRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const input = statusSchema.parse(req.body)
    const enquiry = await prisma.$transaction(async (tx) => {
      await tx.enquiryTimelineEntry.create({ data: { enquiryId: req.params.id, status: input.status, note: input.note } })
      return tx.enquiry.update({ where: { id: req.params.id }, data: { status: input.status } })
    })
    res.json({ enquiry })
  }),
)
