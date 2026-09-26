import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { computeExpiresAt, mapExpiryInput } from '../services/catalogue.service.js'

export const catalogueRouter = Router()
catalogueRouter.use(requireAuth)

catalogueRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25)
    const [total, items] = await prisma.$transaction([
      prisma.catalogue.count(),
      prisma.catalogue.findMany({
        include: { customer: { select: { id: true, businessName: true } }, _count: { select: { items: true, enquiries: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  }),
)

catalogueRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const catalogue = await prisma.catalogue.findUnique({
      where: { id: req.params.id },
      include: { customer: true, items: { include: { product: { include: { media: true } } } } },
    })
    if (!catalogue) throw Errors.notFound('Catalogue not found')
    const { pinHash: _pinHash, ...safe } = catalogue
    res.json({ catalogue: safe })
  }),
)

const itemSchema = z.object({
  productId: z.string().min(1),
  variantFilter: z.record(z.array(z.string())).default({}),
  allVariants: z.boolean().default(true),
})

const settingsSchema = z.object({
  showWholesalePrice: z.boolean().default(true),
  showExactStock: z.boolean().default(true),
  showAvailability: z.boolean().default(true),
  showMOQ: z.boolean().default(true),
  allowProductSelection: z.boolean().default(true),
  allowEnquiry: z.boolean().default(true),
  allowImageDownload: z.boolean().default(false),
  priceAdjustmentType: z.enum(['none', 'percentage', 'custom']).default('none'),
  priceAdjustmentValue: z.number().default(0),
  pinProtected: z.boolean().default(false),
  pin: z.string().min(4).max(12).optional(),
  expiry: z.enum(['1d', '7d', '30d', 'never']).default('7d'),
})

const catalogueCreateSchema = z.object({
  name: z.string().min(1),
  message: z.string().optional(),
  customerId: z.string().min(1),
  items: z.array(itemSchema).min(1),
  settings: settingsSchema,
  status: z.enum(['active', 'draft', 'disabled']).default('draft'),
})

async function hashPin(pin?: string) {
  return pin ? bcrypt.hash(pin, 10) : null
}

catalogueRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = catalogueCreateSchema.parse(req.body)
    const slug = nanoid(10)
    const catalogue = await prisma.catalogue.create({
      data: {
        slug,
        name: input.name,
        message: input.message,
        customerId: input.customerId,
        status: input.status,
        expiresAt: computeExpiresAt(input.settings.expiry),
        expiry: mapExpiryInput(input.settings.expiry) as never,
        showWholesalePrice: input.settings.showWholesalePrice,
        showExactStock: input.settings.showExactStock,
        showAvailability: input.settings.showAvailability,
        showMOQ: input.settings.showMOQ,
        allowProductSelection: input.settings.allowProductSelection,
        allowEnquiry: input.settings.allowEnquiry,
        allowImageDownload: input.settings.allowImageDownload,
        priceAdjustmentType: input.settings.priceAdjustmentType,
        priceAdjustmentValue: input.settings.priceAdjustmentValue,
        pinProtected: input.settings.pinProtected,
        pinHash: await hashPin(input.settings.pin),
        items: {
          create: input.items.map((i) => ({ productId: i.productId, variantFilter: i.variantFilter, allVariants: i.allVariants })),
        },
      },
      include: { items: true },
    })
    const { pinHash: _pinHash, ...safe } = catalogue
    res.status(201).json({ catalogue: safe })
  }),
)

const catalogueUpdateSchema = catalogueCreateSchema.partial()

catalogueRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = catalogueUpdateSchema.parse(req.body)
    const { items, settings, ...rest } = input

    const catalogue = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.catalogueItem.deleteMany({ where: { catalogueId: req.params.id } })
        await tx.catalogueItem.createMany({
          data: items.map((i) => ({ catalogueId: req.params.id, productId: i.productId, variantFilter: i.variantFilter, allVariants: i.allVariants })),
        })
      }
      return tx.catalogue.update({
        where: { id: req.params.id },
        data: {
          ...rest,
          ...(settings
            ? {
                showWholesalePrice: settings.showWholesalePrice,
                showExactStock: settings.showExactStock,
                showAvailability: settings.showAvailability,
                showMOQ: settings.showMOQ,
                allowProductSelection: settings.allowProductSelection,
                allowEnquiry: settings.allowEnquiry,
                allowImageDownload: settings.allowImageDownload,
                priceAdjustmentType: settings.priceAdjustmentType,
                priceAdjustmentValue: settings.priceAdjustmentValue,
                pinProtected: settings.pinProtected,
                ...(settings.pin ? { pinHash: await hashPin(settings.pin) } : {}),
                expiry: mapExpiryInput(settings.expiry) as never,
                expiresAt: computeExpiresAt(settings.expiry),
              }
            : {}),
        },
      })
    })
    const { pinHash: _pinHash, ...safe } = catalogue
    res.json({ catalogue: safe })
  }),
)

catalogueRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await prisma.catalogue.findUnique({ where: { id: req.params.id }, include: { items: true } })
    if (!source) throw Errors.notFound('Catalogue not found')
    const copy = await prisma.catalogue.create({
      data: {
        slug: nanoid(10),
        name: `${source.name} (Copy)`,
        message: source.message,
        customerId: source.customerId,
        status: 'draft',
        expiresAt: source.expiresAt,
        expiry: source.expiry,
        showWholesalePrice: source.showWholesalePrice,
        showExactStock: source.showExactStock,
        showAvailability: source.showAvailability,
        showMOQ: source.showMOQ,
        allowProductSelection: source.allowProductSelection,
        allowEnquiry: source.allowEnquiry,
        allowImageDownload: source.allowImageDownload,
        priceAdjustmentType: source.priceAdjustmentType,
        priceAdjustmentValue: source.priceAdjustmentValue,
        pinProtected: source.pinProtected,
        pinHash: source.pinHash,
        items: { create: source.items.map((i) => ({ productId: i.productId, variantFilter: i.variantFilter as object, allVariants: i.allVariants })) },
      },
    })
    const { pinHash: _pinHash, ...safe } = copy
    res.status(201).json({ catalogue: safe })
  }),
)

catalogueRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const status = z.enum(['active', 'draft', 'disabled', 'expired']).parse(req.body.status)
    const catalogue = await prisma.catalogue.update({ where: { id: req.params.id }, data: { status } })
    const { pinHash: _pinHash, ...safe } = catalogue
    res.json({ catalogue: safe })
  }),
)

catalogueRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.catalogue.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }),
)
