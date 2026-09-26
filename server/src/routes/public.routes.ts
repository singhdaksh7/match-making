import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { applyPriceAdjustment, isCatalogueExpired, sanitizeVariantForPublic, EXPIRY_TO_FRONTEND } from '../services/catalogue.service.js'

export const publicRouter = Router()

// Public endpoints are unauthenticated by nature — rate limit generously but
// firmly to blunt scraping/enumeration and enquiry spam.
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false })
const pinLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false })
const enquiryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

publicRouter.use(publicLimiter)

const CATALOGUE_TOKEN_TTL = '30m'

function catalogueToken(catalogueId: string) {
  return jwt.sign({ catalogueId }, env.JWT_ACCESS_SECRET, { expiresIn: CATALOGUE_TOKEN_TTL })
}

function verifyCatalogueToken(token: string | undefined, catalogueId: string): boolean {
  if (!token) return false
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { catalogueId: string }
    return payload.catalogueId === catalogueId
  } catch {
    return false
  }
}

function visitorHash(req: { ip?: string; headers: Record<string, unknown> }) {
  const ua = String(req.headers['user-agent'] ?? '')
  return crypto.createHash('sha256').update(`${req.ip}:${ua}`).digest('hex')
}

async function findViewableCatalogue(slug: string) {
  const catalogue = await prisma.catalogue.findUnique({ where: { slug } })
  if (!catalogue) throw Errors.notFound('This catalogue link is invalid')
  if (catalogue.status === 'disabled') throw Errors.notFound('This catalogue is no longer available')
  if (isCatalogueExpired(catalogue)) throw Errors.notFound('This catalogue link has expired')
  if (catalogue.status === 'draft') throw Errors.notFound('This catalogue is not published yet')
  return catalogue
}

// GET /api/public/catalogues/:slug — metadata + pin-gate check (no product data yet).
publicRouter.get(
  '/catalogues/:slug',
  asyncHandler(async (req, res) => {
    const catalogue = await findViewableCatalogue(req.params.slug)

    if (catalogue.pinProtected) {
      const token = req.headers['x-catalogue-token'] as string | undefined
      const authorized = verifyCatalogueToken(token, catalogue.id)
      if (!authorized) return res.json({ pinRequired: true, name: null })
    }

    return res.json({ pinRequired: false, catalogueId: catalogue.id, name: catalogue.name, message: catalogue.message })
  }),
)

publicRouter.post(
  '/catalogues/:slug/verify-pin',
  pinLimiter,
  asyncHandler(async (req, res) => {
    const { pin } = z.object({ pin: z.string().min(1) }).parse(req.body)
    const catalogue = await findViewableCatalogue(req.params.slug)
    if (!catalogue.pinProtected || !catalogue.pinHash) return res.json({ token: catalogueToken(catalogue.id) })

    const valid = await bcrypt.compare(pin, catalogue.pinHash)
    if (!valid) throw Errors.unauthorized('Incorrect PIN')

    res.json({ token: catalogueToken(catalogue.id) })
  }),
)

// GET /api/public/catalogues/:slug/items — full sanitized product/variant payload.
publicRouter.get(
  '/catalogues/:slug/items',
  asyncHandler(async (req, res) => {
    const catalogue = await findViewableCatalogue(req.params.slug)

    if (catalogue.pinProtected) {
      const token = req.headers['x-catalogue-token'] as string | undefined
      if (!verifyCatalogueToken(token, catalogue.id)) throw Errors.unauthorized('PIN verification required')
    }

    const items = await prisma.catalogueItem.findMany({
      where: { catalogueId: catalogue.id },
      include: { product: { include: { media: { orderBy: { sortOrder: 'asc' } }, variants: { where: { status: 'active' } } } } },
    })

    const settings = {
      showWholesalePrice: catalogue.showWholesalePrice,
      showExactStock: catalogue.showExactStock,
      showAvailability: catalogue.showAvailability,
    }
    const priceAdjust = (p: number) => applyPriceAdjustment(p, catalogue.priceAdjustmentType, Number(catalogue.priceAdjustmentValue))

    const products = items.map((item) => {
      const filterKeys = Object.keys((item.variantFilter as Record<string, string[]>) ?? {})
      const variants = item.product.variants.filter((v) => {
        if (item.allVariants || filterKeys.length === 0) return true
        const filter = item.variantFilter as Record<string, string[]>
        const attrs = v.attributes as Record<string, string>
        return filterKeys.every((k) => !filter[k]?.length || filter[k].includes(attrs[k]))
      })
      return {
        id: item.product.id,
        code: item.product.code,
        name: item.product.name,
        description: item.product.description,
        media: item.product.media,
        moq: catalogue.showMOQ ? item.product.moq : undefined,
        variants: variants.map((v) => sanitizeVariantForPublic(v, settings, priceAdjust)),
      }
    })

    res.json({
      catalogue: {
        id: catalogue.id,
        name: catalogue.name,
        message: catalogue.message,
        allowProductSelection: catalogue.allowProductSelection,
        allowEnquiry: catalogue.allowEnquiry,
        allowImageDownload: catalogue.allowImageDownload,
        expiry: EXPIRY_TO_FRONTEND[catalogue.expiry] ?? '7d',
      },
      products,
    })
  }),
)

