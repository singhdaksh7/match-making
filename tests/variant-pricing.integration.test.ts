// Variant-level pricing, explicit catalogue variant selection, public variants/images and unlimited availability.
// Runs against the dedicated vastraa_test database only (see TESTING.md).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import argon2 from 'argon2'
import { AttributeKind, CustomerType, PrismaClient, RecordStatus, Role } from '@prisma/client'
import { app } from '../backend/src/app.js'
import { setStorageProvider, type StorageProvider } from '../backend/src/storage/index.js'

class FakeStorage implements StorageProvider {
  readonly name = 'fake'
  async upload() { /* not used */ }
  async delete() { /* not used */ }
  async exists() { return true }
  getPublicUrl(key: string) { return `/api/v1/media/${key}` }
}
setStorageProvider(new FakeStorage())

if (!(process.env.DATABASE_URL ?? '').includes('/vastraa_test')) throw new Error('Refusing to run integration tests outside the dedicated vastraa_test database.')
const prisma = new PrismaClient()
const server = app.listen(0)
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
const PASSWORD = 'ChangeMe123!'
let cookie = ''
let A = '', B = ''

const call = (path: string, method = 'GET', body?: unknown, authed = true) => fetch(`${base}${path}`, {
  method, headers: { 'content-type': 'application/json', ...(authed ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const json = async (r: Response) => r.json() as Promise<any>
async function loginAs(email: string) {
  const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie')!.split(';')[0]
}

// ---- fixture: tenant A owns the "Premium Rayon Kurti" from the business brief, tenant B is the attacker ----
const PRICES: Record<string, number> = { 'Red/M': 620, 'Red/L': 640, 'Red/XL': 660, 'Blue/M': 630, 'Blue/L': 650 }
let color: { id: string; values: { id: string; value: string }[] }
let size: { id: string; values: { id: string; value: string }[] }
let categoryId = '', customerId = ''
let productId = '', otherProductId = ''
const variantIds: Record<string, string> = {}
let bColor: { id: string; values: { id: string; value: string }[] }
let bProductId = '', bVariantId = ''

const valueId = (attr: { values: { id: string; value: string }[] }, name: string) => attr.values.find((v) => v.value === name)!.id

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business" CASCADE')
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id })
  A = (await prisma.business.create({ data: { name: 'Subh Laxmi Test', slug: 'a-tenant' } })).id
  B = (await prisma.business.create({ data: { name: 'Rival Tenant', slug: 'b-tenant' } })).id
  for (const [bid, who] of [[A, 'a'], [B, 'b']] as const) await prisma.user.create({ data: { businessId: bid, name: `${who} owner`, email: `${who}@vp.test`, passwordHash: hash, role: Role.OWNER } })
  await loginAs('a@vp.test')

  color = await prisma.attribute.create({ data: { businessId: A, name: 'Color', kind: AttributeKind.COLOR, supportsImages: true, values: { create: [{ value: 'Red', hex: '#c00' }, { value: 'Blue', hex: '#00c' }, { value: 'Green', hex: '#0c0' }] } }, include: { values: true } })
  size = await prisma.attribute.create({ data: { businessId: A, name: 'Size', kind: AttributeKind.SIZE, values: { create: [{ value: 'M' }, { value: 'L' }, { value: 'XL' }] } }, include: { values: true } })
  categoryId = (await prisma.category.create({ data: { businessId: A, name: 'Kurtis', slug: 'kurtis', categoryAttributes: { create: [{ attributeId: color.id }, { attributeId: size.id }] } } })).id
  customerId = (await prisma.customer.create({ data: { businessId: A, businessName: 'Raj Fashion', contactPerson: 'Raj', phone: '+919820011223', type: CustomerType.WHOLESALER } })).id

  // created through the real admin API: no stock, no product price
  const created = await call('/api/v1/products', 'POST', {
    categoryId, code: 'PRK-1', name: 'Premium Rayon Kurti', moq: 6,
    attributeIds: [color.id, size.id], allowedAttributeValueIds: [valueId(color, 'Red'), valueId(color, 'Blue'), valueId(size, 'M'), valueId(size, 'L'), valueId(size, 'XL')],
    variants: Object.entries(PRICES).map(([combo, price]) => { const [c, s] = combo.split('/'); return { sku: `PRK-${c}-${s}`, price, attributeValueIds: [valueId(color, c), valueId(size, s)] } }),
  })
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()))
  const product = (await created.json()).data
  productId = product.id
  for (const v of product.variants) variantIds[v.sku.replace('PRK-', '').replace('-', '/')] = v.id
  // a second product of the same tenant, used for cross-product injection
  const other = await call('/api/v1/products', 'POST', { categoryId, code: 'PRK-2', name: 'Other Kurti', attributeIds: [color.id], allowedAttributeValueIds: [valueId(color, 'Green')], variants: [{ sku: 'PRK-2-G', price: 300, attributeValueIds: [valueId(color, 'Green')] }] })
  assert.equal(other.status, 201); otherProductId = (await other.json()).data.variants[0].id
  otherProductId = (await prisma.productVariant.findUniqueOrThrow({ where: { id: otherProductId } })).productId

  // tenant B's own product
  bColor = await prisma.attribute.create({ data: { businessId: B, name: 'Color', kind: AttributeKind.COLOR, values: { create: [{ value: 'Black' }] } }, include: { values: true } })
  const bCategory = await prisma.category.create({ data: { businessId: B, name: 'B Kurtis', slug: 'b-kurtis', categoryAttributes: { create: [{ attributeId: bColor.id }] } } })
  const bProduct = await prisma.product.create({ data: { businessId: B, categoryId: bCategory.id, code: 'B-1', name: 'B Kurti', allowedValues: { create: [{ attributeValueId: bColor.values[0].id }] }, variants: { create: [{ sku: 'B-1-BLK', price: 111, attributeValues: { create: [{ attributeValueId: bColor.values[0].id }] } }] } }, include: { variants: true } })
  bProductId = bProduct.id; bVariantId = bProduct.variants[0].id
})
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  await prisma.$disconnect()
})

