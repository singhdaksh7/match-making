import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { requireAuth } from '../middleware/auth.js'

export const productRouter = Router()
productRouter.use(requireAuth)

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
})

// Paginated list — never returns the full catalogue in one payload (products can
// reach tens of thousands of rows; see PERFORMANCE section of ARCHITECTURE.md).
productRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query)
    const where = {
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { code: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [total, items] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { media: { orderBy: { sortOrder: 'asc' } }, category: true, _count: { select: { variants: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])

    res.json({ items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) })
  }),
)

productRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { media: { orderBy: { sortOrder: 'asc' } }, variants: true, category: true },
    })
    if (!product) throw Errors.notFound('Product not found')
    res.json({ product })
  }),
)

const variantInput = z.object({
  sku: z.string().min(1),
  attributes: z.record(z.string()),
  price: z.number().nonnegative(),
  comparePrice: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(10),
  status: z.enum(['active', 'inactive']).default('active'),
})

const productCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().default(''),
  wholesalePrice: z.number().nonnegative(),
  comparePrice: z.number().nonnegative().optional(),
  moq: z.number().int().positive().default(1),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  media: z.array(z.object({ url: z.string().url(), isPrimary: z.boolean().default(false) })).default([]),
  variants: z.array(variantInput).min(1),
})

productRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = productCreateSchema.parse(req.body)
    const product = await prisma.product.create({
      data: {
        code: input.code,
        name: input.name,
        categoryId: input.categoryId,
        description: input.description,
        wholesalePrice: input.wholesalePrice,
        comparePrice: input.comparePrice,
        moq: input.moq,
        status: input.status,
        media: {
          create: input.media.map((m, i) => ({ url: m.url, isPrimary: m.isPrimary, sortOrder: i })),
        },
        variants: {
          create: input.variants.map((v) => ({
            sku: v.sku,
            attributes: v.attributes,
            price: v.price,
            comparePrice: v.comparePrice,
            stock: v.stock,
            lowStockThreshold: v.lowStockThreshold,
            status: v.status,
          })),
        },
      },
      include: { media: true, variants: true },
    })
    res.status(201).json({ product })
  }),
)

const productUpdateSchema = productCreateSchema.partial().omit({ variants: true, media: true })

productRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = productUpdateSchema.parse(req.body)
    const product = await prisma.product.update({ where: { id: req.params.id }, data: input })
    res.json({ product })
  }),
)

productRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: { status: 'archived' } })
    res.json({ product })
  }),
)

productRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: true, media: true } })
    if (!source) throw Errors.notFound('Product not found')

    const copy = await prisma.product.create({
      data: {
        code: `${source.code}-COPY-${Date.now().toString(36)}`,
        name: `${source.name} (Copy)`,
        categoryId: source.categoryId,
        description: source.description,
        wholesalePrice: source.wholesalePrice,
        comparePrice: source.comparePrice ?? undefined,
        moq: source.moq,
        status: 'draft',
        media: { create: source.media.map((m) => ({ url: m.url, isPrimary: m.isPrimary, sortOrder: m.sortOrder })) },
        variants: {
          create: source.variants.map((v) => ({
            sku: `${v.sku}-COPY-${Date.now().toString(36)}`,
            attributes: v.attributes as object,
            price: v.price,
            comparePrice: v.comparePrice ?? undefined,
            stock: 0,
            lowStockThreshold: v.lowStockThreshold,
            status: v.status,
          })),
        },
      },
      include: { media: true, variants: true },
    })
    res.status(201).json({ product: copy })
  }),
)

productRouter.post(
  '/:id/views',
  asyncHandler(async (req, res) => {
    await prisma.product.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })
    res.status(204).send()
  }),
)

// --- Variants -------------------------------------------------------------

productRouter.post(
  '/:id/variants',
  asyncHandler(async (req, res) => {
    const input = variantInput.parse(req.body)
    const variant = await prisma.productVariant.create({ data: { ...input, productId: req.params.id } })
    res.status(201).json({ variant })
  }),
)

const variantUpdateSchema = variantInput.partial()

productRouter.patch(
  '/variants/:variantId',
  asyncHandler(async (req, res) => {
    const input = variantUpdateSchema.parse(req.body)
    const variant = await prisma.productVariant.update({ where: { id: req.params.variantId }, data: input })
    res.json({ variant })
  }),
)
