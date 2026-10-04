import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import argon2 from 'argon2'
import { AttributeKind, CustomerType, PrismaClient, RecordStatus, Role } from '@prisma/client'
import { app } from '../backend/src/app.js'
import { createStorageProvider, setStorageProvider, StorageError, type StorageProvider } from '../backend/src/storage/index.js'
import { CloudflareR2StorageProvider } from '../backend/src/storage/r2.js'
import { LocalStorageProvider } from '../backend/src/storage/local.js'
import { migrateStorage } from '../backend/src/tools/migrateStorageToR2.js'

/** In-memory storage used for every HTTP test: no filesystem, no network, can be told to fail. */
class FakeStorage implements StorageProvider {
  readonly name = 'fake'
  objects = new Map<string, { body: Buffer; contentType: string }>()
  uploads: string[] = []
  deletes: string[] = []
  failUpload = false
  failDelete = false
  onUpload?: (key: string) => Promise<void>
  async upload({ key, body, contentType }: { key: string; body: Buffer; contentType: string }) {
    if (this.failUpload) throw new StorageError('boom', 'upload')
    this.objects.set(key, { body, contentType }); this.uploads.push(key)
    if (this.onUpload) await this.onUpload(key)
  }
  async delete(key: string) { this.deletes.push(key); if (this.failDelete) throw new StorageError('boom', 'delete'); this.objects.delete(key) }
  async exists(key: string) { return this.objects.has(key) }
  getPublicUrl(key: string) { return `/api/v1/media/${key}` }
}
const fake = new FakeStorage()
setStorageProvider(fake)

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('/vastraa_test')) throw new Error('Refusing to run integration tests outside the dedicated vastraa_test database.')

const prisma = new PrismaClient()
const server = app.listen(0)
const port = (server.address() as AddressInfo).port
const base = `http://127.0.0.1:${port}`
let cookie = ''
let productId = ''
let blackXlId = ''
let maroonLId = ''
let enquiryId = ''

async function request(path: string, init: RequestInit = {}, authenticated = false) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { ...(authenticated ? { cookie } : {}), ...(init.headers ?? {}) },
  })
}

async function login(email = 'admin@vastraa.test', password = 'ChangeMe123!') {
  const response = await request('/api/v1/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  const raw = response.headers.get('set-cookie')
  if (raw) cookie = raw.split(';')[0]
  return response
}

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business" CASCADE')
  const business = await prisma.business.create({ data: { name: 'Vastraa Test', slug: 'vastraa-test' } })
  const passwordHash = await argon2.hash('ChangeMe123!', { type: argon2.argon2id })
  await prisma.user.create({ data: { businessId: business.id, name: 'Test Admin', email: 'admin@vastraa.test', passwordHash, role: Role.OWNER } })
  const other = await prisma.business.create({ data: { name: 'Other Tenant', slug: 'other-test' } })
  await prisma.user.create({ data: { businessId: other.id, name: 'Other Admin', email: 'other@vastraa.test', passwordHash, role: Role.OWNER } })
  const category = await prisma.category.create({ data: { businessId: business.id, name: 'Kurtis', slug: 'kurtis' } })
  const fabric = await prisma.attribute.create({ data: { businessId: business.id, name: 'Fabric', kind: AttributeKind.SELECT, values: { create: [{ value: 'Rayon' }, { value: 'Cotton' }] } } })
  const color = await prisma.attribute.create({ data: { businessId: business.id, name: 'Color', kind: AttributeKind.COLOR, values: { create: [{ value: 'Black', hex: '#000000' }, { value: 'Maroon', hex: '#800000' }, { value: 'Navy', hex: '#1e3a8a' }] } } })
  const size = await prisma.attribute.create({ data: { businessId: business.id, name: 'Size', kind: AttributeKind.SIZE, values: { create: [{ value: 'XL' }, { value: 'L' }, { value: 'M' }] } } })
  const pattern = await prisma.attribute.create({ data: { businessId: business.id, name: 'Pattern', kind: AttributeKind.TEXT, values: { create: [{ value: 'Floral' }, { value: 'Solid' }] } } })
  await prisma.categoryAttribute.createMany({ data: [
    { categoryId: category.id, attributeId: fabric.id },
    { categoryId: category.id, attributeId: color.id },
    { categoryId: category.id, attributeId: size.id },
    { categoryId: category.id, attributeId: pattern.id },
  ] })
  const values = await prisma.attributeValue.findMany({ where: { attributeId: { in: [fabric.id, color.id, size.id] } } })
  const value = (name: string) => values.find((item) => item.value === name)!.id
  const product = await prisma.product.create({
    data: {
      businessId: business.id, categoryId: category.id, code: 'K-101', name: 'Floral Rayon Straight Kurti', description: 'Test product', basePrice: 425, moq: 12,
      attributes: { create: [{ attributeId: fabric.id }, { attributeId: color.id }, { attributeId: size.id }] },
      variants: { create: [
        { sku: 'K-101-BLK-XL', price: 425, stock: 40, attributeValues: { create: [value('Rayon'), value('Black'), value('XL')].map((attributeValueId) => ({ attributeValueId })) } },
        { sku: 'K-101-MAR-L', price: 425, stock: 36, attributeValues: { create: [value('Rayon'), value('Maroon'), value('L')].map((attributeValueId) => ({ attributeValueId })) } },
      ] },
    }, include: { variants: true },
  })
  productId = product.id
  blackXlId = product.variants.find((variant) => variant.sku === 'K-101-BLK-XL')!.id
  maroonLId = product.variants.find((variant) => variant.sku === 'K-101-MAR-L')!.id
  await prisma.productAttributeValue.createMany({ data: [value('Rayon'), value('Black'), value('Maroon'), value('L'), value('XL')].map((attributeValueId) => ({ productId, attributeValueId })) })
  await prisma.customer.create({ data: { businessId: business.id, businessName: 'Raj Fashion House', contactPerson: 'Raj', phone: '+919820011223', type: CustomerType.WHOLESALER } })
  await prisma.catalogue.create({ data: { businessId: business.id, title: 'Public Test', token: 'public-test', status: RecordStatus.ACTIVE, showPrice: false, showExactStock: false, items: { create: { productId } } } })
  await prisma.catalogue.create({ data: { businessId: business.id, title: 'Expired', token: 'expired-test', status: RecordStatus.ACTIVE, expiresAt: new Date(Date.now() - 60_000), items: { create: { productId } } } })
  await prisma.catalogue.create({ data: { businessId: business.id, title: 'Disabled', token: 'disabled-test', status: RecordStatus.DISABLED, items: { create: { productId } } } })
})

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await prisma.$disconnect()
  await rm('.test-uploads', { recursive: true, force: true })
})

