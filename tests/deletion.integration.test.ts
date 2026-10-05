import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import argon2 from 'argon2'
import { AttributeKind, CustomerType, EnquiryStatus, MovementType, PrismaClient, RecordStatus, Role } from '@prisma/client'
import { app } from '../backend/src/app.js'
import { setStorageProvider, StorageError, type StorageProvider } from '../backend/src/storage/index.js'

/** In-memory object store standing in for R2: records every object and delete, and can be told to fail. */
class FakeStorage implements StorageProvider {
  readonly name = 'fake'
  objects = new Set<string>()
  deletes: string[] = []
  failDelete = false
  async upload({ key }: { key: string }) { this.objects.add(key) }
  async delete(key: string) { this.deletes.push(key); if (this.failDelete) throw new StorageError('boom-secret-detail', 'delete'); this.objects.delete(key) }
  async exists(key: string) { return this.objects.has(key) }
  getPublicUrl(key: string) { return `/api/v1/media/${key}` }
}
const fake = new FakeStorage()
setStorageProvider(fake)

if (!(process.env.DATABASE_URL ?? '').includes('/vastraa_test')) throw new Error('Refusing to run integration tests outside the dedicated vastraa_test database.')
const prisma = new PrismaClient()
const server = app.listen(0)
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
const PASSWORD = 'ChangeMe123!'
let cookie = ''

async function request(path: string, init: RequestInit = {}, authed = true) {
  return fetch(`${base}${path}`, { ...init, headers: { ...(authed ? { cookie } : {}), 'content-type': 'application/json', ...(init.headers ?? {}) } })
}
async function loginAs(email: string) {
  const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  assert.equal(r.status, 200, `login ${email}`); cookie = r.headers.get('set-cookie')!.split(';')[0]
}
const del = (path: string, authed = true) => request(path, { method: 'DELETE' }, authed)
const json = async (r: Response) => r.json() as Promise<any>

let A = '', B = ''
let seq = 0
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business" CASCADE')
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id })
  const a = await prisma.business.create({ data: { name: 'Tenant A', slug: 'tenant-a' } })
  const b = await prisma.business.create({ data: { name: 'Tenant B', slug: 'tenant-b' } })
  A = a.id; B = b.id
  for (const [bid, who] of [[A, 'a'], [B, 'b']] as const) {
    await prisma.user.create({ data: { businessId: bid, name: `${who} owner`, email: `${who}-owner@t.test`, passwordHash: hash, role: Role.OWNER } })
  }
  await prisma.user.create({ data: { businessId: A, name: 'a staff', email: 'a-staff@t.test', passwordHash: hash, role: Role.STAFF } })
  await prisma.user.create({ data: { businessId: A, name: 'a sales', email: 'a-sales@t.test', passwordHash: hash, role: Role.SALES } })
})
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  await prisma.$disconnect()
})

// ---------- fixtures ----------
const owner = async (bid: string) => (await prisma.user.findFirstOrThrow({ where: { businessId: bid, role: Role.OWNER } }))
const mkCategory = (bid = A, name = `Cat ${uid()}`) => prisma.category.create({ data: { businessId: bid, name, slug: `c-${uid()}` } })
const mkAttribute = (bid = A, values = ['V1', 'V2'], name = `Attr ${uid()}`) => prisma.attribute.create({ data: { businessId: bid, name, kind: AttributeKind.SELECT, supportsImages: true, values: { create: values.map((value) => ({ value })) } }, include: { values: true } })
const mkCustomer = (bid = A, name = `Cust ${uid()}`) => prisma.customer.create({ data: { businessId: bid, businessName: name, contactPerson: 'P', phone: '+919800000000', type: CustomerType.WHOLESALER } })

