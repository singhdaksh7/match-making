import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'

export const customerRouter = Router()
customerRouter.use(requireAuth)

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

customerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query)
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { businessName: { contains: q.search, mode: 'insensitive' as const } },
              { contactPerson: { contains: q.search, mode: 'insensitive' as const } },
              { phone: { contains: q.search } },
            ],
          }
        : {}),
    }
    const [total, items] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    res.json({ items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) })
  }),
)

customerRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 50 } },
    })
    if (!customer) return res.status(404).json({ error: { code: 'not_found', message: 'Customer not found' } })
    res.json({ customer })
  }),
)

const customerSchema = z.object({
  businessName: z.string().min(1),
  contactPerson: z.string().min(1),
  phone: z.string().min(1),
  whatsapp: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  city: z.string().min(1),
  state: z.string().min(1),
  type: z.enum(['Wholesaler', 'Retailer', 'Distributor', 'Reseller']),
  gstNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

customerRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = customerSchema.parse(req.body)
    const customer = await prisma.customer.create({ data: { ...input, email: input.email || null } })
    res.status(201).json({ customer })
  }),
)

customerRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = customerSchema.partial().parse(req.body)
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...input, email: input.email || undefined },
    })
    res.json({ customer })
  }),
)

customerRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { status: 'inactive' } })
    res.json({ customer })
  }),
)