test('GET /api/health', async () => { const r = await request('/api/health'); assert.equal(r.status, 200); assert.equal((await r.json()).status, 'ok') })
test('successful login', async () => { const r = await login(); assert.equal(r.status, 200); assert.match(cookie, /^vw_session=/) })
test('invalid login returns 401', async () => { const r = await login('admin@vastraa.test', 'wrong-password'); assert.equal(r.status, 401) })
test('protected endpoint without session returns 401', async () => { const r = await request('/api/v1/products'); assert.equal(r.status, 401) })
test('authenticated auth/me', async () => { const r = await request('/api/v1/auth/me', {}, true); assert.equal(r.status, 200); assert.equal((await r.json()).data.user.email, 'admin@vastraa.test') })
test('tenant isolation', async () => { const prior = cookie; await login('other@vastraa.test'); const r = await request(`/api/v1/products/${productId}`, {}, true); assert.equal(r.status, 404); cookie = prior })
test('product listing', async () => { const r = await request('/api/v1/products', {}, true); assert.equal(r.status, 200); assert.equal((await r.json()).data[0].code, 'K-101') })
test('K-101 product detail', async () => { const r = await request(`/api/v1/products/${productId}`, {}, true); assert.equal(r.status, 200); assert.equal((await r.json()).data.variants.length, 2) })
test('inventory adjustment', async () => { const r = await request('/api/v1/inventory/movements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variantId: blackXlId, type: 'ADJUSTMENT', quantity: 2, reason: 'Test adjustment' }) }, true); assert.equal(r.status, 201); assert.equal((await r.json()).data.stock, 42) })
test('excessive negative stock returns 409', async () => { const r = await request('/api/v1/inventory/movements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variantId: blackXlId, type: 'SALE', quantity: 999, reason: 'Test oversell' }) }, true); assert.equal(r.status, 409) })
test('public catalogue works without admin session', async () => { const r = await request('/api/v1/public/catalogues/public-test'); assert.equal(r.status, 200) })
test('hidden price is sanitized', async () => { const body = await (await request('/api/v1/public/catalogues/public-test')).json(); assert.equal('price' in body.data.products[0].variants[0], false) })
test('hidden exact stock is sanitized', async () => { const body = await (await request('/api/v1/public/catalogues/public-test')).json(); assert.equal('stock' in body.data.products[0].variants[0], false) })
test('expired catalogue is rejected', async () => { const r = await request('/api/v1/public/catalogues/expired-test'); assert.equal(r.status, 404) })
test('disabled catalogue is rejected', async () => { const r = await request('/api/v1/public/catalogues/disabled-test'); assert.equal(r.status, 404) })
test('multi-variant enquiry includes Rayon / Black / XL and Rayon / Maroon / L', async () => {
  const r = await request('/api/v1/public/catalogues/public-test/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactName: 'Buyer Test', phone: '+919999999999', items: [{ productId, variantId: blackXlId, quantity: 2 }, { productId, variantId: maroonLId, quantity: 3 }] }) })
  assert.equal(r.status, 201); enquiryId = (await r.json()).data.id
})
test('enquiry SKU snapshot persists', async () => { const enquiry = await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, include: { items: true } }); assert.deepEqual(enquiry.items.map((item) => item.skuSnapshot).sort(), ['K-101-BLK-XL', 'K-101-MAR-L']) })
test('enquiry attribute snapshot persists', async () => { const enquiry = await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, include: { items: true } }); assert.deepEqual(enquiry.items.map((item) => item.attributesSnapshot), [{ Fabric: 'Rayon', Color: 'Black', Size: 'XL' }, { Fabric: 'Rayon', Color: 'Maroon', Size: 'L' }]) })
test('enquiry status update persists', async () => { const r = await request(`/api/v1/enquiries/${enquiryId}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'CONTACTED', note: 'Test follow-up' }) }, true); assert.equal(r.status, 204); assert.equal((await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiryId } })).status, 'CONTACTED') })

test('global attribute and values can be created without attaching to products', async () => {
  const created = await request('/api/v1/attributes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sleeve', kind: 'TEXT', values: [{ value: 'Short' }, { value: 'Long' }] }) }, true)
  assert.equal(created.status, 201)
  const attribute = (await created.json()).data
  assert.equal(attribute.values.length, 2)
  const extra = await request(`/api/v1/attributes/${attribute.id}/values`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'Three Quarter' }) }, true)
  assert.equal(extra.status, 201)
})

test('category stores applicable attribute types only', async () => {
  const attributes = (await (await request('/api/v1/attributes', {}, true)).json()).data as { id: string; name: string }[]
  const ids = attributes.filter((item) => ['Color', 'Size', 'Fabric', 'Pattern'].includes(item.name)).map((item) => item.id)
  const created = await request('/api/v1/categories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sets', slug: 'sets', attributeIds: ids }) }, true)
  assert.equal(created.status, 201)
  assert.equal((await created.json()).data.categoryAttributes.length, 4)
})

test('K-101 allowed values are the product subset not every global value', async () => {
  const body = await (await request(`/api/v1/products/${productId}`, {}, true)).json()
  const allowed = body.data.allowedValues.map((row: { attributeValue: { value: string } }) => row.attributeValue.value).sort()
  assert.deepEqual(allowed, ['Black', 'L', 'Maroon', 'Rayon', 'XL'])
})

test('products in the same category can use different value subsets', async () => {
  const k101 = await (await request(`/api/v1/products/${productId}`, {}, true)).json()
  const fabricId = k101.data.attributes.find((row: { attribute: { name: string } }) => row.attribute.name === 'Fabric').attributeId
  const colorId = k101.data.attributes.find((row: { attribute: { name: string } }) => row.attribute.name === 'Color').attributeId
  const sizeId = k101.data.attributes.find((row: { attribute: { name: string } }) => row.attribute.name === 'Size').attributeId
  const values = await prisma.attributeValue.findMany({ where: { attribute: { businessId: k101.data.businessId } } })
  const idFor = (name: string) => values.find((item) => item.value === name)!.id
  const created = await request('/api/v1/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    categoryId: k101.data.categoryId, code: 'K-102', name: 'Cotton Navy Kurti', description: 'Other subset', basePrice: 399, moq: 10, status: 'ACTIVE',
    attributeIds: [fabricId, colorId, sizeId],
    allowedAttributeValueIds: [idFor('Cotton'), idFor('Navy'), idFor('M')],
    variants: [{ sku: 'K-102-NAV-M', price: 399, stock: 8, attributeValueIds: [idFor('Cotton'), idFor('Navy'), idFor('M')] }],
  }) }, true)
  assert.equal(created.status, 201)
  const productB = (await created.json()).data
  assert.deepEqual(productB.allowedValues.map((row: { attributeValue: { value: string } }) => row.attributeValue.value).sort(), ['Cotton', 'M', 'Navy'])
  const reloaded = await (await request(`/api/v1/products/${productB.id}`, {}, true)).json()
  assert.deepEqual(reloaded.data.allowedValues.map((row: { attributeValue: { value: string } }) => row.attributeValue.value).sort(), ['Cotton', 'M', 'Navy'])
})

test('creating a product does not generate the cartesian product of enabled values', async () => {
  const k101 = await (await request(`/api/v1/products/${productId}`, {}, true)).json()
  const values = await prisma.attributeValue.findMany({ where: { attribute: { businessId: k101.data.businessId } } })
  const idFor = (name: string) => values.find((item) => item.value === name)!.id
  const created = await request('/api/v1/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    categoryId: k101.data.categoryId, code: 'K-103', name: 'Partial combo Kurti', description: '', basePrice: 410, moq: 10,
    allowedAttributeValueIds: [idFor('Rayon'), idFor('Black'), idFor('Maroon'), idFor('L'), idFor('XL')],
    variants: [{ sku: 'K-103-BLK-XL', price: 410, stock: 5, attributeValueIds: [idFor('Rayon'), idFor('Black'), idFor('XL')] }],
  }) }, true)
  assert.equal(created.status, 201)
  assert.equal((await created.json()).data.variants.length, 1)
})

test('backend rejects a variant value that is not enabled for the product', async () => {
  const navy = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'Navy', attribute: { name: 'Color' } } })
  const rayon = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'Rayon' } })
  const xl = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'XL' } })
  const r = await request(`/api/v1/products/${productId}/variants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: 'K-101-NAV-XL', price: 425, stock: 1, attributeValueIds: [rayon.id, navy.id, xl.id] }) }, true)
  assert.equal(r.status, 400)
  assert.match((await r.json()).error.message, /Navy/)
})