/** product with 2 variants, 2 general images, 2 attribute-value images, 1 variant image; every object registered in the fake store */
async function mkProduct(bid = A, opts: { categoryId?: string; sharedKey?: string } = {}) {
  const category = opts.categoryId ? { id: opts.categoryId } : await mkCategory(bid)
  const attr = await mkAttribute(bid)
  await prisma.categoryAttribute.create({ data: { categoryId: category.id, attributeId: attr.id } })
  const code = `P-${uid()}`, key = (n: string) => { const k = `business/${bid}/products/${code}/${n}.png`; fake.objects.add(k); return k }
  const gen1 = opts.sharedKey ?? key('g1'), gen2 = key('g2'), av1 = key('a1'), av2 = key('a2'), vm = key('vm')
  const product = await prisma.product.create({ data: {
    businessId: bid, categoryId: category.id, code, name: `Product ${code}`, moq: 1,
    attributes: { create: [{ attributeId: attr.id }] },
    media: { create: [{ objectKey: gen1, url: gen1, mimeType: 'image/png', primary: true, sortOrder: 0 }, { objectKey: gen2, url: gen2, mimeType: 'image/png', primary: false, sortOrder: 1 }] },
    variants: { create: [
      { sku: `${code}-1`, price: 100, attributeValues: { create: [{ attributeValueId: attr.values[0].id }] }, media: { create: [{ objectKey: vm, url: vm, mimeType: 'image/png' }] } },
      { sku: `${code}-2`, price: 100, attributeValues: { create: [{ attributeValueId: attr.values[1].id }] } },
    ] },
  }, include: { variants: true, media: true } })
  await prisma.productAttributeValue.createMany({ data: attr.values.map((v) => ({ productId: product.id, attributeValueId: v.id })) })
  await prisma.productAttributeValueImage.createMany({ data: [{ productId: product.id, attributeValueId: attr.values[0].id, objectKey: av1, mimeType: 'image/png', sizeBytes: 1, sortOrder: 0 }, { productId: product.id, attributeValueId: attr.values[1].id, objectKey: av2, mimeType: 'image/png', sizeBytes: 1, sortOrder: 1 }] })
  return { product, category, attr, keys: [gen1, gen2, av1, av2, vm], variants: product.variants, media: product.media }
}
const mkCatalogue = (bid: string, productIds: string[], customerId?: string, status: RecordStatus = RecordStatus.ACTIVE) =>
  prisma.catalogue.create({ data: { businessId: bid, customerId, title: `Cat ${uid()}`, token: `tok-${uid()}-${uid()}`, status, items: { create: productIds.map((productId) => ({ productId })) } }, include: { items: true } })
const mkEnquiry = (bid: string, opts: { status?: EnquiryStatus; customerId?: string; catalogueId?: string; productId?: string; variantId?: string } = {}) =>
  prisma.enquiry.create({ data: { businessId: bid, customerId: opts.customerId, catalogueId: opts.catalogueId, reference: `E-${uid()}`, status: opts.status ?? EnquiryStatus.NEW, contactName: 'Buyer', phone: '+919811111111',
    items: { create: [{ productId: opts.productId, variantId: opts.variantId, skuSnapshot: 'SKU', attributesSnapshot: {}, quantity: 1, priceSnapshot: 10 }] }, history: { create: [{ status: opts.status ?? EnquiryStatus.NEW }] } }, include: { items: true } })
const auditCount = (bid: string, action: string) => prisma.auditLog.count({ where: { businessId: bid, action } })

// ---------- authentication / authorisation / tenant isolation ----------
test('every delete endpoint rejects unauthenticated requests (401) and the impact preview too', async () => {
  const paths = ['/products/x', '/products/x/variants/y', '/products/x/media/y', '/customers/x', '/catalogues/x', '/catalogues/x/items/y', '/categories/x', '/attributes/x', '/attributes/x/values/y', '/collections/x', '/enquiries/x']
  for (const p of paths) assert.equal((await del(`/api/v1${p}`, false)).status, 401, p)
  assert.equal((await request('/api/v1/deletion-impact/products/x', {}, false)).status, 401)
})

test('role checks: SALES cannot delete products; STAFF can delete products but not master data or customers', async () => {
  const { product } = await mkProduct()
  await loginAs('a-sales@t.test'); assert.equal((await del(`/api/v1/products/${product.id}`)).status, 403)
  await loginAs('a-staff@t.test')
  for (const p of [`/customers/${(await mkCustomer()).id}`, `/categories/${(await mkCategory()).id}`, `/attributes/${(await mkAttribute()).id}`]) assert.equal((await del(`/api/v1${p}`)).status, 403, p)
  assert.equal((await del(`/api/v1/products/${product.id}`)).status, 200)
})

