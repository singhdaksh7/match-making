import type { Router } from 'express'
import type { Prisma } from '@prisma/client'
import crypto from 'node:crypto'
import { z } from 'zod'
import { prisma } from './db.js'
import { allow } from './auth.js'
import { HttpError, asyncRoute, pagination } from './http.js'
import { moneyNumber, priceInput } from './pricing.js'

const status = z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIVED', 'DISABLED', 'EXPIRED'])

/**
 * A catalogue exposes, per product, EXACTLY the variants listed here. There is deliberately no "all variants" shorthand:
 * selecting a product without choosing variants is a validation error, so a product can never reach a customer by accident.
 */
const variantSelection = z.object({ variantId: z.string().min(1), customPrice: priceInput.optional() })
const itemInput = z.object({
  productId: z.string().min(1),
  variants: z.array(variantSelection).min(1, 'Select at least one variant for every product in the catalogue'),
})
// Two schemas on purpose: zod re-applies .default() inside .partial(), which would reset display flags on any PATCH.
const patchInput = z.object({
  customerId: z.string().optional(), title: z.string().min(1).optional(), message: z.string().optional(), expiresAt: z.coerce.date().optional(), status: status.optional(),
  showPrice: z.boolean().optional(), showMOQ: z.boolean().optional(), allowSelection: z.boolean().optional(), allowEnquiry: z.boolean().optional(), allowImageDownload: z.boolean().optional(),
  priceAdjustmentPct: z.number().min(-100).max(100).optional(), pin: z.string().min(4).optional(),
  items: z.array(itemInput).min(1, 'A catalogue needs at least one product').optional(),
})
const createInput = patchInput.extend({
  title: z.string().min(1),
  showPrice: z.boolean().default(true), showMOQ: z.boolean().default(true), allowSelection: z.boolean().default(true), allowEnquiry: z.boolean().default(true), allowImageDownload: z.boolean().default(false),
  priceAdjustmentPct: z.number().min(-100).max(100).default(0),
  items: z.array(itemInput).min(1, 'A catalogue needs at least one product'),
})
type ItemInput = z.infer<typeof itemInput>

const withVariants = { items: { orderBy: { id: 'asc' as const }, include: { variants: true } } } satisfies Prisma.CatalogueInclude
type CatalogueWithItems = Prisma.CatalogueGetPayload<{ include: typeof withVariants }>
const serializeCatalogue = ({ pinHash, ...catalogue }: CatalogueWithItems) => ({
  ...catalogue,
  pinProtected: Boolean(pinHash),
  items: catalogue.items.map((item) => ({
    id: item.id, productId: item.productId,
    variants: item.variants.map((v) => ({ variantId: v.variantId, customPrice: v.customPrice === null ? null : moneyNumber(v.customPrice) })),
  })),
})

/** Tenant + ownership checks for every id in a selection. Raw ids never reach the join table unchecked. */
async function assertSelectionOwned(businessId: string, d: { customerId?: string; items?: ItemInput[] }) {
  if (d.customerId && !(await prisma.customer.findFirst({ where: { id: d.customerId, businessId }, select: { id: true } }))) throw new HttpError(400, 'Customer not found', 'VALIDATION_ERROR')
  const items = d.items ?? []
  if (!items.length) return
  const productIds = items.map((item) => item.productId)
  if (new Set(productIds).size !== productIds.length) throw new HttpError(400, 'A product can only appear once in a catalogue', 'VALIDATION_ERROR')
  if ((await prisma.product.count({ where: { id: { in: productIds }, businessId } })) !== productIds.length) throw new HttpError(400, 'One or more products are invalid', 'VALIDATION_ERROR')
  const variantIds = items.flatMap((item) => item.variants.map((v) => v.variantId))
  if (new Set(variantIds).size !== variantIds.length) throw new HttpError(400, 'A variant can only be selected once', 'VALIDATION_ERROR')
  const found = new Map((await prisma.productVariant.findMany({ where: { id: { in: variantIds }, product: { businessId } }, select: { id: true, productId: true, status: true, sku: true } })).map((v) => [v.id, v]))
  for (const item of items) for (const { variantId } of item.variants) {
    const variant = found.get(variantId)
    if (!variant || variant.productId !== item.productId) throw new HttpError(400, 'One or more variants are invalid for their product', 'VALIDATION_ERROR')
    if (variant.status !== 'ACTIVE') throw new HttpError(400, `Variant ${variant.sku} is inactive and cannot be shared`, 'VALIDATION_ERROR')
  }
}