const pick = (...combos: string[]) => combos.map((c) => ({ variantId: variantIds[c] }))
const newCatalogue = (extra: Record<string, unknown> = {}, variants = pick('Red/L', 'Red/XL', 'Blue/M')) =>
  call('/api/v1/catalogues', 'POST', { customerId, title: `Cat ${Math.random()}`, status: 'ACTIVE', items: [{ productId, variants }], ...extra })
const publicOf = async (token: string) => (await json(await call(`/api/v1/public/catalogues/${token}`, 'GET', undefined, false))).data

// =============================== PRODUCTS ===============================
test('product is created without stock and without a product-level price; every variant keeps its own price', async () => {
  const detail = (await json(await call(`/api/v1/products/${productId}`))).data
  assert.equal(detail.variants.length, 5)
  const byCombo = Object.fromEntries(detail.variants.map((v: any) => [v.sku, Number(v.price)]))
  assert.deepEqual(byCombo, { 'PRK-Red-M': 620, 'PRK-Red-L': 640, 'PRK-Red-XL': 660, 'PRK-Blue-M': 630, 'PRK-Blue-L': 650 })
  for (const key of ['stock', 'reserved', 'lowStockThreshold']) assert.equal(key in detail.variants[0], false, `${key} must not be exposed`)
  assert.equal('basePrice' in detail, false)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).basePrice, null)
})

test('a client-sent product price or stock is ignored, never stored', async () => {
  const res = await call('/api/v1/products', 'POST', { categoryId, code: 'IGN-1', name: 'Ignored fields', basePrice: 999, attributeIds: [size.id], allowedAttributeValueIds: [valueId(size, 'M')], variants: [{ sku: 'IGN-1-M', price: 100, stock: 500, attributeValueIds: [valueId(size, 'M')] }] })
  assert.equal(res.status, 201)
  const row = await prisma.product.findFirstOrThrow({ where: { businessId: A, code: 'IGN-1' }, include: { variants: true } })
  assert.equal(row.basePrice, null); assert.equal(row.variants[0].stock, 0)
})