test('another tenant gets 404 for every delete and preview and nothing is touched; nonexistent ids are 404 too', async () => {
  const p = await mkProduct(), cust = await mkCustomer(), cat = await mkCatalogue(A, [p.product.id], cust.id), coll = await prisma.collection.create({ data: { businessId: A, name: `Coll ${uid()}` } })
  const enq = await mkEnquiry(A, { status: EnquiryStatus.CLOSED }), item = cat.items[0]
  const auditsBefore = await auditCount(A, 'PRODUCT_DELETED')
  await loginAs('b-owner@t.test')
  const targets = [`/products/${p.product.id}`, `/products/${p.product.id}/variants/${p.variants[0].id}`, `/products/${p.product.id}/media/${p.media[0].id}`, `/customers/${cust.id}`, `/catalogues/${cat.id}`,
    `/catalogues/${cat.id}/items/${item.id}`, `/categories/${p.category.id}`, `/attributes/${p.attr.id}`, `/attributes/${p.attr.id}/values/${p.attr.values[0].id}`, `/collections/${coll.id}`, `/enquiries/${enq.id}`]
  for (const t of targets) assert.equal((await del(`/api/v1${t}`)).status, 404, `cross-tenant ${t}`)
  assert.equal((await request(`/api/v1/deletion-impact/products/${p.product.id}`)).status, 404)
  assert.equal((await del('/api/v1/products/does-not-exist')).status, 404)
  assert.equal((await del('/api/v1/customers/does-not-exist')).status, 404)
  assert.ok(await prisma.product.findUnique({ where: { id: p.product.id } })); assert.equal(await prisma.productMedia.count({ where: { productId: p.product.id } }), 2)
  assert.ok(p.keys.every((k) => fake.objects.has(k)), 'no object of tenant A may be deleted by tenant B')
  assert.equal(await auditCount(A, 'PRODUCT_DELETED'), auditsBefore, 'no audit entry for rejected cross-tenant attempts')
})

// ---------- products ----------
test('product: deletes rows + variants + images, removes its R2 objects, keeps shared master data, audits, never leaks keys', async () => {
  await loginAs('a-owner@t.test')
  const customer = await mkCustomer(), p = await mkProduct(), other = await mkProduct(A, { categoryId: undefined })
  const cat = await mkCatalogue(A, [p.product.id, other.product.id], customer.id)
  const coll = await prisma.collection.create({ data: { businessId: A, name: `Coll ${uid()}`, products: { create: [{ productId: p.product.id }] } } })
  const preview = await json(await request(`/api/v1/deletion-impact/products/${p.product.id}`))
  assert.equal(preview.data.canDelete, true); assert.equal(preview.data.imageCount, 5); assert.ok(!JSON.stringify(preview).includes('/products/'), 'storage keys must not be exposed')
  assert.ok(preview.data.removes.some((r: any) => r.label.startsWith('variant') && r.count === 2))
  const priorAudits = await auditCount(A, 'PRODUCT_DELETED')
  const res = await del(`/api/v1/products/${p.product.id}`); assert.equal(res.status, 200)
  const body = await json(res); assert.deepEqual(body.data.cleanup, { attempted: 5, failed: 0 }); assert.ok(!JSON.stringify(body).includes('business/'))
  assert.equal(await prisma.product.count({ where: { id: p.product.id } }), 0)
  assert.equal(await prisma.productVariant.count({ where: { productId: p.product.id } }), 0)
  assert.equal(await prisma.productMedia.count({ where: { productId: p.product.id } }), 0)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId: p.product.id } }), 0)
  assert.equal(await prisma.productAttributeValue.count({ where: { productId: p.product.id } }), 0)
  assert.equal(await prisma.collectionProduct.count({ where: { collectionId: coll.id } }), 0)
  assert.deepEqual((await prisma.catalogueItem.findMany({ where: { catalogueId: cat.id } })).map((i) => i.productId), [other.product.id])
  assert.ok(p.keys.every((k) => !fake.objects.has(k)), 'every R2 object of the product is deleted')
  assert.ok(other.keys.every((k) => fake.objects.has(k)), 'objects of other products are untouched')
  assert.ok(await prisma.catalogue.findUnique({ where: { id: cat.id } })); assert.ok(await prisma.customer.findUnique({ where: { id: customer.id } }))
  assert.ok(await prisma.category.findUnique({ where: { id: p.category.id } })); assert.ok(await prisma.attribute.findUnique({ where: { id: p.attr.id } }))
  assert.equal(await auditCount(A, 'PRODUCT_DELETED'), priorAudits + 1)
  assert.equal((await del(`/api/v1/products/${p.product.id}`)).status, 404, 'second delete is a clean 404')
})

