import { Router } from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import { asyncRoute, HttpError } from './http.js'
import crypto from 'node:crypto'
import { publicUrl } from './storage/index.js'
import { effectivePrice, moneyNumber } from './pricing.js'

export const publicRouter = Router()

const valueInclude = { attributeValue: { include: { attribute: true } } } as const
const liveCatalogue = async (token: string) => {
  const c = await prisma.catalogue.findUnique({
    where: { token },
    include: {
      business: { select: { name: true } },
      items: {
        orderBy: { id: 'asc' },
        include: {
          variants: true, // the admin's explicit variant selection for this product
          product: { include: {
            category: { select: { id: true, name: true } },
            media: true,
            allowedValues: { include: { ...valueInclude, images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } },
            variants: { include: { attributeValues: { include: valueInclude }, media: { orderBy: { sortOrder: 'asc' } } } },
          } },
        },
      },
    },
  })
  if (!c || c.status !== 'ACTIVE' || (c.expiresAt && c.expiresAt < new Date())) throw new HttpError(404, 'Catalogue is unavailable', 'CATALOGUE_UNAVAILABLE')
  return c
}
type LiveCatalogue = Awaited<ReturnType<typeof liveCatalogue>>
type LiveItem = LiveCatalogue['items'][number]
type LiveProduct = LiveItem['product']
type LiveVariant = LiveProduct['variants'][number]

/**
 * The variants a customer may pick for one catalogue entry: ONLY the ones the admin selected for this catalogue,
 * still active, and still using values enabled on the product. There is no stock condition: availability is unlimited.
 */
const sellableVariants = (item: LiveItem) => {
  const selected = new Map(item.variants.map((row) => [row.variantId, row.customPrice]))
  const enabled = new Set(item.product.allowedValues.map((row) => row.attributeValueId))
  return item.product.variants
    .filter((v) => selected.has(v.id) && v.status === 'ACTIVE' && v.attributeValues.every((a) => !enabled.size || enabled.has(a.attributeValueId)))
    .map((variant) => ({ variant, customPrice: selected.get(variant.id) ?? null }))
}

// Allowed values grouped per attribute, so clients can map a selected value name to its id.
// Only values that at least one SHARED variant uses are exposed: an unshared variant never leaks through the filters.
const productAttributes = (product: LiveProduct, sharedValueIds: Set<string>) => {
  const byAttribute = new Map<string, { id: string; name: string; kind: string; supportsImages: boolean; values: { id: string; value: string; hex: string | null }[] }>()
  for (const row of product.allowedValues) {
    if (!sharedValueIds.has(row.attributeValueId)) continue
    const a = row.attributeValue.attribute
    const entry = byAttribute.get(a.id) ?? { id: a.id, name: a.name, kind: a.kind, supportsImages: a.supportsImages, values: [] }
    entry.values.push({ id: row.attributeValue.id, value: row.attributeValue.value, hex: row.attributeValue.hex })
    byAttribute.set(a.id, entry)
  }
  return [...byAttribute.values()].sort((x, y) => x.name.localeCompare(y.name))
}

// Images only for supportsImages attributes, only for values enabled on the product, only values with >=1 image.
const attributeImages = (product: LiveProduct, sharedValueIds: Set<string>) => product.allowedValues
  .filter((row) => sharedValueIds.has(row.attributeValueId) && row.attributeValue.attribute.supportsImages && row.images.length > 0)
  .map((row) => ({
    attribute: { id: row.attributeValue.attribute.id, name: row.attributeValue.attribute.name, supportsImages: true as const },
    value: { id: row.attributeValue.id, value: row.attributeValue.value, hex: row.attributeValue.hex },
    images: row.images.map((i) => ({ url: publicUrl(i.objectKey), altText: i.altText, sortOrder: i.sortOrder })),
  }))

/**
 * Deterministic image for a variant (the same priority the storefront gallery uses):
 *   1. the variant's own VariantMedia  2. a photo of one of its image-capable attribute values  3. the product's main photo.
 */
export const variantImageKey = (product: LiveProduct, variant: LiveVariant) => {
  const own = variant.media.find((m) => m.objectKey)
  if (own) return own.objectKey
  const used = new Set(variant.attributeValues.map((a) => a.attributeValueId))
  const rows = product.allowedValues
    .filter((row) => row.attributeValue.attribute.supportsImages && used.has(row.attributeValueId) && row.images.length > 0)
    .sort((x, y) => x.attributeValue.attribute.name.localeCompare(y.attributeValue.attribute.name))
  if (rows.length) return rows[0].images[0].objectKey
  const main = product.media.find((m) => m.primary) ?? product.media[0]
  return main?.objectKey || null
}