test('backend rejects missing, zero, negative, non-numeric, over-precise and oversized variant prices (and creates nothing)', async () => {
  const before = await prisma.product.count({ where: { businessId: A } })
  const bad: unknown[] = [undefined, 0, -5, '620', null, 620.123, 1e12]
  for (const price of bad) {
    const res = await call('/api/v1/products', 'POST', { categoryId, code: `BAD-${String(price)}`, name: 'Bad', attributeIds: [size.id], allowedAttributeValueIds: [valueId(size, 'M')], variants: [{ sku: `BAD-${String(price)}`, ...(price === undefined ? {} : { price }), attributeValueIds: [valueId(size, 'M')] }] })
    assert.equal(res.status, 400, `price ${String(price)} must be rejected`)
  }
  assert.equal(await prisma.product.count({ where: { businessId: A } }), before)
  const add = await call(`/api/v1/products/${productId}/variants`, 'POST', { sku: 'PRK-NOPRICE', attributeValueIds: [valueId(color, 'Blue'), valueId(size, 'XL')] })
  assert.equal(add.status, 400)
})

test('a new variant can be added with its own price; two-decimal prices are stored exactly', async () => {
  const res = await call(`/api/v1/products/${productId}/variants`, 'POST', { sku: 'PRK-Blue-XL', price: 679.5, attributeValueIds: [valueId(color, 'Blue'), valueId(size, 'XL')] })
  assert.equal(res.status, 201)
  const v = (await json(res)).data; assert.equal(Number(v.price), 679.5); assert.equal('stock' in v, false)
  variantIds['Blue/XL'] = v.id
})

test('editing a variant persists its price independently and preserves everything else', async () => {
  const patch = await call(`/api/v1/products/${productId}/variants/${variantIds['Red/M']}`, 'PATCH', { price: 625.25 })
  assert.equal(patch.status, 200); assert.equal(Number((await json(patch)).data.price), 625.25)
  const rows = await prisma.productVariant.findMany({ where: { productId }, include: { attributeValues: true } })
  const price = (sku: string) => Number(rows.find((r) => r.sku === sku)!.price)
  assert.equal(price('PRK-Red-M'), 625.25); assert.equal(price('PRK-Red-L'), 640); assert.equal(price('PRK-Blue-M'), 630)
  assert.equal(rows.find((r) => r.sku === 'PRK-Red-M')!.attributeValues.length, 2, 'attribute values untouched')
  // a product edit that does not mention variants must not touch their prices
  assert.equal((await call(`/api/v1/products/${productId}`, 'PATCH', { name: 'Premium Rayon Kurti', moq: 12 })).status, 204)
  assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds['Red/M'] } })).price), 625.25)
  // restore the brief's price for later tests and check sku/status edits also keep the price
  assert.equal((await call(`/api/v1/products/${productId}/variants/${variantIds['Red/M']}`, 'PATCH', { price: 620 })).status, 200)
  assert.equal((await call(`/api/v1/products/${productId}/variants/${variantIds['Red/M']}`, 'PATCH', { sku: 'PRK-Red-M' })).status, 200)
  assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds['Red/M'] } })).price), 620)
  for (const price of [0, -1, 'abc', 1.005]) assert.equal((await call(`/api/v1/products/${productId}/variants/${variantIds['Red/M']}`, 'PATCH', { price })).status, 400, `PATCH price ${price}`)
  assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds['Red/M'] } })).price), 620)
})

test('the database itself refuses a non-positive variant price', async () => {
  await assert.rejects(prisma.$executeRawUnsafe(`UPDATE "ProductVariant" SET "price" = 0 WHERE "id" = '${variantIds['Red/M']}'`), /price_positive|check constraint/i)
})

