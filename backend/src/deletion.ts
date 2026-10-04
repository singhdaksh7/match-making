// Safe deletion for admin-managed data. See DELETION.md for the policy and the entity matrix.
//
// Design
//  * One server-side function per entity computes a deletion IMPACT: what blocks the delete (`blockers`), what the delete
//    removes along with the record (`removes`) and what is deliberately kept (`keeps`). The admin UI reads it before it
//    shows the confirmation; the DELETE endpoint recomputes it inside the transaction, so the two can never disagree.
//  * Historical / transactional data (enquiries, inventory movements, audit log, analytics) is never silently cascaded.
//    A record with history is blocked with an explanation; archiving is offered instead where the entity supports it.
//  * Storage (R2) cannot join a PostgreSQL transaction, so the order is: (1) collect the object keys from the database
//    rows being deleted, (2) delete the rows in ONE transaction (+ audit entry), (3) only after commit delete the objects,
//    and only keys that no remaining row still references. A crash/R2 failure between (2) and (3) leaves at worst an
//    orphan object (harmless, logged); it can never leave a database row pointing at a missing object.
//  * Object keys are always read from the authenticated tenant's own rows, never taken from the client.
import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'
import { allow } from './auth.js'
import { HttpError, asyncRoute } from './http.js'
import { getStorage } from './storage/index.js'

type Db = Prisma.TransactionClient | typeof prisma
export type Blocker = { label: string; count?: number }
export type Impact = {
  entity: Entity; id: string; name: string; canDelete: boolean
  blockers: Blocker[]; removes: Blocker[]; keeps: string[]; hint?: string
  /** storage keys that will be released after commit (never sent to clients) */
  keys: string[]
}
export type Entity = 'product' | 'variant' | 'product-media' | 'customer' | 'catalogue' | 'catalogue-item' | 'category' | 'attribute' | 'attribute-value' | 'collection' | 'enquiry'

const pl = (n: number, one: string, many: string) => (n === 1 ? one : many)
const part = (n: number, one: string, many = `${one}s`): Blocker | undefined => (n > 0 ? { label: pl(n, one, many), count: n } : undefined)
const compact = (items: (Blocker | undefined)[]) => items.filter((x): x is Blocker => Boolean(x))
const describe = (items: Blocker[]) => items.map((b) => (b.count === undefined ? b.label : `${b.count} ${b.label}`)).join(', ')

const ARCHIVE_PRODUCT = 'Archive this product instead: it is hidden from new catalogues while its enquiry and stock history is kept.'
const ARCHIVE_CUSTOMER = 'Archive this customer instead to keep their history.'