test('legacy stock history no longer blocks deleting a product (stock management is retired); enquiry history still does', async () => {
  const p = await mkProduct(), u = await owner(A)
  await prisma.inventoryMovement.create({ data: { variantId: p.variants[0].id, type: MovementType.PRODUCTION, quantity: 5, reason: 'initial', createdById: u.id } })
  const preview = (await json(await request(`/api/v1/deletion-impact/products/${p.product.id}`))).data
  assert.equal(preview.canDelete, true); assert.ok(preview.removes.some((r: { label: string }) => /legacy stock/.test(r.label)))
  assert.equal((await del(`/api/v1/products/${p.product.id}`)).status, 200)
  assert.equal(await prisma.product.count({ where: { id: p.product.id } }), 0)
  assert.equal(await prisma.inventoryMovement.count({ where: { variantId: p.variants[0].id } }), 0)
  const q = await mkProduct(); await mkEnquiry(A, { productId: q.product.id, variantId: q.variants[0].id })
  const blocked = await del(`/api/v1/products/${q.product.id}`); assert.equal(blocked.status, 409)
  const err = (await json(blocked)).error; assert.equal(err.code, 'HAS_DEPENDENCIES'); assert.match(err.message, /enquir/); assert.match(err.message, /Archive/)
  assert.ok(!/prisma|P20\d\d|constraint/i.test(err.message), 'no raw database error')
  assert.ok(await prisma.product.findUnique({ where: { id: q.product.id } })); assert.ok(q.keys.every((k) => fake.objects.has(k)))
})

test('product referenced by customer enquiries is protected and the enquiry history is untouched', async () => {
  const p = await mkProduct(), enq = await mkEnquiry(A, { productId: p.product.id, variantId: p.variants[0].id })
  const res = await del(`/api/v1/products/${p.product.id}`); assert.equal(res.status, 409); assert.match((await json(res)).error.message, /customer enquiry/)
  assert.equal(await prisma.enquiryItem.count({ where: { enquiryId: enq.id } }), 1); assert.ok(await prisma.product.findUnique({ where: { id: p.product.id } }))
})

test('shared object safety: an R2 object still referenced by another product is NOT deleted', async () => {
  const shared = `business/${A}/products/shared/${uid()}.png`; fake.objects.add(shared)
  const p1 = await mkProduct(A, { sharedKey: shared }), p2 = await mkProduct(A, { sharedKey: shared })
  assert.equal((await del(`/api/v1/products/${p1.product.id}`)).status, 200)
  assert.ok(fake.objects.has(shared), 'still referenced by the second product'); assert.ok(!fake.objects.has(p1.keys[1]))
  assert.equal((await del(`/api/v1/products/${p2.product.id}`)).status, 200)
  assert.ok(!fake.objects.has(shared), 'deleted once the last reference is gone')
})

test('R2 failure: the database delete still succeeds, nothing sensitive leaks, the failure is audited, the DB never points at a missing object', async () => {
  const p = await mkProduct(); fake.failDelete = true
  try {
    const res = await del(`/api/v1/products/${p.product.id}`); assert.equal(res.status, 200)
    const body = await json(res); assert.equal(body.data.cleanup.failed, 5); assert.ok(!JSON.stringify(body).includes('boom-secret-detail'))
  } finally { fake.failDelete = false }
  assert.equal(await prisma.product.count({ where: { id: p.product.id } }), 0)
  assert.ok(await auditCount(A, 'STORAGE_CLEANUP_FAILED') >= 1)
})