// =============================== CATALOGUES ===============================
test('admin picks a subset of variants; exactly that subset is persisted and listed', async () => {
  const res = await newCatalogue()
  assert.equal(res.status, 201); const catalogue = (await json(res)).data
  assert.equal(catalogue.items.length, 1)
  assert.deepEqual(catalogue.items[0].variants.map((v: any) => v.variantId).sort(), [variantIds['Red/L'], variantIds['Red/XL'], variantIds['Blue/M']].sort())
  const rows = await prisma.catalogueItemVariant.findMany({ where: { catalogueItem: { catalogueId: catalogue.id } } })
  assert.equal(rows.length, 3)
  const listed = (await json(await call('/api/v1/catalogues?limit=100'))).data.find((c: any) => c.id === catalogue.id)
  assert.equal(listed.items[0].variants.length, 3); assert.equal(listed.pinHash, undefined)
  const single = (await json(await call(`/api/v1/catalogues/${catalogue.id}`))).data
  assert.equal(single.items[0].variants.length, 3)
})

test('a product with zero selected variants cannot be published; the legacy "product only" shape is rejected too', async () => {
  const count = await prisma.catalogue.count({ where: { businessId: A } })
  for (const items of [[{ productId, variants: [] }], [{ productId }], [{ productId, variantId: variantIds['Red/L'] }]]) {
    const res = await call('/api/v1/catalogues', 'POST', { customerId, title: 'Empty', status: 'ACTIVE', items })
    assert.equal(res.status, 400, JSON.stringify(items))
  }
  assert.equal(await prisma.catalogue.count({ where: { businessId: A } }), count, 'nothing is created on rejection')
})

test('editing preserves the selection, replaces it on request, and never resets other settings', async () => {
  const catalogue = (await json(await newCatalogue({ showPrice: false, priceAdjustmentPct: 5 }))).data
  const itemId = catalogue.items[0].id
  // a metadata-only PATCH keeps the selection AND the display flags (regression: zod re-applied defaults inside .partial())
  assert.equal((await call(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { title: 'Renamed', status: 'ACTIVE' })).status, 204)
  let now = (await json(await call(`/api/v1/catalogues/${catalogue.id}`))).data
  assert.equal(now.title, 'Renamed'); assert.equal(now.showPrice, false); assert.equal(Number(now.priceAdjustmentPct), 5)
  assert.equal(now.items[0].variants.length, 3)
  // replacing the selection
  const next = await call(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { items: [{ productId, variants: pick('Blue/L', 'Red/M') }] })
  assert.equal(next.status, 204)
  now = (await json(await call(`/api/v1/catalogues/${catalogue.id}`))).data
  assert.deepEqual(now.items[0].variants.map((v: any) => v.variantId).sort(), [variantIds['Blue/L'], variantIds['Red/M']].sort())
  assert.equal(now.items[0].id, itemId, 'the catalogue entry keeps its identity')
  assert.equal(now.showPrice, false, 'items edit leaves settings alone')
  // clearing everything is rejected and the previous selection survives
  assert.equal((await call(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { items: [{ productId, variants: [] }] })).status, 400)
  assert.equal((await json(await call(`/api/v1/catalogues/${catalogue.id}`))).data.items[0].variants.length, 2)
})

test('"Select all" (every variant listed explicitly) and a later shrink behave as chosen', async () => {
  const all = Object.keys(variantIds).map((c) => ({ variantId: variantIds[c] }))
  const catalogue = (await json(await newCatalogue({}, all))).data
  assert.equal(catalogue.items[0].variants.length, 6)
  assert.equal((await publicOf(catalogue.token)).products[0].variants.length, 6)
  assert.equal((await call(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { items: [{ productId, variants: pick('Red/M') }] })).status, 204)
  assert.equal((await publicOf(catalogue.token)).products[0].variants.length, 1)
})

test('duplicate variants / products and inactive variants are rejected', async () => {
  assert.equal((await newCatalogue({}, pick('Red/L', 'Red/L'))).status, 400)
  assert.equal((await call('/api/v1/catalogues', 'POST', { title: 'Dup', items: [{ productId, variants: pick('Red/L') }, { productId, variants: pick('Red/XL') }] })).status, 400)
  await prisma.productVariant.update({ where: { id: variantIds['Blue/L'] }, data: { status: 'INACTIVE' } })
  assert.equal((await newCatalogue({}, pick('Blue/L'))).status, 400)
  await prisma.productVariant.update({ where: { id: variantIds['Blue/L'] }, data: { status: 'ACTIVE' } })
})