publicRouter.post(
  '/catalogues/:slug/visit',
  asyncHandler(async (req, res) => {
    const catalogue = await findViewableCatalogue(req.params.slug)
    const hash = visitorHash(req)
    const productIdsViewed = z.array(z.string()).default([]).parse(req.body?.productIdsViewed ?? [])

    await prisma.$transaction([
      prisma.catalogue.update({ where: { id: catalogue.id }, data: { views: { increment: 1 } } }),
      prisma.catalogueVisit.create({ data: { catalogueId: catalogue.id, productIdsViewed, visitorHash: hash } }),
    ])
    res.status(204).send()
  }),
)

const enquiryItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
})

const enquirySchema = z.object({
  contactName: z.string().min(1).max(200),
  businessName: z.string().min(1).max(200),
  phone: z.string().min(6).max(20),
  whatsapp: z.string().min(6).max(20),
  message: z.string().max(1000).optional(),
  items: z.array(enquiryItemSchema).min(1).max(200),
})

publicRouter.post(
  '/catalogues/:slug/enquiries',
  enquiryLimiter,
  asyncHandler(async (req, res) => {
    const catalogue = await findViewableCatalogue(req.params.slug)
    if (!catalogue.allowEnquiry) throw Errors.forbidden('Enquiries are disabled for this catalogue')
    if (catalogue.pinProtected) {
      const token = req.headers['x-catalogue-token'] as string | undefined
      if (!verifyCatalogueToken(token, catalogue.id)) throw Errors.unauthorized('PIN verification required')
    }

    const input = enquirySchema.parse(req.body)

    // Validate every enquired variant actually belongs to a product on this catalogue —
    // never trust client-supplied prices.
    const allowedProductIds = new Set(
      (await prisma.catalogueItem.findMany({ where: { catalogueId: catalogue.id }, select: { productId: true } })).map((i) => i.productId),
    )
    for (const item of input.items) {
      if (!allowedProductIds.has(item.productId)) throw Errors.badRequest('Enquiry contains a product not in this catalogue')
    }
    const variants = await prisma.productVariant.findMany({ where: { id: { in: input.items.map((i) => i.variantId) } } })
    const variantMap = new Map(variants.map((v) => [v.id, v]))

    const result = await prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findFirst({ where: { phone: input.phone } })
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            businessName: input.businessName,
            contactPerson: input.contactName,
            phone: input.phone,
            whatsapp: input.whatsapp,
            city: '',
            state: '',
            type: 'Wholesaler',
          },
        })
      }

      const priceAdjust = (p: number) => applyPriceAdjustment(p, catalogue.priceAdjustmentType, Number(catalogue.priceAdjustmentValue))
      let estimatedValue = 0
      const itemsData = input.items.map((i) => {
        const variant = variantMap.get(i.variantId)
        if (!variant) throw Errors.badRequest('Enquiry references an unknown variant')
        const price = priceAdjust(Number(variant.price))
        estimatedValue += price * i.quantity
        return { productId: i.productId, variantId: i.variantId, quantity: i.quantity, priceAtEnquiry: price }
      })

      const refNumber = `ENQ-${Date.now().toString(36).toUpperCase()}`
      const enquiry = await tx.enquiry.create({
        data: {
          refNumber,
          catalogueId: catalogue.id,
          customerId: customer.id,
          businessName: input.businessName,
          contactName: input.contactName,
          phone: input.phone,
          whatsapp: input.whatsapp,
          message: input.message,
          estimatedValue,
          items: { create: itemsData },
          timeline: { create: { status: 'New' } },
        },
      })

      await tx.customerActivity.create({
        data: { customerId: customer.id, type: 'submitted_enquiry', title: 'Submitted an enquiry', link: `/enquiries/${enquiry.id}` },
      })
      await tx.customer.update({ where: { id: customer.id }, data: { lastActivityAt: new Date() } })
      await tx.notification.create({
        data: {
          type: 'enquiry',
          title: 'New enquiry received',
          message: `${input.businessName} submitted a new enquiry.`,
          link: `/enquiries/${enquiry.id}`,
        },
      })

      return enquiry
    })

    res.status(201).json({ enquiry: { id: result.id, refNumber: result.refNumber } })
  }),
)