const safe = (c: LiveCatalogue) => ({
  business: { name: c.business.name }, token: c.token, title: c.title, message: c.message, expiresAt: c.expiresAt,
  settings: { showPrice: c.showPrice, showMOQ: c.showMOQ, allowSelection: c.allowSelection, allowEnquiry: c.allowEnquiry, allowImageDownload: c.allowImageDownload },
  products: c.items.flatMap((item) => {
    const sellable = sellableVariants(item)
    if (!sellable.length) return [] // nothing selected (or everything since deactivated): never show an empty product
    const prices = sellable.map(({ variant, customPrice }) => effectivePrice(variant.price, c.priceAdjustmentPct, customPrice))
    const p = item.product
    const sharedValueIds = new Set(sellable.flatMap(({ variant }) => variant.attributeValues.map((a) => a.attributeValueId)))
    return [{
      id: p.id, code: p.code, name: p.name, description: p.description, moq: c.showMOQ ? p.moq : undefined,
      media: p.media.map((m) => ({ url: m.objectKey ? publicUrl(m.objectKey) : m.url, primary: m.primary })),
      category: { id: p.category.id, name: p.category.name },
      attributes: productAttributes(p, sharedValueIds),
      attributeImages: attributeImages(p, sharedValueIds),
      priceRange: c.showPrice ? { min: moneyNumber(prices.reduce((lo, x) => (x.lt(lo) ? x : lo))), max: moneyNumber(prices.reduce((hi, x) => (x.gt(hi) ? x : hi))) } : undefined,
      variants: sellable.map(({ variant: v }, index) => ({
        id: v.id, sku: v.sku,
        price: c.showPrice ? moneyNumber(prices[index]) : undefined,
        attributes: Object.fromEntries(v.attributeValues.map((a) => [a.attributeValue.attribute.name, a.attributeValue.value])),
        attributeValueIds: v.attributeValues.map((a) => a.attributeValueId),
        images: v.media.map((m) => ({ url: m.objectKey ? publicUrl(m.objectKey) : m.url })),
      })),
    }]
  }),
})

publicRouter.get('/catalogues/:token', asyncRoute(async (req, res) => {
  const c = await liveCatalogue(String(req.params.token))
  await prisma.analyticsEvent.create({ data: { businessId: c.businessId, type: 'CATALOGUE_VIEWED', catalogueId: c.id } })
  res.json({ data: safe(c) })
}))

// Quantity is what the customer wants to buy, not inventory: it is never compared with stock (there is none).
// The cap only keeps the value inside a 32-bit column.
const MAX_QUANTITY = 1_000_000
publicRouter.post('/catalogues/:token/enquiries', asyncRoute(async (req, res) => {
  const c = await liveCatalogue(String(req.params.token))
  if (!c.allowEnquiry) throw new HttpError(403, 'Enquiries are disabled', 'FORBIDDEN')
  const d = z.object({
    contactName: z.string().min(2), phone: z.string().min(6), message: z.string().optional(),
    items: z.array(z.object({ productId: z.string(), variantId: z.string(), quantity: z.number().int().positive().max(MAX_QUANTITY) })).min(1),
  }).parse(req.body)

  const permitted = new Map(c.items.flatMap((item) => sellableVariants(item).map(({ variant, customPrice }) => [variant.id, { product: item.product, variant, customPrice }] as const)))
  const lines = new Map<string, { productId: string; variantId: string; quantity: number }>()
  for (const x of d.items) { // the same variant twice is one line
    const found = permitted.get(x.variantId)
    if (!found || found.product.id !== x.productId) throw new HttpError(400, 'Invalid catalogue item', 'VALIDATION_ERROR')
    const previous = lines.get(x.variantId)
    if (previous && previous.quantity + x.quantity > MAX_QUANTITY) throw new HttpError(400, 'Quantity is too large', 'VALIDATION_ERROR')
    lines.set(x.variantId, { productId: x.productId, variantId: x.variantId, quantity: (previous?.quantity ?? 0) + x.quantity })
  }
  const items = [...lines.values()].map((line) => {
    const { product, variant, customPrice } = permitted.get(line.variantId)!
    return {
      ...line,
      skuSnapshot: variant.sku,
      attributesSnapshot: Object.fromEntries(variant.attributeValues.map((a) => [a.attributeValue.attribute.name, a.attributeValue.value])),
      productNameSnapshot: product.name,
      imageSnapshot: variantImageKey(product, variant),
      priceSnapshot: effectivePrice(variant.price, c.priceAdjustmentPct, customPrice),
    }
  })

  const reference = `ENQ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const enquiry = await prisma.enquiry.create({ data: { businessId: c.businessId, catalogueId: c.id, customerId: c.customerId, reference, contactName: d.contactName, phone: d.phone, message: d.message, items: { create: items }, history: { create: { status: 'NEW' } } } })
  await prisma.analyticsEvent.create({ data: { businessId: c.businessId, type: 'ENQUIRY_SUBMITTED', catalogueId: c.id, metadata: { enquiryId: enquiry.id } } })
  res.status(201).json({ data: { id: enquiry.id, reference: enquiry.reference, status: enquiry.status } })
}))