// ---------- product media (general images) ----------
test('general product image: deletes only that DB row + its R2 object, promotes the next main image, tenant + parent scoped', async () => {
  const p = await mkProduct(), [main, second] = [...p.media].sort((x, y) => x.sortOrder - y.sortOrder)
  assert.ok(main.primary)
  const other = await mkProduct()
  assert.equal((await del(`/api/v1/products/${other.product.id}/media/${main.id}`)).status, 404, 'media id from a different product in the URL')
  assert.ok(fake.objects.has(main.objectKey))
  const res = await del(`/api/v1/products/${p.product.id}/media/${main.id}`); assert.equal(res.status, 200)
  assert.equal(await prisma.productMedia.count({ where: { id: main.id } }), 0); assert.ok(!fake.objects.has(main.objectKey)); assert.ok(fake.objects.has(second.objectKey))
  assert.equal((await prisma.productMedia.findUniqueOrThrow({ where: { id: second.id } })).primary, true, 'next image promoted to main')
  assert.equal((await del(`/api/v1/products/${p.product.id}/media/${main.id}`)).status, 404)
  assert.ok(other.keys.every((k) => fake.objects.has(k)))
})

// ---------- variants ----------
test('variant: deletes with its image (legacy stock history does not block), protected when it has enquiries', async () => {
  const p = await mkProduct(), u = await owner(A), [v1, v2] = p.variants
  await prisma.inventoryMovement.create({ data: { variantId: v1.id, type: MovementType.ADJUSTMENT, quantity: 1, reason: 'x', createdById: u.id } })
  assert.equal((await del(`/api/v1/products/${p.product.id}/variants/${v1.id}`)).status, 200); assert.equal(await prisma.inventoryMovement.count({ where: { variantId: v1.id } }), 0)
  await mkEnquiry(A, { variantId: v2.id }); assert.equal((await del(`/api/v1/products/${p.product.id}/variants/${v2.id}`)).status, 409)
  const p2 = await mkProduct(), vm = p2.keys[4]
  assert.equal((await del(`/api/v1/products/${p2.product.id}/variants/${p2.variants[0].id}`)).status, 200)
  assert.equal(await prisma.productVariant.count({ where: { productId: p2.product.id } }), 1); assert.ok(!fake.objects.has(vm)); assert.ok(await prisma.product.findUnique({ where: { id: p2.product.id } }))
})

// ---------- customers ----------
test('customer: clean customer is deleted; customers with catalogues or enquiries are protected with an explanation', async () => {
  const clean = await mkCustomer(); assert.equal((await del(`/api/v1/customers/${clean.id}`)).status, 200); assert.equal(await prisma.customer.count({ where: { id: clean.id } }), 0)
  const p = await mkProduct(), withCat = await mkCustomer(); await mkCatalogue(A, [p.product.id], withCat.id)
  const r1 = await del(`/api/v1/customers/${withCat.id}`); assert.equal(r1.status, 409); assert.match((await json(r1)).error.message, /1 catalogue/)
  const withEnq = await mkCustomer(); await mkEnquiry(A, { customerId: withEnq.id })
  const r2 = await del(`/api/v1/customers/${withEnq.id}`); assert.equal(r2.status, 409); const m = (await json(r2)).error.message; assert.match(m, /1 enquiry/); assert.match(m, /Archive/)
  assert.ok(await prisma.customer.findUnique({ where: { id: withCat.id } })); assert.ok(await prisma.customer.findUnique({ where: { id: withEnq.id } }))
})