test('a client can never choose the public token', async () => {
  const res = await newCatalogue({ token: 'my-own-token', slug: 'my-own-slug' })
  const c = (await json(res)).data
  assert.notEqual(c.token, 'my-own-token'); assert.ok(c.token.length >= 32)
  assert.equal((await call('/api/v1/public/catalogues/my-own-token', 'GET', undefined, false)).status, 404)
})

// =============================== PUBLIC ===============================
test('public API exposes only the catalogue-allowed variants with their own prices, a price range and no stock', async () => {
  const c = (await json(await newCatalogue())).data
  const body = await publicOf(c.token); const product = body.products[0]
  assert.deepEqual(product.variants.map((v: any) => v.sku).sort(), ['PRK-Blue-M', 'PRK-Red-L', 'PRK-Red-XL'])
  assert.deepEqual(Object.fromEntries(product.variants.map((v: any) => [v.sku, v.price])), { 'PRK-Blue-M': 630, 'PRK-Red-L': 640, 'PRK-Red-XL': 660 })
  assert.deepEqual(product.priceRange, { min: 630, max: 660 })
  const raw = JSON.stringify(body)
  for (const forbidden of ['stock', 'available', 'objectKey', 'basePrice', 'PRK-Red-M', 'PRK-Blue-L']) assert.equal(raw.includes(forbidden), false, forbidden)
  assert.equal('showExactStock' in body.settings || 'showAvailability' in body.settings, false)
})

test('showPrice=false hides every price and the range', async () => {
  const body = await publicOf((await json(await newCatalogue({ showPrice: false }))).data.token)
  assert.equal(body.products[0].priceRange, undefined); assert.equal('price' in body.products[0].variants[0], false)
})

test('catalogue percentage applies to each variant price with exact decimal arithmetic (600 + 10% = 660)', async () => {
  await prisma.productVariant.update({ where: { id: variantIds['Red/L'] }, data: { price: 600 } })
  await prisma.productVariant.update({ where: { id: variantIds['Red/XL'] }, data: { price: 33.33 } })
  const body = await publicOf((await json(await newCatalogue({ priceAdjustmentPct: 10 }))).data.token)
  const price = Object.fromEntries(body.products[0].variants.map((v: any) => [v.sku, v.price]))
  assert.equal(price['PRK-Red-L'], 660)
  assert.equal(price['PRK-Red-XL'], 36.66) // 36.663 rounded half-up to 2dp, no float artefact
  assert.equal(price['PRK-Blue-M'], 693)
  assert.deepEqual(body.products[0].priceRange, { min: 36.66, max: 693 })
  const discounted = await publicOf((await json(await newCatalogue({ priceAdjustmentPct: -10 }))).data.token)
  assert.equal(Object.fromEntries(discounted.products[0].variants.map((v: any) => [v.sku, v.price]))['PRK-Red-L'], 540)
  await prisma.productVariant.update({ where: { id: variantIds['Red/L'] }, data: { price: 640 } })
  await prisma.productVariant.update({ where: { id: variantIds['Red/XL'] }, data: { price: 660 } })
})

test('a per-variant custom price in the catalogue overrides the percentage; other variants still follow it', async () => {
  const c = (await json(await newCatalogue({ priceAdjustmentPct: 10 }, [{ variantId: variantIds['Red/L'], customPrice: 700 } as any, { variantId: variantIds['Red/XL'] }]))).data
  const price = Object.fromEntries((await publicOf(c.token)).products[0].variants.map((v: any) => [v.sku, v.price]))
  assert.equal(price['PRK-Red-L'], 700); assert.equal(price['PRK-Red-XL'], 726)
})