/** Computes the impact of deleting one entity of the caller's tenant. 404 for anything outside it. */
export async function computeImpact(db: Db, businessId: string, entity: Entity, id: string): Promise<Impact> {
  const notFound = (what: string) => new HttpError(404, `${what} not found`, 'NOT_FOUND')
  const base = (name: string, blockers: Blocker[], removes: Blocker[], keeps: string[], keys: string[], hint?: string): Impact => ({ entity, id, name, canDelete: blockers.length === 0, blockers, removes, keeps, keys, ...(blockers.length && hint ? { hint } : {}) })

  switch (entity) {
    case 'product': {
      const product = await db.product.findFirst({ where: { id, businessId }, select: { id: true, name: true } })
      if (!product) throw notFound('Product')
      const variantIds = (await db.productVariant.findMany({ where: { productId: id }, select: { id: true } })).map((v) => v.id)
      const [media, attrImages, variantMedia, movements, enquiryRows, catalogueRows, collections] = [
        await db.productMedia.findMany({ where: { productId: id }, select: { objectKey: true } }),
        await db.productAttributeValueImage.findMany({ where: { productId: id }, select: { objectKey: true } }),
        await db.variantMedia.findMany({ where: { variantId: { in: variantIds } }, select: { objectKey: true } }),
        await db.inventoryMovement.count({ where: { variantId: { in: variantIds } } }),
        await db.enquiryItem.findMany({ where: { OR: [{ productId: id }, { variantId: { in: variantIds } }] }, select: { enquiryId: true }, distinct: ['enquiryId'] }),
        await db.catalogueItem.findMany({ where: { productId: id }, select: { catalogueId: true }, distinct: ['catalogueId'] }),
        await db.collectionProduct.count({ where: { productId: id } }),
      ]
      const keys = [...media, ...attrImages, ...variantMedia].map((r) => r.objectKey)
      return base(product.name,
        compact([part(movements, 'inventory movement'), part(enquiryRows.length, 'customer enquiry', 'customer enquiries')]),
        compact([part(variantIds.length, 'variant'), part(keys.length, 'image'), part(catalogueRows.length, 'catalogue entry', 'catalogue entries'), part(collections, 'collection entry', 'collection entries')]),
        ['Customers, categories, attributes and catalogues themselves are not deleted'], keys, ARCHIVE_PRODUCT)
    }
    case 'variant': {
      const variant = await db.productVariant.findFirst({ where: { id, product: { businessId } }, select: { id: true, sku: true } })
      if (!variant) throw notFound('Variant')
      const movements = await db.inventoryMovement.count({ where: { variantId: id } })
      const enquiries = await db.enquiryItem.findMany({ where: { variantId: id }, select: { enquiryId: true }, distinct: ['enquiryId'] })
      const media = await db.variantMedia.findMany({ where: { variantId: id }, select: { objectKey: true } })
      const entries = await db.catalogueItem.count({ where: { variantId: id } })
      return base(variant.sku,
        compact([part(movements, 'inventory movement'), part(enquiries.length, 'customer enquiry', 'customer enquiries')]),
        compact([part(media.length, 'variant image'), part(entries, 'catalogue entry', 'catalogue entries')]),
        ['The product and its other variants are kept'], media.map((m) => m.objectKey),
        'Set the variant to INACTIVE instead to keep its stock and enquiry history.')
    }
    case 'product-media': {
      const media = await db.productMedia.findFirst({ where: { id, product: { businessId } }, select: { id: true, objectKey: true, primary: true } })
      if (!media) throw notFound('Image')
      return base('product image', [], [], media.primary ? ['This is the main image; the next image becomes the main image'] : [], [media.objectKey])
    }
    case 'customer': {
      const customer = await db.customer.findFirst({ where: { id, businessId }, select: { id: true, businessName: true } })
      if (!customer) throw notFound('Customer')
      const catalogues = await db.catalogue.count({ where: { customerId: id, businessId } })
      const enquiries = await db.enquiry.count({ where: { customerId: id, businessId } })
      return base(customer.businessName,
        compact([part(catalogues, 'catalogue'), part(enquiries, 'enquiry', 'enquiries')]), [], [], [],
        catalogues && !enquiries ? 'Delete or reassign these catalogues first, or archive the customer instead.' : ARCHIVE_CUSTOMER)
    }
    case 'catalogue': {
      const catalogue = await db.catalogue.findFirst({ where: { id, businessId }, select: { id: true, title: true } })
      if (!catalogue) throw notFound('Catalogue')
      const items = await db.catalogueItem.count({ where: { catalogueId: id } })
      const enquiries = await db.enquiry.count({ where: { catalogueId: id, businessId } })
      return base(catalogue.title, [], compact([part(items, 'catalogue entry', 'catalogue entries')]),
        ['Products and the customer are not deleted', ...(enquiries ? [`${enquiries} ${pl(enquiries, 'enquiry', 'enquiries')} from this catalogue ${pl(enquiries, 'is', 'are')} kept`] : []), 'The public link stops working immediately'], [])
    }
    case 'catalogue-item': {
      const item = await db.catalogueItem.findFirst({ where: { id, catalogue: { businessId } }, select: { id: true, catalogueId: true, product: { select: { name: true } } } })
      if (!item) throw notFound('Catalogue product')
      const total = await db.catalogueItem.count({ where: { catalogueId: item.catalogueId } })
      return base(item.product.name, total <= 1 ? [{ label: 'it is the only product in this catalogue' }] : [], [], ['The product itself is not deleted'], [],
        'A catalogue needs at least one product. Delete the catalogue instead.')
    }
    case 'category': {
      const category = await db.category.findFirst({ where: { id, businessId }, select: { id: true, name: true } })
      if (!category) throw notFound('Category')
      const products = await db.product.count({ where: { categoryId: id, businessId } })
      const links = await db.categoryAttribute.count({ where: { categoryId: id } })
      return base(category.name, compact([part(products, 'product')]), compact([part(links, 'attribute link')]), ['Attributes themselves are not deleted'], [],
        'Move or delete those products first.')
    }
    case 'attribute': {
      const attribute = await db.attribute.findFirst({ where: { id, businessId }, select: { id: true, name: true, values: { select: { id: true } } } })
      if (!attribute) throw notFound('Attribute')
      const valueIds = attribute.values.map((v) => v.id)
      const categories = await db.categoryAttribute.count({ where: { attributeId: id } })
      const products = await db.productAttribute.count({ where: { attributeId: id } })
      const variants = (await db.variantAttributeValue.findMany({ where: { attributeValueId: { in: valueIds } }, select: { variantId: true }, distinct: ['variantId'] })).length
      const enabled = (await db.productAttributeValue.findMany({ where: { attributeValueId: { in: valueIds } }, select: { productId: true }, distinct: ['productId'] })).length
      const images = await db.productAttributeValueImage.count({ where: { attributeValueId: { in: valueIds } } })
      return base(attribute.name,
        compact([part(categories, 'category', 'categories'), part(products, 'product'), part(variants, 'variant'), part(enabled, 'product with enabled values', 'products with enabled values'), part(images, 'attribute image')]),
        compact([part(valueIds.length, 'value')]), [], [], 'Remove it from those categories and products first.')
    }
    case 'attribute-value': {
      const value = await db.attributeValue.findFirst({ where: { id, attribute: { businessId } }, select: { id: true, value: true, attribute: { select: { name: true } } } })
      if (!value) throw notFound('Attribute value')
      const variants = await db.variantAttributeValue.count({ where: { attributeValueId: id } })
      const products = await db.productAttributeValue.count({ where: { attributeValueId: id } })
      return base(`${value.attribute.name}: ${value.value}`, compact([part(variants, 'variant'), part(products, 'product')]), [], [], [],
        'Remove it from those products and variants first.')
    }
    case 'collection': {
      const collection = await db.collection.findFirst({ where: { id, businessId }, select: { id: true, name: true } })
      if (!collection) throw notFound('Collection')
      const members = await db.collectionProduct.count({ where: { collectionId: id } })
      return base(collection.name, [], compact([part(members, 'product link')]), ['The products themselves are not deleted'], [])
    }
    case 'enquiry': {
      const enquiry = await db.enquiry.findFirst({ where: { id, businessId }, select: { id: true, reference: true, status: true } })
      if (!enquiry) throw notFound('Enquiry')
      const items = await db.enquiryItem.count({ where: { enquiryId: id } })
      // Enquiries are sales history. Only CLOSED ones (explicitly finished, e.g. spam or lost) may be removed; CONVERTED never.
      return base(enquiry.reference, enquiry.status === 'CLOSED' ? [] : [{ label: `it is ${enquiry.status}; only CLOSED enquiries can be deleted` }],
        compact([part(items, 'enquiry item')]), [], [], enquiry.status === 'CONVERTED' ? 'Converted enquiries are sales records and are kept.' : 'Mark the enquiry Closed first.')
    }
  }
}