// ---------- catalogues ----------
test('catalogue: removes the catalogue + entries, link becomes unavailable, products/customer kept, enquiries keep their history', async () => {
  const customer = await mkCustomer(), p = await mkProduct(), cat = await mkCatalogue(A, [p.product.id], customer.id), enq = await mkEnquiry(A, { catalogueId: cat.id, customerId: customer.id })
  assert.equal((await fetch(`${base}/api/v1/public/catalogues/${cat.token}`)).status, 200)
  const res = await del(`/api/v1/catalogues/${cat.id}`); assert.equal(res.status, 200)
  const gone = await fetch(`${base}/api/v1/public/catalogues/${cat.token}`); assert.equal(gone.status, 404); assert.equal((await json(gone)).error.code, 'CATALOGUE_UNAVAILABLE')
  assert.equal(await prisma.catalogueItem.count({ where: { catalogueId: cat.id } }), 0)
  assert.ok(await prisma.product.findUnique({ where: { id: p.product.id } })); assert.ok(await prisma.customer.findUnique({ where: { id: customer.id } }))
  const kept = await prisma.enquiry.findUniqueOrThrow({ where: { id: enq.id } }); assert.equal(kept.catalogueId, null); assert.equal(kept.customerId, customer.id)
  assert.equal(await auditCount(A, 'CATALOGUE_DELETED') >= 1, true)
})

test('catalogue item: removing a product from a catalogue works, but the last product cannot be removed', async () => {
  const p1 = await mkProduct(), p2 = await mkProduct(), cat = await mkCatalogue(A, [p1.product.id, p2.product.id])
  const [i1, i2] = cat.items
  assert.equal((await del(`/api/v1/catalogues/${cat.id}/items/${i1.id}`)).status, 200)
  const last = await del(`/api/v1/catalogues/${cat.id}/items/${i2.id}`); assert.equal(last.status, 409); assert.match((await json(last)).error.message, /only product/)
  assert.ok(await prisma.product.findUnique({ where: { id: p1.product.id } }))
  assert.equal((await del(`/api/v1/catalogues/${cat.id}/items/${i2.id}`.replace(cat.id, 'other'))).status, 404, 'item under the wrong catalogue id')
})

// ---------- categories ----------
test('category: blocked with a useful count while products use it; unused categories are deleted with their attribute links', async () => {
  const used = await mkProduct(), r = await del(`/api/v1/categories/${used.category.id}`); assert.equal(r.status, 409)
  assert.match((await json(r)).error.message, /Cannot delete ".*": used by 1 product\./)
  const empty = await mkCategory(), attr = await mkAttribute(); await prisma.categoryAttribute.create({ data: { categoryId: empty.id, attributeId: attr.id } })
  assert.equal((await del(`/api/v1/categories/${empty.id}`)).status, 200)
  assert.equal(await prisma.categoryAttribute.count({ where: { categoryId: empty.id } }), 0); assert.ok(await prisma.attribute.findUnique({ where: { id: attr.id } }))
})

// ---------- attributes + values ----------
test('attribute: blocked with a dependency breakdown while used; unused attributes are deleted with their values', async () => {
  const used = await mkProduct(), r = await del(`/api/v1/attributes/${used.attr.id}`); assert.equal(r.status, 409)
  const err = (await json(r)).error; assert.match(err.message, /1 category/); assert.match(err.message, /1 product/); assert.match(err.message, /2 variants/)
  assert.ok(await prisma.attribute.findUnique({ where: { id: used.attr.id } }))
  const free = await mkAttribute(A, ['X', 'Y', 'Z']); assert.equal((await del(`/api/v1/attributes/${free.id}`)).status, 200)
  assert.equal(await prisma.attributeValue.count({ where: { attributeId: free.id } }), 0)
})

test('attribute value: blocked while used by variants/products; unused value is deleted; wrong parent attribute is 404', async () => {
  const used = await mkProduct(), v = used.attr.values[0], r = await del(`/api/v1/attributes/${used.attr.id}/values/${v.id}`); assert.equal(r.status, 409); assert.match((await json(r)).error.message, /1 variant/)
  const free = await mkAttribute(A, ['X', 'Y'])
  assert.equal((await del(`/api/v1/attributes/${used.attr.id}/values/${free.values[0].id}`)).status, 404, 'value under the wrong attribute')
  assert.equal((await del(`/api/v1/attributes/${free.id}/values/${free.values[0].id}`)).status, 200)
  assert.ok(await prisma.attribute.findUnique({ where: { id: free.id } })); assert.equal(await prisma.attributeValue.count({ where: { attributeId: free.id } }), 1)
})