test('backend rejects an attribute value paired with the wrong attribute', async () => {
  const black = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'Black' } })
  const size = await prisma.attribute.findFirstOrThrow({ where: { name: 'Size', values: { some: { value: 'XL' } } } })
  const r = await request(`/api/v1/products/${productId}/variants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: 'K-101-WRONG', price: 425, stock: 1, attributeValueIds: [black.id], attributeAssignments: [{ attributeId: size.id, attributeValueId: black.id }] }) }, true)
  assert.equal(r.status, 400)
})

test('cannot remove an allowed value currently used by a variant', async () => {
  const maroon = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'Maroon' } })
  const current = await prisma.productAttributeValue.findMany({ where: { productId } })
  const next = current.map((row) => row.attributeValueId).filter((id) => id !== maroon.id)
  const r = await request(`/api/v1/products/${productId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allowedAttributeValueIds: next }) }, true)
  assert.equal(r.status, 409)
  assert.match((await r.json()).error.message, /Maroon cannot be removed/)
})

test('public catalogue only exposes K-101 manufactured variants', async () => {
  const body = await (await request('/api/v1/public/catalogues/public-test')).json()
  const skus = body.data.products[0].variants.map((variant: { sku: string }) => variant.sku).sort()
  assert.deepEqual(skus, ['K-101-BLK-XL', 'K-101-MAR-L'])
  const values = body.data.products[0].variants.flatMap((variant: { attributes: Record<string, string> }) => Object.values(variant.attributes))
  assert.equal(values.includes('Navy'), false)
  assert.equal(values.includes('Cotton'), false)
})

test('deleting an in-use global attribute value is blocked', async () => {
  const color = await prisma.attribute.findFirstOrThrow({ where: { name: 'Color' } })
  const maroon = await prisma.attributeValue.findFirstOrThrow({ where: { value: 'Maroon', attributeId: color.id } })
  const r = await request(`/api/v1/attributes/${color.id}/values/${maroon.id}`, { method: 'DELETE' }, true)
  assert.equal(r.status, 409)
})

test('tenant isolation still hides K-101 from the other business', async () => {
  const prior = cookie
  await login('other@vastraa.test')
  const r = await request(`/api/v1/products/${productId}`, {}, true)
  assert.equal(r.status, 404)
  cookie = prior
})

// ======================= attribute-value images & storage providers =======================
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(16)])
type TestFile = { name?: string; type: string; bytes: Buffer }
const json = { 'content-type': 'application/json' }

async function uploadFiles(pathname: string, files: TestFile[], field = 'files') {
  const form = new FormData()
  for (const f of files) form.append(field, new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name ?? 'upload.bin')
  return request(pathname, { method: 'POST', body: form }, true)
}
const imgPath = (pid: string, avid: string) => `/api/v1/products/${pid}/attribute-values/${avid}/images`
const valueId = async (attribute: string, value: string) => (await prisma.attributeValue.findFirstOrThrow({ where: { value, attribute: { name: attribute } } })).id
const attributeId = async (name: string) => (await prisma.attribute.findFirstOrThrow({ where: { name } })).id
const businessIdOf = async () => (await prisma.business.findFirstOrThrow({ where: { slug: 'vastraa-test' } })).id
const asOther = async <T>(fn: () => Promise<T>) => { const prior = cookie; await login('other@vastraa.test'); try { return await fn() } finally { cookie = prior } }
let k104 = ''

test('supportsImages defaults to false and can be toggled on an attribute (and blocks nothing yet)', async () => {
  const color = await attributeId('Color')
  const before = (await (await request('/api/v1/attributes', {}, true)).json()).data.find((a: { id: string }) => a.id === color)
  assert.equal(before.supportsImages, false)
  const patched = await request(`/api/v1/attributes/${color}`, { method: 'PATCH', headers: json, body: JSON.stringify({ supportsImages: true }) }, true)
  assert.equal(patched.status, 200)
  assert.equal((await patched.json()).data.supportsImages, true)
  const created = await request('/api/v1/attributes', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Sleeve2', kind: 'TEXT', supportsImages: true, values: [{ value: 'Short' }] }) }, true)
  assert.equal(created.status, 201)
  assert.equal((await created.json()).data.supportsImages, true)
})

test('attribute-value image upload accepts multiple files and appends with sortOrder', async () => {
  const black = await valueId('Color', 'Black'), biz = await businessIdOf()
  const first = await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: PNG, name: '../../evil name.png' }, { type: 'image/jpeg', bytes: JPEG }])
  assert.equal(first.status, 201)
  const body = (await first.json()).data as { id: string; url: string; sortOrder: number; objectKey?: string }[]
  assert.deepEqual(body.map((i) => i.sortOrder), [0, 1])
  assert.equal(body.every((i) => i.objectKey === undefined), true)
  const rows = await prisma.productAttributeValueImage.findMany({ where: { productId, attributeValueId: black }, orderBy: { sortOrder: 'asc' } })
  assert.equal(rows.length, 2)
  assert.match(rows[0].objectKey, new RegExp(`^business/${biz}/products/${productId}/attributes/${black}/[0-9a-f-]{36}\\.png$`))
  assert.match(rows[1].objectKey, /\.jpg$/)
  assert.equal(rows.some((r) => r.objectKey.includes('evil')), false)
  assert.equal(body[0].url, `/api/v1/media/${rows[0].objectKey}`)
  assert.equal(fake.objects.has(rows[0].objectKey), true)
  const more = await uploadFiles(imgPath(productId, black), [{ type: 'image/webp', bytes: WEBP }])
  assert.equal(more.status, 201)
  assert.equal((await more.json()).data[0].sortOrder, 2)
  const maroon = await valueId('Color', 'Maroon')
  assert.equal((await uploadFiles(imgPath(productId, maroon), [{ type: 'image/png', bytes: PNG }])).status, 201)
})