/** Public shape: never exposes storage keys. */
export const publicImpact = ({ keys: _keys, ...impact }: Impact) => ({ ...impact, imageCount: _keys.length })

const blockedError = (impact: Impact) => new HttpError(409,
  `Cannot delete "${impact.name}": ${impact.entity === 'catalogue-item' || impact.entity === 'enquiry' ? describe(impact.blockers) : `used by ${describe(impact.blockers)}`}.${impact.hint ? ` ${impact.hint}` : ''}`,
  'HAS_DEPENDENCIES', { blockers: impact.blockers, hint: impact.hint })

/** Releases storage objects AFTER the database commit. Skips any key a remaining row still references. Never throws. */
export async function releaseObjects(keys: string[]) {
  const unique = [...new Set(keys.filter((k) => typeof k === 'string' && k.length > 0))]
  if (!unique.length) return { attempted: 0, failed: 0 }
  const referenced = new Set<string>()
  try {
    for (const rows of [
      await prisma.productMedia.findMany({ where: { objectKey: { in: unique } }, select: { objectKey: true } }),
      await prisma.variantMedia.findMany({ where: { objectKey: { in: unique } }, select: { objectKey: true } }),
      await prisma.productAttributeValueImage.findMany({ where: { objectKey: { in: unique } }, select: { objectKey: true } }),
    ]) rows.forEach((r) => referenced.add(r.objectKey))
  } catch (error) { console.error(`[storage] reference check failed; skipping object cleanup (${(error as Error)?.name ?? 'error'})`); return { attempted: 0, failed: unique.length } }
  let failed = 0, attempted = 0
  for (const key of unique.filter((k) => !referenced.has(k))) {
    attempted++
    try { await getStorage().delete(key) } catch (error) { failed++; console.error(`[storage] delete failed for key "${key}"${(error as { causeCode?: string })?.causeCode ? ` (${(error as { causeCode?: string }).causeCode})` : ''}`) }
  }
  return { attempted, failed }
}