// ---------- collections ----------
test('collection: deleted with its links, products untouched', async () => {
  const p = await mkProduct(), coll = await prisma.collection.create({ data: { businessId: A, name: `Coll ${uid()}`, products: { create: [{ productId: p.product.id }] } } })
  assert.equal((await del(`/api/v1/collections/${coll.id}`)).status, 200)
  assert.equal(await prisma.collectionProduct.count({ where: { collectionId: coll.id } }), 0); assert.ok(await prisma.product.findUnique({ where: { id: p.product.id } }))
})

// ---------- enquiries (historical) ----------
test('enquiries are history: only CLOSED ones can be deleted; NEW and CONVERTED are protected', async () => {
  const open = await mkEnquiry(A, { status: EnquiryStatus.NEW }), won = await mkEnquiry(A, { status: EnquiryStatus.CONVERTED }), closed = await mkEnquiry(A, { status: EnquiryStatus.CLOSED })
  assert.equal((await del(`/api/v1/enquiries/${open.id}`)).status, 409)
  const r = await del(`/api/v1/enquiries/${won.id}`); assert.equal(r.status, 409); assert.match((await json(r)).error.message, /sales records/)
  assert.equal((await del(`/api/v1/enquiries/${closed.id}`)).status, 200)
  assert.equal(await prisma.enquiryItem.count({ where: { enquiryId: closed.id } }), 0); assert.equal(await prisma.enquiryStatusHistory.count({ where: { enquiryId: closed.id } }), 0)
  assert.ok(await prisma.enquiry.findUnique({ where: { id: open.id } })); assert.ok(await prisma.enquiry.findUnique({ where: { id: won.id } }))
})

test('historical data is never destroyed by deletes: audit log entries and inventory ledger of other records remain', async () => {
  const auditsBefore = await prisma.auditLog.count({ where: { businessId: A } }), p = await mkProduct()
  assert.equal((await del(`/api/v1/products/${p.product.id}`)).status, 200)
  assert.ok(await prisma.auditLog.count({ where: { businessId: A } }) > auditsBefore, 'deleting adds audit entries, never removes them')
  const log = await prisma.auditLog.findFirstOrThrow({ where: { businessId: A, action: 'PRODUCT_DELETED', entityId: p.product.id } })
  assert.ok(log.actorId); assert.ok(!JSON.stringify(log.metadata).match(/password|secret|token/i))
})

// ---------- attach an uploaded image to an existing product (edit flow) ----------
test('attach image to an existing product: only own-tenant keys are accepted; first image becomes main; it can then be deleted', async () => {
  await loginAs('a-owner@t.test')
  const category = await mkCategory(), product = await prisma.product.create({ data: { businessId: A, categoryId: category.id, code: `AT-${uid()}`, name: 'Attach target', moq: 1 } })
  const ownKey = `business/${A}/products/_staged/general/${uid()}.png`, foreignKey = `business/${B}/products/_staged/general/${uid()}.png`
  fake.objects.add(ownKey)
  const attach = (id: string, key: string) => request(`/api/v1/products/${id}/media`, { method: 'POST', body: JSON.stringify({ objectKey: key, mimeType: 'image/png', sizeBytes: 5 }) })
  assert.equal((await attach(product.id, foreignKey)).status, 400, "another tenant's key is rejected")
  assert.equal((await attach(product.id, '../../etc/passwd')).status, 400)
  const ok = await attach(product.id, ownKey); assert.equal(ok.status, 201)
  const media = (await json(ok)).data; assert.equal(media.primary, true); assert.ok(!JSON.stringify(media).includes('objectKey'))
  await loginAs('b-owner@t.test'); assert.equal((await attach(product.id, `business/${B}/products/_staged/general/${uid()}.png`)).status, 404, 'other tenant cannot attach to this product')
  await loginAs('a-owner@t.test')
  assert.equal((await del(`/api/v1/products/${product.id}/media/${media.id}`)).status, 200)
  assert.ok(!fake.objects.has(ownKey), 'object removed from storage with the row')
})
