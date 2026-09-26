import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { rm } from 'node:fs/promises'
import argon2 from 'argon2'
import { AttributeKind, CustomerType, PrismaClient, RecordStatus, Role } from '@prisma/client'
import { app } from '../backend/src/app.js'

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