test('admin product payload exposes ordered images per allowed value and supportsImages', async () => {
  const data = (await (await request(`/api/v1/products/${productId}`, {}, true)).json()).data
  const black = data.allowedValues.find((r: { attributeValue: { value: string } }) => r.attributeValue.value === 'Black')
  assert.equal(black.attributeValue.attribute.supportsImages, true)
  assert.deepEqual(black.images.map((i: { sortOrder: number }) => i.sortOrder), [0, 1, 2])
  assert.equal(data.allowedValues.find((r: { attributeValue: { value: string } }) => r.attributeValue.value === 'XL').images.length, 0)
  assert.equal(data.allowedValues.every((r: { images: { objectKey?: string; url: string }[] }) => r.images.every((i) => i.objectKey === undefined && i.url.startsWith('/api/v1/media/business/'))), true)
})

test('upload is rejected for an attribute with supportsImages=false (Size)', async () => {
  const r = await uploadFiles(imgPath(productId, await valueId('Size', 'XL')), [{ type: 'image/png', bytes: PNG }])
  assert.equal(r.status, 409); assert.match((await r.json()).error.message, /does not support images/)
})
test('upload is rejected for a value not enabled on the product', async () => {
  const r = await uploadFiles(imgPath(productId, await valueId('Color', 'Navy')), [{ type: 'image/png', bytes: PNG }])
  assert.equal(r.status, 409); assert.match((await r.json()).error.message, /not enabled/)
})
test('upload is rejected for a value whose attribute is not assigned to the category, and for unknown ids', async () => {
  const sleeve = await prisma.attribute.create({ data: { businessId: await businessIdOf(), name: 'Neck', kind: 'TEXT', supportsImages: true, values: { create: [{ value: 'Round' }] } }, include: { values: true } })
  const r = await uploadFiles(imgPath(productId, sleeve.values[0].id), [{ type: 'image/png', bytes: PNG }])
  assert.equal(r.status, 400); assert.match((await r.json()).error.message, /not assigned/)
  assert.equal((await uploadFiles(imgPath(productId, 'nope'), [{ type: 'image/png', bytes: PNG }])).status, 404)
})
test('cross-tenant image upload, delete and reorder are 404', async () => {
  const black = await valueId('Color', 'Black')
  const image = await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId, attributeValueId: black } })
  const before = fake.uploads.length
  await asOther(async () => {
    assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: PNG }])).status, 404)
    assert.equal((await request(`${imgPath(productId, black)}/${image.id}`, { method: 'DELETE' }, true)).status, 404)
    assert.equal((await request(`${imgPath(productId, black)}/order`, { method: 'PUT', headers: json, body: JSON.stringify({ imageIds: [] }) }, true)).status, 404)
  })
  assert.equal(fake.uploads.length, before)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { id: image.id } }), 1)
})
test('unauthenticated image upload is 401', async () => {
  const r = await request(imgPath(productId, await valueId('Color', 'Black')), { method: 'POST', body: new FormData() })
  assert.equal(r.status, 401)
})
test('invalid upload types are rejected with 400 and nothing is stored', async () => {
  const black = await valueId('Color', 'Black'), count = await prisma.productAttributeValueImage.count(), uploads = fake.uploads.length
  assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'text/plain', bytes: Buffer.from('hello') }])).status, 400)
  assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: JPEG }])).status, 400) // magic bytes mismatch
  assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: Buffer.from('<svg/>') }])).status, 400)
  assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: PNG }, { type: 'image/gif', bytes: Buffer.from('nope') }])).status, 400) // one bad file rejects all
  assert.equal((await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: PNG }], 'wrong')).status, 400)
  assert.equal((await request(imgPath(productId, black), { method: 'POST', body: new FormData() }, true)).status, 400)
  assert.equal(await prisma.productAttributeValueImage.count(), count); assert.equal(fake.uploads.length, uploads)
})
test('oversized upload is rejected with 413', async () => {
  const r = await uploadFiles(imgPath(productId, await valueId('Color', 'Black')), [{ type: 'image/png', bytes: Buffer.concat([PNG, Buffer.alloc(4096)]) }])
  assert.equal(r.status, 413)
})
test('storage upload failure returns 502 and creates no database row', async () => {
  const black = await valueId('Color', 'Black'), count = await prisma.productAttributeValueImage.count()
  fake.failUpload = true
  try {
    const r = await uploadFiles(imgPath(productId, black), [{ type: 'image/png', bytes: PNG }])
    assert.equal(r.status, 502); const err = (await r.json()).error
    assert.equal(err.code, 'STORAGE_UNAVAILABLE'); assert.doesNotMatch(err.message, /boom/)
  } finally { fake.failUpload = false }
  assert.equal(await prisma.productAttributeValueImage.count(), count)
})
test('database failure after upload triggers compensating storage delete', async () => {
  const created = await request('/api/v1/products', { method: 'POST', headers: json, body: JSON.stringify({
    categoryId: (await prisma.product.findFirstOrThrow({ where: { id: productId } })).categoryId, code: 'K-104', name: 'Image test', basePrice: 100, moq: 1,
    allowedAttributeValueIds: [await valueId('Color', 'Black'), await valueId('Color', 'Maroon')],
  }) }, true)
  assert.equal(created.status, 201); k104 = (await created.json()).data.id
  const black = await valueId('Color', 'Black')
  fake.onUpload = async () => { await prisma.productAttributeValue.deleteMany({ where: { productId: k104, attributeValueId: black } }) } // value disappears mid-request
  fake.deletes = []
  try {
    const r = await uploadFiles(imgPath(k104, black), [{ type: 'image/png', bytes: PNG }])
    assert.equal(r.status, 409)
    const key = fake.uploads[fake.uploads.length - 1]
    assert.deepEqual(fake.deletes, [key]); assert.equal(fake.objects.has(key), false)
  } finally { fake.onUpload = undefined }
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId: k104 } }), 0)
  await prisma.productAttributeValue.create({ data: { productId: k104, attributeValueId: black } })
})
test('disabling supportsImages on an attribute that has images is blocked with 409 and a count', async () => {
  const r = await request(`/api/v1/attributes/${await attributeId('Color')}`, { method: 'PATCH', headers: json, body: JSON.stringify({ supportsImages: false }) }, true)
  assert.equal(r.status, 409); assert.match((await r.json()).error.message, /\d+ attribute-value images? still exist/)
  assert.equal((await prisma.attribute.findFirstOrThrow({ where: { name: 'Color' } })).supportsImages, true)
})
test('alt text can be updated and images reordered (exact id set required)', async () => {
  const black = await valueId('Color', 'Black')
  const ids = (await prisma.productAttributeValueImage.findMany({ where: { productId, attributeValueId: black }, orderBy: { sortOrder: 'asc' } })).map((i) => i.id)
  const alt = await request(`${imgPath(productId, black)}/${ids[0]}`, { method: 'PATCH', headers: json, body: JSON.stringify({ altText: 'Front view' }) }, true)
  assert.equal(alt.status, 200); assert.equal((await alt.json()).data.altText, 'Front view')
  const reversed = [...ids].reverse()
  const ok = await request(`${imgPath(productId, black)}/order`, { method: 'PUT', headers: json, body: JSON.stringify({ imageIds: reversed }) }, true)
  assert.equal(ok.status, 200)
  assert.deepEqual((await ok.json()).data.map((i: { id: string }) => i.id), reversed)
  for (const bad of [reversed.slice(1), [...reversed, 'extra'], [reversed[0], reversed[0], reversed[1]]]) {
    assert.equal((await request(`${imgPath(productId, black)}/order`, { method: 'PUT', headers: json, body: JSON.stringify({ imageIds: bad }) }, true)).status, 400)
  }
  const maroonImage = await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId, attributeValueId: await valueId('Color', 'Maroon') } })
  assert.equal((await request(`${imgPath(productId, black)}/order`, { method: 'PUT', headers: json, body: JSON.stringify({ imageIds: [...reversed.slice(1), maroonImage.id] }) }, true)).status, 400)
})
test('public catalogue returns attributeImages only for enabled supportsImages values with images, without storage internals', async () => {
  const res = await request('/api/v1/public/catalogues/public-test'); assert.equal(res.status, 200)
  const raw = await res.text(); const product = JSON.parse(raw).data.products[0]
  assert.deepEqual(product.attributeImages.map((g: { value: { value: string } }) => g.value.value).sort(), ['Black', 'Maroon'])
  const black = product.attributeImages.find((g: { value: { value: string } }) => g.value.value === 'Black')
  assert.equal(black.attribute.supportsImages, true); assert.equal(black.value.hex, '#000000')
  assert.equal(black.images.length, 3); assert.deepEqual(black.images.map((i: { sortOrder: number }) => i.sortOrder), [0, 1, 2])
  assert.deepEqual(Object.keys(black.images[0]).sort(), ['altText', 'sortOrder', 'url'])
  assert.match(black.images[0].url, /^\/api\/v1\/media\/business\//)
  assert.equal(raw.includes('objectKey'), false); assert.equal(raw.includes('businessId'), false); assert.equal(raw.includes('.test-uploads'), false)
  const attrs = product.attributes as { name: string; supportsImages: boolean; values: { id: string; value: string }[] }[]
  assert.deepEqual(attrs.map((a) => a.name), ['Color', 'Fabric', 'Size'])
  assert.equal(attrs.find((a) => a.name === 'Color')!.supportsImages, true); assert.equal(attrs.find((a) => a.name === 'Size')!.supportsImages, false)
  assert.deepEqual(attrs.find((a) => a.name === 'Color')!.values.map((v) => v.value).sort(), ['Black', 'Maroon'])
  assert.equal(product.variants[0].attributes.Fabric, 'Rayon') // legacy name->value map intact
})
test('enquiry attribute snapshots are unchanged by attribute images', async () => {
  const enquiry = await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, include: { items: true } })
  assert.deepEqual(enquiry.items.map((i) => i.attributesSnapshot), [{ Fabric: 'Rayon', Color: 'Black', Size: 'XL' }, { Fabric: 'Rayon', Color: 'Maroon', Size: 'L' }])
})
test('delete image removes DB row and stored object', async () => {
  const maroon = await valueId('Color', 'Maroon')
  const image = await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId, attributeValueId: maroon } })
  assert.equal(fake.objects.has(image.objectKey), true)
  assert.equal((await request(`${imgPath(productId, maroon)}/${image.id}`, { method: 'DELETE' }, true)).status, 204)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { id: image.id } }), 0)
  assert.equal(fake.objects.has(image.objectKey), false)
  assert.equal((await request(`${imgPath(productId, maroon)}/${image.id}`, { method: 'DELETE' }, true)).status, 404)
})
test('storage delete failure still removes the DB row and returns 204 (orphan object tolerated)', async () => {
  const black = await valueId('Color', 'Black')
  const image = await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId, attributeValueId: black }, orderBy: { sortOrder: 'desc' } })
  fake.failDelete = true
  try { assert.equal((await request(`${imgPath(productId, black)}/${image.id}`, { method: 'DELETE' }, true)).status, 204) } finally { fake.failDelete = false }
  assert.equal(await prisma.productAttributeValueImage.count({ where: { id: image.id } }), 0)
  assert.equal(fake.objects.has(image.objectKey), true)
})
test('PATCH diff keeps images of still-enabled values and removes images of removed unused values (rows and objects)', async () => {
  const black = await valueId('Color', 'Black'), maroon = await valueId('Color', 'Maroon')
  assert.equal((await uploadFiles(imgPath(k104, black), [{ type: 'image/png', bytes: PNG }])).status, 201)
  assert.equal((await uploadFiles(imgPath(k104, maroon), [{ type: 'image/png', bytes: PNG }])).status, 201)
  const maroonKey = (await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId: k104, attributeValueId: maroon } })).objectKey
  const blackKey = (await prisma.productAttributeValueImage.findFirstOrThrow({ where: { productId: k104, attributeValueId: black } })).objectKey
  // Unrelated PATCH that re-sends the same set must not drop any image.
  assert.equal((await request(`/api/v1/products/${k104}`, { method: 'PATCH', headers: json, body: JSON.stringify({ allowedAttributeValueIds: [black, maroon] }) }, true)).status, 204)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId: k104 } }), 2)
  assert.equal((await request(`/api/v1/products/${k104}`, { method: 'PATCH', headers: json, body: JSON.stringify({ allowedAttributeValueIds: [black] }) }, true)).status, 204)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId: k104, attributeValueId: maroon } }), 0)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId: k104, attributeValueId: black } }), 1)
  assert.equal(fake.objects.has(maroonKey), false); assert.equal(fake.objects.has(blackKey), true)
  assert.equal(await prisma.attributeValue.count({ where: { id: maroon } }), 1) // global value never cascaded
})
test('removing a variant-used value is still 409 and its images stay intact', async () => {
  const imagesBefore = await prisma.productAttributeValueImage.count({ where: { productId } })
  const keep = (await prisma.productAttributeValue.findMany({ where: { productId } })).map((r) => r.attributeValueId).filter((id) => id !== null)
  const maroon = await valueId('Color', 'Maroon')
  const r = await request(`/api/v1/products/${productId}`, { method: 'PATCH', headers: json, body: JSON.stringify({ allowedAttributeValueIds: keep.filter((id) => id !== maroon) }) }, true)
  assert.equal(r.status, 409)
  assert.equal(await prisma.productAttributeValueImage.count({ where: { productId } }), imagesBefore)
})
test('POST /media stores through the provider under a staged tenant key and general product media uses derived URLs', async () => {
  const biz = await businessIdOf()
  const form = new FormData(); form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'x.png')
  const up = await request('/api/v1/media', { method: 'POST', body: form }, true); assert.equal(up.status, 201)
  const media = (await up.json()).data
  assert.match(media.objectKey, new RegExp(`^business/${biz}/products/_staged/general/[0-9a-f-]{36}\\.png$`))
  assert.equal(fake.objects.has(media.objectKey), true); assert.equal(media.url, `/api/v1/media/${media.objectKey}`)
  const bad = new FormData(); bad.append('file', new Blob([new Uint8Array(JPEG)], { type: 'image/png' }), 'x.png')
  assert.equal((await request('/api/v1/media', { method: 'POST', body: bad }, true)).status, 400)
  const category = (await prisma.product.findFirstOrThrow({ where: { id: productId } })).categoryId
  const create = (mediaItem: object) => request('/api/v1/products', { method: 'POST', headers: json, body: JSON.stringify({ categoryId: category, code: `K-M-${Math.random().toString(36).slice(2, 7)}`, name: 'Media test', basePrice: 10, media: [mediaItem] }) }, true)
  const ok = await create({ objectKey: media.objectKey, url: 'https://evil.example/x.png', mimeType: 'image/png', sizeBytes: media.sizeBytes, primary: true })
  assert.equal(ok.status, 201); const product = (await ok.json()).data
  assert.equal(product.media[0].url, `/api/v1/media/${media.objectKey}`)
  const other = await prisma.business.findFirstOrThrow({ where: { slug: 'other-test' } })
  assert.equal((await create({ objectKey: `business/${other.id}/products/x/general/a.png`, url: 'x', mimeType: 'image/png' })).status, 400)
  assert.equal((await create({ objectKey: `${other.id}/legacy.png`, url: 'x', mimeType: 'image/png' })).status, 400)
  assert.equal((await create({ objectKey: `business/${biz}/../${other.id}/a.png`, url: 'x', mimeType: 'image/png' })).status, 400)
  assert.equal((await create({ objectKey: `${biz}/legacy-owned.png`, url: 'x', mimeType: 'image/png' })).status, 201) // legacy own prefix still accepted
})
test('inventory and auth still work after image changes', async () => {
  assert.equal((await request('/api/v1/auth/me', {}, true)).status, 200)
  assert.equal((await request('/api/v1/inventory/movements', { method: 'POST', headers: json, body: JSON.stringify({ variantId: maroonLId, type: 'ADJUSTMENT', quantity: 1, reason: 'post-image check' }) }, true)).status, 201)
})