/** Makes the catalogue's persisted selection equal `items`. Existing CatalogueItem rows are kept (stable ids), the rest is diffed. */
async function replaceItems(tx: Prisma.TransactionClient, catalogueId: string, items: ItemInput[]) {
  const existing = await tx.catalogueItem.findMany({ where: { catalogueId }, select: { id: true, productId: true } })
  const wanted = new Set(items.map((item) => item.productId))
  const stale = existing.filter((row) => !wanted.has(row.productId)).map((row) => row.id)
  if (stale.length) await tx.catalogueItem.deleteMany({ where: { id: { in: stale } } })
  for (const item of items) {
    const row = existing.find((x) => x.productId === item.productId) ?? await tx.catalogueItem.create({ data: { catalogueId, productId: item.productId } })
    await tx.catalogueItemVariant.deleteMany({ where: { catalogueItemId: row.id } })
    await tx.catalogueItemVariant.createMany({ data: item.variants.map((v) => ({ catalogueItemId: row.id, productId: item.productId, variantId: v.variantId, customPrice: v.customPrice ?? null })) })
  }
}

export function registerCatalogueRoutes(r: Router) {
  r.get('/catalogues', asyncRoute(async (req, res) => {
    const { page, limit, skip } = pagination(req), q = String(req.query.q ?? '')
    const where: Prisma.CatalogueWhereInput = { businessId: req.principal!.businessId, ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}) }
    const [data, total] = await prisma.$transaction([prisma.catalogue.findMany({ where, skip, take: limit, include: withVariants, orderBy: { createdAt: 'desc' } }), prisma.catalogue.count({ where })])
    res.json({ data: data.map(serializeCatalogue), meta: { page, limit, total } })
  }))

  r.get('/catalogues/:id', asyncRoute(async (req, res) => {
    const catalogue = await prisma.catalogue.findFirst({ where: { id: String(req.params.id), businessId: req.principal!.businessId }, include: withVariants })
    if (!catalogue) throw new HttpError(404, 'Catalogue not found', 'NOT_FOUND')
    res.json({ data: serializeCatalogue(catalogue) })
  }))

  r.post('/catalogues', allow('OWNER', 'ADMIN', 'STAFF', 'SALES'), asyncRoute(async (req, res) => {
    const businessId = req.principal!.businessId
    const { items, pin, ...fields } = createInput.parse(req.body)
    await assertSelectionOwned(businessId, { customerId: fields.customerId, items })
    const token = crypto.randomBytes(24).toString('base64url') // always server generated; never accepted from a client
    const pinHash = pin ? await (await import('argon2')).default.hash(pin) : undefined
    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.catalogue.create({ data: { ...fields, pinHash, businessId, token } })
      await replaceItems(tx, created.id, items)
      await tx.auditLog.create({ data: { businessId, actorId: req.principal!.id, action: 'CATALOGUE_CREATED', entity: 'Catalogue', entityId: created.id } })
      return created.id
    })
    res.status(201).json({ data: serializeCatalogue(await prisma.catalogue.findUniqueOrThrow({ where: { id }, include: withVariants })) })
  }))

  r.post('/catalogues/:id/disable', allow('OWNER', 'ADMIN'), asyncRoute(async (req, res) => {
    const done = await prisma.catalogue.updateMany({ where: { id: String(req.params.id), businessId: req.principal!.businessId }, data: { status: 'DISABLED' } })
    if (!done.count) throw new HttpError(404, 'Catalogue not found', 'NOT_FOUND')
    await prisma.auditLog.create({ data: { businessId: req.principal!.businessId, actorId: req.principal!.id, action: 'CATALOGUE_DISABLED', entity: 'Catalogue', entityId: String(req.params.id) } })
    res.status(204).end()
  }))

  // Metadata and/or the exact variant selection. When `items` is present it REPLACES the persisted selection.
  r.patch('/catalogues/:id', allow('OWNER', 'ADMIN', 'STAFF', 'SALES'), asyncRoute(async (req, res) => {
    const businessId = req.principal!.businessId
    const { items, pin: _pin, ...fields } = patchInput.parse(req.body)
    const catalogue = await prisma.catalogue.findFirst({ where: { id: String(req.params.id), businessId }, select: { id: true } })
    if (!catalogue) throw new HttpError(404, 'Catalogue not found', 'NOT_FOUND')
    await assertSelectionOwned(businessId, { customerId: fields.customerId, items })
    await prisma.$transaction(async (tx) => {
      await tx.catalogue.update({ where: { id: catalogue.id }, data: fields })
      if (items) {
        await replaceItems(tx, catalogue.id, items)
        await tx.auditLog.create({ data: { businessId, actorId: req.principal!.id, action: 'CATALOGUE_VARIANTS_UPDATED', entity: 'Catalogue', entityId: catalogue.id, metadata: { products: items.length, variants: items.reduce((n, item) => n + item.variants.length, 0) } } })
      }
    })
    res.status(204).end()
  }))
}