test('image data for variant switching: image-capable values carry photos, Size does not, VariantMedia is exposed per variant', async () => {
  await prisma.productAttributeValueImage.createMany({ data: [
    { productId, attributeValueId: valueId(color, 'Blue'), objectKey: `business/${A}/blue-1.png`, mimeType: 'image/png', sizeBytes: 1, sortOrder: 0 },
    { productId, attributeValueId: valueId(color, 'Blue'), objectKey: `business/${A}/blue-2.png`, mimeType: 'image/png', sizeBytes: 1, sortOrder: 1 },
  ] })
  await prisma.variantMedia.create({ data: { variantId: variantIds['Blue/M'], objectKey: `business/${A}/blue-m-exact.png`, url: 'x', mimeType: 'image/png' } })
  const product = (await publicOf((await json(await newCatalogue())).data.token)).products[0]
  assert.deepEqual(product.attributeImages.map((g: any) => g.value.value), ['Blue'])
  assert.equal(product.attributes.find((a: any) => a.name === 'Color').supportsImages, true)
  assert.equal(product.attributes.find((a: any) => a.name === 'Size').supportsImages, false)
  const blueM = product.variants.find((v: any) => v.sku === 'PRK-Blue-M'); const redL = product.variants.find((v: any) => v.sku === 'PRK-Red-L')
  assert.deepEqual(blueM.images.map((i: any) => i.url), [`/api/v1/media/business/${A}/blue-m-exact.png`])
  assert.deepEqual(redL.images, [])
})

test('public enquiry stores the exact variants with price, name and image snapshots; several variants of one product are allowed', async () => {
  const c = (await json(await newCatalogue({ priceAdjustmentPct: 10 }, pick('Red/L', 'Blue/M', 'Blue/L')))).data
  const res = await call(`/api/v1/public/catalogues/${c.token}/enquiries`, 'POST', { contactName: 'Buyer One', phone: '+919999999999', price: 1, items: [
    { productId, variantId: variantIds['Red/L'], quantity: 12, price: 1 },
    { productId, variantId: variantIds['Blue/M'], quantity: 24 },
    { productId, variantId: variantIds['Blue/L'], quantity: 6 },
  ] }, false)
  assert.equal(res.status, 201)
  const enquiry = await prisma.enquiry.findFirstOrThrow({ where: { catalogueId: c.id }, include: { items: true } })
  const line = (sku: string) => enquiry.items.find((i) => i.skuSnapshot === sku)!
  assert.equal(enquiry.items.length, 3)
  assert.equal(line('PRK-Red-L').variantId, variantIds['Red/L']); assert.equal(line('PRK-Red-L').productId, productId)
  assert.equal(Number(line('PRK-Red-L').priceSnapshot), 704) // 640 + 10%, client price ignored
  assert.equal(Number(line('PRK-Blue-M').priceSnapshot), 693)
  assert.deepEqual(line('PRK-Blue-M').attributesSnapshot, { Color: 'Blue', Size: 'M' })
  assert.equal(line('PRK-Red-L').quantity, 12); assert.equal(line('PRK-Blue-M').quantity, 24)
  assert.equal(line('PRK-Red-L').productNameSnapshot, 'Premium Rayon Kurti')
  // image priority: exact VariantMedia > the Blue attribute photo > product photo (none here)
  assert.equal(line('PRK-Blue-M').imageSnapshot, `business/${A}/blue-m-exact.png`)
  assert.equal(line('PRK-Blue-L').imageSnapshot, `business/${A}/blue-1.png`)
  assert.equal(line('PRK-Red-L').imageSnapshot, null)
  // admin view derives URLs and never exposes the key
  const admin = (await json(await call('/api/v1/enquiries?limit=100'))).data.find((e: any) => e.id === enquiry.id)
  assert.equal(admin.items.find((i: any) => i.skuSnapshot === 'PRK-Blue-L').imageUrl, `/api/v1/media/business/${A}/blue-1.png`)
  assert.equal(JSON.stringify(admin).includes('imageSnapshot'), false)
})

test('requested quantity is never limited by inventory (there is none): large orders succeed, invalid ones are rejected', async () => {
  const c = (await json(await newCatalogue())).data
  const order = (quantity: unknown) => call(`/api/v1/public/catalogues/${c.token}/enquiries`, 'POST', { contactName: 'Big Buyer', phone: '+919999999999', items: [{ productId, variantId: variantIds['Red/L'], quantity }] }, false)
  assert.equal((await order(250_000)).status, 201)
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds['Red/L'] } })).stock, 0, 'stock was 0 the whole time')
  for (const q of [0, -1, 1.5, '12', 2_000_000]) assert.equal((await order(q)).status, 400, `quantity ${String(q)}`)
  // the same variant listed twice becomes one line
  const dup = await call(`/api/v1/public/catalogues/${c.token}/enquiries`, 'POST', { contactName: 'Dup Buyer', phone: '+919999999999', items: [{ productId, variantId: variantIds['Red/XL'], quantity: 5 }, { productId, variantId: variantIds['Red/XL'], quantity: 7 }] }, false)
  assert.equal(dup.status, 201)
  const rows = await prisma.enquiryItem.findMany({ where: { enquiry: { contactName: 'Dup Buyer' } } })
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 12)
})