const isForeignKeyViolation = (error: unknown) => typeof error === 'object' && error !== null && ['P2003', 'P2014'].includes((error as { code?: string }).code ?? '')

/** Runs the delete for an entity: impact check + row deletion + audit entry in one transaction, storage cleanup after commit. */
async function performDelete(req: { principal?: { id: string; businessId: string } }, entity: Entity, id: string, remove: (tx: Prisma.TransactionClient, impact: Impact) => Promise<void>) {
  const businessId = req.principal!.businessId
  let impact: Impact
  try {
    impact = await prisma.$transaction(async (tx) => {
      const current = await computeImpact(tx, businessId, entity, id)
      if (!current.canDelete) throw blockedError(current)
      await remove(tx, current)
      await tx.auditLog.create({ data: { businessId, actorId: req.principal!.id, action: `${entity.toUpperCase().replace(/-/g, '_')}_DELETED`, entity, entityId: id, metadata: { name: current.name, removed: current.removes.map((r) => ({ [r.label]: r.count })) } } })
      return current
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new HttpError(409, 'This record is still in use and cannot be deleted.', 'HAS_DEPENDENCIES')
    throw error
  }
  const cleanup = await releaseObjects(impact.keys)
  if (cleanup.failed) await prisma.auditLog.create({ data: { businessId, actorId: req.principal!.id, action: 'STORAGE_CLEANUP_FAILED', entity, entityId: id, metadata: { objects: cleanup.failed } } }).catch(() => undefined)
  return { id, entity, cleanup }
}

const ENTITY_PARAM: Record<string, Entity> = { products: 'product', variants: 'variant', media: 'product-media', customers: 'customer', catalogues: 'catalogue', 'catalogue-items': 'catalogue-item', categories: 'category', attributes: 'attribute', 'attribute-values': 'attribute-value', collections: 'collection', enquiries: 'enquiry' }
const MANAGERS = ['OWNER', 'ADMIN'] as const
const EDITORS = ['OWNER', 'ADMIN', 'STAFF'] as const

export function registerDeletionRoutes(r: Router) {
  // Impact preview for the confirmation dialog (read-only, tenant scoped).
  r.get('/deletion-impact/:collection/:id', allow(...EDITORS), asyncRoute(async (req, res) => {
    const entity = ENTITY_PARAM[String(req.params.collection)]
    if (!entity) throw new HttpError(404, 'Unknown entity type', 'NOT_FOUND')
    res.json({ data: publicImpact(await computeImpact(prisma, req.principal!.businessId, entity, String(req.params.id))) })
  }))

  const route = (path: string, entity: Entity, roles: readonly string[], paramId: string, remove: (tx: Prisma.TransactionClient, id: string) => Promise<void>) =>
    r.delete(path, allow(...roles), asyncRoute(async (req, res) => {
      const id = String(req.params[paramId])
      // parent scoping for nested paths: the parent must exist in the caller's tenant and own the child (else 404)
      await assertParent(req, entity, id)
      res.json({ data: await performDelete(req, entity, id, (tx) => remove(tx, id)) })
    }))

  route('/products/:id', 'product', EDITORS, 'id', async (tx, id) => { await tx.product.delete({ where: { id } }) }) // children cascade (schema)
  route('/products/:id/variants/:variantId', 'variant', EDITORS, 'variantId', async (tx, id) => { await tx.productVariant.delete({ where: { id } }) })
  route('/products/:id/media/:mediaId', 'product-media', EDITORS, 'mediaId', async (tx, id) => {
    const media = await tx.productMedia.delete({ where: { id } })
    if (media.primary) { // keep one main image: promote the first remaining one
      const next = await tx.productMedia.findFirst({ where: { productId: media.productId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
      if (next) await tx.productMedia.update({ where: { id: next.id }, data: { primary: true } })
    }
  })
  route('/customers/:id', 'customer', MANAGERS, 'id', async (tx, id) => { await tx.customer.delete({ where: { id } }) })
  route('/catalogues/:id', 'catalogue', MANAGERS, 'id', async (tx, id) => { await tx.catalogue.delete({ where: { id } }) }) // items cascade; enquiries keep history (catalogueId -> null)
  route('/catalogues/:id/items/:itemId', 'catalogue-item', EDITORS, 'itemId', async (tx, id) => { await tx.catalogueItem.delete({ where: { id } }) })
  route('/categories/:id', 'category', MANAGERS, 'id', async (tx, id) => { await tx.category.delete({ where: { id } }) }) // category-attribute links cascade
  route('/attributes/:id', 'attribute', MANAGERS, 'id', async (tx, id) => { await tx.attribute.delete({ where: { id } }) }) // values cascade
  route('/attributes/:id/values/:valueId', 'attribute-value', MANAGERS, 'valueId', async (tx, id) => { await tx.attributeValue.delete({ where: { id } }) })
  route('/collections/:id', 'collection', EDITORS, 'id', async (tx, id) => { await tx.collection.delete({ where: { id } }) })
  route('/enquiries/:id', 'enquiry', MANAGERS, 'id', async (tx, id) => { await tx.enquiry.delete({ where: { id } }) }) // items + status history cascade
}

/** Nested routes: the URL's parent id must really be the parent of the child, inside the caller's tenant. */
async function assertParent(req: { params: Record<string, unknown>; principal?: { businessId: string } }, entity: Entity, id: string) {
  const businessId = req.principal!.businessId
  const parentId = String(req.params.id)
  const mismatch = () => new HttpError(404, 'Not found', 'NOT_FOUND')
  if (entity === 'variant' && !(await prisma.productVariant.findFirst({ where: { id, productId: parentId, product: { businessId } }, select: { id: true } }))) throw mismatch()
  if (entity === 'product-media' && !(await prisma.productMedia.findFirst({ where: { id, productId: parentId, product: { businessId } }, select: { id: true } }))) throw mismatch()
  if (entity === 'catalogue-item' && !(await prisma.catalogueItem.findFirst({ where: { id, catalogueId: parentId, catalogue: { businessId } }, select: { id: true } }))) throw mismatch()
  if (entity === 'attribute-value' && !(await prisma.attributeValue.findFirst({ where: { id, attributeId: parentId, attribute: { businessId } }, select: { id: true } }))) throw mismatch()
}