// ---- provider unit tests (no network) ----
test('R2 public URL generation joins base and key safely', () => {
  const r2 = (publicBaseUrl: string) => new CloudflareR2StorageProvider({ accessKeyId: 'a', secretAccessKey: 'b', bucket: 'bkt', publicBaseUrl, client: { send: async () => ({}) } })
  assert.equal(r2('https://cdn.example.com').getPublicUrl('business/b1/p/a b/ü.png'), 'https://cdn.example.com/business/b1/p/a%20b/%C3%BC.png')
  assert.equal(r2('https://cdn.example.com/').getPublicUrl('/business/b1/x.png'), 'https://cdn.example.com/business/b1/x.png')
  assert.equal(r2('https://cdn.example.com/media///').getPublicUrl('business/x.png'), 'https://cdn.example.com/media/business/x.png')
  assert.equal(new LocalStorageProvider('x').getPublicUrl('b1/a#b.png'), '/api/v1/media/b1/a%23b.png')
})
test('R2 provider sends the expected commands to a mocked client and maps failures', async () => {
  const sent: unknown[] = []; let mode: 'ok' | 'notfound' | 'denied' = 'ok'
  const client = { send: async (c: unknown) => { sent.push(c); if (mode === 'notfound') throw Object.assign(new Error('x'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }); if (mode === 'denied') throw Object.assign(new Error('secret-endpoint.r2.cloudflarestorage.com'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }); return {} } }
  const p = new CloudflareR2StorageProvider({ accessKeyId: 'a', secretAccessKey: 'b', bucket: 'bkt', publicBaseUrl: 'https://cdn.example.com', client })
  await p.upload({ key: 'business/b/products/p/general/u.png', body: PNG, contentType: 'image/png' })
  assert.ok(sent[0] instanceof PutObjectCommand); assert.equal((sent[0] as PutObjectCommand).input.Bucket, 'bkt'); assert.equal((sent[0] as PutObjectCommand).input.Key, 'business/b/products/p/general/u.png'); assert.equal((sent[0] as PutObjectCommand).input.ContentType, 'image/png')
  assert.equal(await p.exists('business/b/x.png'), true); assert.ok(sent[1] instanceof HeadObjectCommand)
  await p.delete('business/b/x.png'); assert.ok(sent[2] instanceof DeleteObjectCommand)
  mode = 'notfound'; assert.equal(await p.exists('business/b/x.png'), false)
  mode = 'denied'
  await assert.rejects(p.upload({ key: 'business/b/x.png', body: PNG, contentType: 'image/png' }), (e: Error) => e instanceof StorageError && !/secret-endpoint/.test(e.message))
  await assert.rejects(p.delete('../escape.png'), StorageError)
  await assert.rejects(p.upload({ key: '/abs.png', body: PNG, contentType: 'image/png' }), StorageError)
})
test('storage config validation fails fast naming missing variables only', () => {
  const base = { uploadDir: 'uploads', r2: { accountId: undefined, accessKeyId: 'AKIA-SECRET', secretAccessKey: undefined, bucket: undefined, publicBaseUrl: undefined, endpoint: undefined } }
  assert.throws(() => createStorageProvider({ ...base, uploadProvider: 'r2' }), (e: Error) => /R2_ACCOUNT_ID/.test(e.message) && /R2_SECRET_ACCESS_KEY/.test(e.message) && /R2_BUCKET_NAME/.test(e.message) && /R2_PUBLIC_BASE_URL/.test(e.message) && !/AKIA-SECRET/.test(e.message))
  assert.throws(() => createStorageProvider({ ...base, uploadProvider: 's3' }), /Unsupported UPLOAD_PROVIDER/)
  assert.equal(createStorageProvider({ ...base, uploadProvider: 'r2', r2: { accountId: 'acc', accessKeyId: 'a', secretAccessKey: 'b', bucket: 'bkt', publicBaseUrl: 'https://cdn.example.com', endpoint: undefined } }).name, 'r2')
  assert.equal(createStorageProvider({ ...base, uploadProvider: 'local' }).name, 'local')
})
test('local provider writes under its root, deletes, and rejects traversal', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vw-local-'))
  try {
    const p = new LocalStorageProvider(dir)
    await p.upload({ key: 'business/b/x.png', body: PNG, contentType: 'image/png' })
    assert.deepEqual(await readFile(path.join(dir, 'business', 'b', 'x.png')), PNG); assert.equal(await p.exists('business/b/x.png'), true)
    await p.delete('business/b/x.png'); assert.equal(await p.exists('business/b/x.png'), false); await p.delete('business/b/x.png')
    for (const key of ['../x.png', 'a/../../x.png', '/etc/passwd', 'a//b.png']) await assert.rejects(p.upload({ key, body: PNG, contentType: 'image/png' }), StorageError)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

// ---- local -> R2 migration tool (fake target, temp dir) ----
test('storage migration tool (--rewrite-keys): dry-run, migrate, idempotent re-run, failures and --delete-local', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vw-mig-'))
  const target = new FakeStorage(); const biz = await businessIdOf()
  await prisma.productMedia.deleteMany()
  try {
    await mkdir(path.join(dir, biz), { recursive: true })
    await writeFile(path.join(dir, biz, 'legacy-a.png'), PNG); await writeFile(path.join(dir, biz, 'legacy-b.png'), PNG)
    const mk = (objectKey: string) => prisma.productMedia.create({ data: { productId: k104, objectKey, url: `/api/v1/media/${objectKey}`, mimeType: 'image/png' } })
    const a = await mk(`${biz}/legacy-a.png`), b = await mk(`${biz}/legacy-b.png`), missing = await mk(`${biz}/missing.png`)
    const dry = await migrateStorage({ prisma, target, sourceDir: dir, dryRun: true, rewriteKeys: true })
    assert.equal(dry.failed, 1); assert.equal(target.uploads.length, 0)
    assert.equal((await prisma.productMedia.findUniqueOrThrow({ where: { id: a.id } })).objectKey, `${biz}/legacy-a.png`)
    const run = await migrateStorage({ prisma, target, sourceDir: dir, deleteLocal: true, rewriteKeys: true })
    assert.equal(run.failed, 1); assert.match(run.failures[0], /missing|not found/i)
    const a2 = await prisma.productMedia.findUniqueOrThrow({ where: { id: a.id } })
    assert.match(a2.objectKey, new RegExp(`^business/${biz}/products/${k104}/general/[0-9a-f-]{36}\\.png$`)); assert.equal(a2.url, `/api/v1/media/${a2.objectKey}`); assert.equal(a2.sizeBytes, PNG.length)
    assert.equal(target.objects.has(a2.objectKey), true)
    await assert.rejects(readFile(path.join(dir, biz, 'legacy-a.png')))
    assert.equal((await prisma.productMedia.findUniqueOrThrow({ where: { id: missing.id } })).objectKey, `${biz}/missing.png`)
    const uploadsAfterFirst = target.uploads.length
    const again = await migrateStorage({ prisma, target, sourceDir: dir, rewriteKeys: true })
    assert.equal(target.uploads.length, uploadsAfterFirst); assert.equal(again.failed, 1)
    assert.equal((await prisma.productMedia.findUniqueOrThrow({ where: { id: b.id } })).objectKey.startsWith('business/'), true)
    target.failUpload = true
    await prisma.productMedia.deleteMany({ where: { id: { in: [a.id, b.id, missing.id] } } })
    await writeFile(path.join(dir, biz, 'legacy-c.png'), PNG); const c = await mk(`${biz}/legacy-c.png`)
    const failing = await migrateStorage({ prisma, target, sourceDir: dir, rewriteKeys: true })
    assert.equal(failing.failed, 1); assert.equal((await prisma.productMedia.findUniqueOrThrow({ where: { id: c.id } })).objectKey, `${biz}/legacy-c.png`)
  } finally { await rm(dir, { recursive: true, force: true }); await prisma.productMedia.deleteMany({ where: { productId: k104 } }) }
})

test('storage migration tool (default mirror mode): same keys, no DB writes, local kept, idempotent, URL verification', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vw-mirror-'))
  const target = new FakeStorage(); const biz = await businessIdOf()
  await prisma.productMedia.deleteMany({ where: { productId: k104 } })
  try {
    await mkdir(path.join(dir, biz), { recursive: true })
    await writeFile(path.join(dir, biz, 'm-a.png'), PNG)
    const mk = (objectKey: string) => prisma.productMedia.create({ data: { productId: k104, objectKey, url: `/api/v1/media/${objectKey}`, mimeType: 'image/png' } })
    const a = await mk(`${biz}/m-a.png`)
    const before = JSON.stringify(await prisma.productMedia.findUniqueOrThrow({ where: { id: a.id } }))
    const dry = await migrateStorage({ prisma, target, sourceDir: dir, dryRun: true })
    assert.equal(dry.failed, 0); assert.equal(target.uploads.length, 0)
    const run = await migrateStorage({ prisma, target, sourceDir: dir })
    assert.equal(run.migrated, 1); assert.equal(run.failed, 0)
    assert.equal(target.objects.has(`${biz}/m-a.png`), true)
    assert.equal(JSON.stringify(await prisma.productMedia.findUniqueOrThrow({ where: { id: a.id } })), before)
    assert.deepEqual(await readFile(path.join(dir, biz, 'm-a.png')), PNG)
    const uploads = target.uploads.length
    const again = await migrateStorage({ prisma, target, sourceDir: dir })
    assert.equal(target.uploads.length, uploads); assert.equal(again.skipped, 1)
    await rm(path.join(dir, biz, 'm-a.png'))
    const noLocal = await migrateStorage({ prisma, target, sourceDir: dir })
    assert.equal(noLocal.failed, 0); assert.equal(noLocal.skipped, 1)
    await writeFile(path.join(dir, biz, 'm-a.png'), PNG)
    const ok = await migrateStorage({ prisma, target, sourceDir: dir, verifyUrls: true, fetchFn: async (url) => { assert.equal(url, target.getPublicUrl(`${biz}/m-a.png`)); return { status: 200, headers: { get: () => String(PNG.length) } } } })
    assert.equal(ok.verified, 1); assert.equal(ok.failed, 0)
    const bad = await migrateStorage({ prisma, target, sourceDir: dir, verifyUrls: true, fetchFn: async () => ({ status: 404, headers: { get: () => null } }) })
    assert.equal(bad.failed, 1); assert.match(bad.failures[0], /public URL check failed/)
    const mismatch = await migrateStorage({ prisma, target, sourceDir: dir, verifyUrls: true, fetchFn: async () => ({ status: 200, headers: { get: () => '1' } }) })
    assert.equal(mismatch.failed, 1); assert.match(mismatch.failures[0], /size mismatch/)
  } finally { await rm(dir, { recursive: true, force: true }); await prisma.productMedia.deleteMany({ where: { productId: k104 } }) }
})