test('a variant that was not shared in this catalogue cannot be ordered through it', async () => {
  const c = (await json(await newCatalogue({}, pick('Red/L')))).data
  const res = await call(`/api/v1/public/catalogues/${c.token}/enquiries`, 'POST', { contactName: 'Sneaky', phone: '+919999999999', items: [{ productId, variantId: variantIds['Red/M'], quantity: 1 }] }, false)
  assert.equal(res.status, 400)
  assert.equal(await prisma.enquiry.count({ where: { contactName: 'Sneaky' } }), 0)
})

test('deactivated variants disappear publicly; a product with nothing left to sell is hidden', async () => {
  const c = (await json(await newCatalogue({}, pick('Red/L', 'Red/XL')))).data
  await prisma.productVariant.update({ where: { id: variantIds['Red/L'] }, data: { status: 'INACTIVE' } })
  assert.deepEqual((await publicOf(c.token)).products[0].variants.map((v: any) => v.sku), ['PRK-Red-XL'])
  await prisma.productVariant.update({ where: { id: variantIds['Red/XL'] }, data: { status: 'INACTIVE' } })
  assert.equal((await publicOf(c.token)).products.length, 0)
  await prisma.productVariant.updateMany({ where: { id: { in: [variantIds['Red/L'], variantIds['Red/XL']] } }, data: { status: 'ACTIVE' } })
})

// =============================== SECURITY ===============================
test('unauthenticated admin mutations are rejected', async () => {
  const c = (await json(await newCatalogue())).data
  const attempts: [string, string, unknown][] = [
    ['/api/v1/catalogues', 'POST', { title: 'x', items: [{ productId, variants: pick('Red/L') }] }],
    [`/api/v1/catalogues/${c.id}`, 'PATCH', { items: [{ productId, variants: pick('Red/M') }] }],
    [`/api/v1/products/${productId}/variants/${variantIds['Red/L']}`, 'PATCH', { price: 1 }],
    ['/api/v1/products', 'POST', { categoryId, code: 'X', name: 'X' }],
  ]
  for (const [path, method, body] of attempts) assert.equal((await call(path, method, body, false)).status, 401, `${method} ${path}`)
  assert.equal((await json(await call(`/api/v1/catalogues/${c.id}`))).data.items[0].variants.length, 3)
})

test('cross-tenant: another business cannot attach, read, edit or price tenant A data', async () => {
  const c = (await json(await newCatalogue())).data
  await loginAs('b@vp.test')
  try {
    const mine = await call('/api/v1/catalogues', 'POST', { title: 'B catalogue', items: [{ productId: bProductId, variants: [{ variantId: bVariantId }] }] })
    assert.equal(mine.status, 201) // sanity: B can use its own data
    const bCatalogueId = (await json(mine)).data.id
    // A's variant on B's product, A's product, and a mix
    for (const items of [
      [{ productId: bProductId, variants: pick('Red/L') }],
      [{ productId, variants: pick('Red/L') }],
      [{ productId, variants: [{ variantId: bVariantId }] }],
      [{ productId: bProductId, variants: [{ variantId: bVariantId }, ...pick('Red/L')] }],
    ]) assert.equal((await call('/api/v1/catalogues', 'POST', { title: 'inject', items })).status, 400, JSON.stringify(items))
    assert.equal((await call(`/api/v1/catalogues/${bCatalogueId}`, 'PATCH', { items: [{ productId: bProductId, variants: pick('Red/L') }] })).status, 400)
    assert.equal((await call(`/api/v1/catalogues/${c.id}`, 'PATCH', { items: [{ productId: bProductId, variants: [{ variantId: bVariantId }] }] })).status, 404)
    assert.equal((await call(`/api/v1/catalogues/${c.id}`)).status, 404)
    assert.equal((await call(`/api/v1/products/${productId}`)).status, 404)
    assert.equal((await call(`/api/v1/products/${productId}/variants/${variantIds['Red/L']}`, 'PATCH', { price: 1 })).status, 404)
    assert.equal((await call(`/api/v1/products/${productId}/variants`, 'POST', { sku: 'HACK', price: 5 })).status, 404)
    const list = (await json(await call('/api/v1/catalogues?limit=100'))).data
    assert.equal(list.some((x: any) => x.id === c.id), false)
    assert.equal(JSON.stringify(list).includes(variantIds['Red/L']), false)
  } finally { await loginAs('a@vp.test') }
  assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds['Red/L'] } })).price), 640)
  assert.equal((await json(await call(`/api/v1/catalogues/${c.id}`))).data.items[0].variants.length, 3)
})

test('cross-product injection inside one tenant is rejected by the API and by the database', async () => {
  const foreign = (await prisma.productVariant.findFirstOrThrow({ where: { productId: otherProductId } })).id
  assert.equal((await call('/api/v1/catalogues', 'POST', { title: 'x', items: [{ productId, variants: [{ variantId: foreign }] }] })).status, 400)
  // bypassing the API: the composite foreign key refuses a variant under a different product
  const c = (await json(await newCatalogue())).data
  const item = await prisma.catalogueItem.findFirstOrThrow({ where: { catalogueId: c.id } })
  await assert.rejects(prisma.catalogueItemVariant.create({ data: { catalogueItemId: item.id, productId: item.productId, variantId: foreign } }), /Foreign key|P2003/i)
  await assert.rejects(prisma.catalogueItemVariant.create({ data: { catalogueItemId: item.id, productId: otherProductId, variantId: foreign } }), /Foreign key|P2003/i)
})

// =============================== LIFECYCLE ===============================
test('deleting a variant removes it from catalogues; deleting the catalogue removes its selection; enquiries survive', async () => {
  const c = (await json(await newCatalogue({}, pick('Blue/M', 'Blue/XL')))).data
  const enquiryCount = await prisma.enquiry.count({ where: { businessId: A } })
  const gone = variantIds['Blue/XL']
  assert.equal((await call(`/api/v1/products/${productId}/variants/${variantIds['Red/L']}`, 'DELETE')).status, 409, 'a variant with enquiry history stays protected')
  assert.equal((await call(`/api/v1/products/${productId}/variants/${gone}`, 'DELETE')).status, 200)
  assert.deepEqual((await json(await call(`/api/v1/catalogues/${c.id}`))).data.items[0].variants.map((v: any) => v.variantId), [variantIds['Blue/M']])
  assert.equal((await call(`/api/v1/catalogues/${c.id}`, 'DELETE')).status, 200)
  assert.equal(await prisma.catalogueItemVariant.count({ where: { catalogueItem: { catalogueId: c.id } } }), 0)
  assert.equal(await prisma.enquiry.count({ where: { businessId: A } }), enquiryCount)
})

test('existing admin features keep working: customers, status filters and token stability', async () => {
  const c = (await json(await newCatalogue())).data
  assert.equal((await call('/api/v1/customers', 'POST', { businessName: 'New Buyer', contactPerson: 'N', phone: '+919811111111', type: 'RETAILER' })).status, 201)
  const before = (await json(await call(`/api/v1/catalogues/${c.id}`))).data.token
  assert.equal((await call(`/api/v1/catalogues/${c.id}`, 'PATCH', { items: [{ productId, variants: pick('Red/M') }] })).status, 204)
  assert.equal((await json(await call(`/api/v1/catalogues/${c.id}`))).data.token, before, 'editing never regenerates the token')
  assert.equal((await call(`/api/v1/public/catalogues/${before}`, 'GET', undefined, false)).status, 200)
  assert.equal(RecordStatus.ACTIVE, 'ACTIVE')
})