// ---- Regression: a catalogue created through the normal admin flow on a FRESH tenant is reachable via its generated public link.
// Root cause of the original bug: the admin UI invented its own link slug while the API generates the real public `token`
// (the only identifier GET /public/catalogues/:token understands). Every other catalogue test seeds hand-picked tokens directly
// in the database, so none of them exercised "create via API -> use the returned token". This one does, with no seed data.
const adminJson = (path: string, method: string, body?: unknown) =>
  request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, true)
const tinyPng = () => {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0x80)])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat([row, row, row, row]))), chunk('IEND', Buffer.alloc(0))])
}

test('fresh tenant: catalogue created via the admin API opens through its generated public link (create -> token -> public 200)', async () => {
  // 1. fresh business + owner exactly like the production admin tool: no demo data, Argon2id password
  const business = await prisma.business.create({ data: { name: 'Fresh Wholesale', slug: 'fresh-wholesale' } })
  const passwordHash = await argon2.hash('FreshOwner#2026', { type: argon2.argon2id })
  await prisma.user.create({ data: { businessId: business.id, name: 'Fresh Owner', email: 'fresh-owner@vastraa.test', passwordHash, role: Role.OWNER } })

  const prior = cookie
  try {
    assert.equal((await login('fresh-owner@vastraa.test', 'FreshOwner#2026')).status, 200)

    // 2-3. attributes, category
    const fabric = (await (await adminJson('/api/v1/attributes', 'POST', { name: 'Fabric', kind: 'SELECT', supportsImages: true, values: [{ value: 'Rayon' }, { value: 'Cotton' }] })).json()).data
    const size = (await (await adminJson('/api/v1/attributes', 'POST', { name: 'Size', kind: 'SIZE', values: [{ value: 'S' }, { value: 'M' }] })).json()).data
    const rayon = fabric.values.find((v: { value: string }) => v.value === 'Rayon').id
    const sizeS = size.values.find((v: { value: string }) => v.value === 'S').id
    const category = (await (await adminJson('/api/v1/categories', 'POST', { name: 'Fresh Kurtis', slug: 'fresh-kurtis', attributeIds: [fabric.id, size.id] })).json()).data
    // 4. uploaded general product image (goes through the storage provider)
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(tinyPng())], { type: 'image/png' }), 'p.png')
    const upload = await request('/api/v1/media', { method: 'POST', body: form }, true)
    assert.equal(upload.status, 201); const media = (await upload.json()).data
    // 5. product with a variant
    const productRes = await adminJson('/api/v1/products', 'POST', {
      categoryId: category.id, code: 'FR-1', name: 'Fresh Rayon Kurti', basePrice: 100, moq: 6, attributeIds: [fabric.id, size.id], allowedAttributeValueIds: [rayon, sizeS],
      media: [{ objectKey: media.objectKey, mimeType: 'image/png', sizeBytes: media.sizeBytes, primary: true, sortOrder: 0 }],
      variants: [{ sku: 'FR-1-R-S', price: 100, stock: 10, attributeValueIds: [rayon, sizeS] }],
    })
    assert.equal(productRes.status, 201); const product = (await productRes.json()).data
    // 6. customer
    const customerRes = await adminJson('/api/v1/customers', 'POST', { businessName: 'Fresh Buyer Traders', contactPerson: 'Asha', phone: '+919800000001', type: 'WHOLESALER' })
    assert.equal(customerRes.status, 201); const customer = (await customerRes.json()).data
    // 7. catalogue exactly as the admin UI posts it (no token/slug supplied by the client)
    const created = await adminJson('/api/v1/catalogues', 'POST', {
      customerId: customer.id, title: 'Fresh Buyer – October', message: 'Hello', status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      showPrice: true, priceAdjustmentPct: 10, items: [{ productId: product.id }],
    })
    assert.equal(created.status, 201); const catalogue = (await created.json()).data
    // 8. the generated identifier: server-made, long and random, and the same one the admin list returns (the admin UI builds /catalogue/<token> from it)
    assert.equal(typeof catalogue.token, 'string'); assert.ok(catalogue.token.length >= 32, 'token must be long and random')
    const listed = (await (await adminJson('/api/v1/catalogues?limit=100', 'GET')).json()).data.find((c: { id: string }) => c.id === catalogue.id)
    assert.equal(listed.token, catalogue.token)

    // 9. open the generated link UNAUTHENTICATED
    const publicRes = await request(`/api/v1/public/catalogues/${encodeURIComponent(catalogue.token)}`)
    assert.equal(publicRes.status, 200)
    const body = (await publicRes.json()).data
    // 10. correct catalogue + products
    assert.equal(body.token, catalogue.token); assert.equal(body.title, 'Fresh Buyer – October'); assert.equal(body.products.length, 1); assert.equal(body.products[0].code, 'FR-1')
    // 11. pricing: +10% catalogue adjustment on a 100 variant
    assert.ok(Math.abs(body.products[0].variants[0].price - 110) < 0.005, `expected ~110, got ${body.products[0].variants[0].price}`) // server does not round (110.00000000000001); tolerance keeps this test about the link, not float formatting
    // 12. media serialized through the storage provider URL, with no storage internals leaked
    assert.equal(body.products[0].media[0].url, fake.getPublicUrl(media.objectKey)); assert.equal('objectKey' in body.products[0].media[0], false)
    assert.deepEqual(body.products[0].attributes.map((a: { name: string }) => a.name), ['Fabric', 'Size'])

    // the identifier the old UI generated (customer first word + 5 random chars) is NOT a valid public identifier -> precise 404 code
    for (const clientStyleSlug of ['fresh-a0brd', 'fresh-buyer-traders', catalogue.id]) {
      const bad = await request(`/api/v1/public/catalogues/${clientStyleSlug}`)
      assert.equal(bad.status, 404); assert.equal((await bad.json()).error.code, 'CATALOGUE_UNAVAILABLE')
    }

    // customer-specific price on a catalogue item overrides the percentage adjustment
    const custom = (await (await adminJson('/api/v1/catalogues', 'POST', { customerId: customer.id, title: 'Fresh custom price', status: 'ACTIVE', showPrice: true, items: [{ productId: product.id, customPrice: 90 }] })).json()).data
    assert.equal((await (await request(`/api/v1/public/catalogues/${custom.token}`)).json()).data.products[0].variants[0].price, 90)

    // 13. disabled -> unavailable
    assert.equal((await adminJson(`/api/v1/catalogues/${custom.id}/disable`, 'POST')).status, 204)
    const disabled = await request(`/api/v1/public/catalogues/${custom.token}`)
    assert.equal(disabled.status, 404); assert.equal((await disabled.json()).error.code, 'CATALOGUE_UNAVAILABLE')
    // 14. expired -> unavailable (and it works again once the expiry is moved forward)
    assert.equal((await adminJson(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { expiresAt: new Date(Date.now() - 60_000).toISOString() })).status, 204)
    assert.equal((await request(`/api/v1/public/catalogues/${catalogue.token}`)).status, 404)
    assert.equal((await adminJson(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { expiresAt: new Date(Date.now() + 86_400_000).toISOString() })).status, 204)
    assert.equal((await request(`/api/v1/public/catalogues/${catalogue.token}`)).status, 200)

    // 15. another tenant cannot see or modify it
    assert.equal((await login('other@vastraa.test')).status, 200)
    const theirs = (await (await adminJson('/api/v1/catalogues?limit=100', 'GET')).json()).data
    assert.equal(theirs.some((c: { id: string }) => c.id === catalogue.id), false)
    assert.equal((await adminJson(`/api/v1/catalogues/${catalogue.id}`, 'PATCH', { title: 'hijack' })).status, 404)
    assert.equal((await adminJson(`/api/v1/catalogues/${catalogue.id}/disable`, 'POST')).status, 404)
    assert.equal((await adminJson(`/api/v1/catalogues/${catalogue.id}`, 'DELETE')).status, 404)
    // ...and cannot build a catalogue around this tenant's product or customer
    const steal = await adminJson('/api/v1/catalogues', 'POST', { title: 'steal', status: 'ACTIVE', customerId: customer.id, items: [{ productId: product.id }] })
    assert.ok(steal.status >= 400 && steal.status < 500, `cross-tenant catalogue creation must be rejected, got ${steal.status}`)
    assert.equal((await request(`/api/v1/public/catalogues/${catalogue.token}`)).status, 200)
    assert.equal((await prisma.catalogue.findUnique({ where: { id: catalogue.id } }))!.title, 'Fresh Buyer – October')
  } finally { cookie = prior }
})
