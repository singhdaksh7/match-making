import { PrismaClient, AttributeKind, CustomerType, RecordStatus, Role } from '@prisma/client'
import argon2 from 'argon2'
import zlib from 'node:zlib'
import { createStorageProvider } from '../backend/src/storage/index.js'

const db = new PrismaClient()

// Tiny solid-colour PNG used as a demo placeholder photo (no external files needed).
function placeholderPng(rgb: [number, number, number], size = 16) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function ensureValues(attributeId: string, items: { value: string; hex?: string }[]) {
  for (const item of items) {
    await db.attributeValue.upsert({
      where: { attributeId_value: { attributeId, value: item.value } },
      update: item.hex ? { hex: item.hex } : {},
      create: { attributeId, value: item.value, hex: item.hex },
    })
  }
}

async function main() {
  const business = await db.business.upsert({ where: { slug: 'vastraa-wholesale' }, update: {}, create: { name: 'Vastraa Wholesale', slug: 'vastraa-wholesale' } })
  const passwordHash = await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', { type: argon2.argon2id })
  const admin = await db.user.upsert({ where: { businessId_email: { businessId: business.id, email: 'admin@vastraa.demo' } }, update: {}, create: { businessId: business.id, name: 'Amit Shah', email: 'admin@vastraa.demo', passwordHash, role: Role.OWNER } })

  const fabric = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Fabric' } }, update: { supportsImages: true }, create: { businessId: business.id, name: 'Fabric', kind: AttributeKind.SELECT, supportsImages: true } })
  const color = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Color' } }, update: { supportsImages: true }, create: { businessId: business.id, name: 'Color', kind: AttributeKind.COLOR, supportsImages: true } })
  const size = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Size' } }, update: {}, create: { businessId: business.id, name: 'Size', kind: AttributeKind.SIZE } })
  const pattern = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Pattern' } }, update: {}, create: { businessId: business.id, name: 'Pattern', kind: AttributeKind.TEXT } })
  const work = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Work' } }, update: {}, create: { businessId: business.id, name: 'Work', kind: AttributeKind.TEXT } })

  await ensureValues(fabric.id, [{ value: 'Rayon' }, { value: 'Cotton' }, { value: 'Silk' }, { value: 'Georgette' }])
  await ensureValues(color.id, [
    { value: 'Black', hex: '#000000' },
    { value: 'Maroon', hex: '#800000' },
    { value: 'Navy', hex: '#1e3a8a' },
    { value: 'Bottle Green', hex: '#0b3d2e' },
    { value: 'White', hex: '#ffffff' },
    { value: 'Red', hex: '#d32f2f' },
  ])
  await ensureValues(size.id, [{ value: 'S' }, { value: 'M' }, { value: 'L' }, { value: 'XL' }, { value: 'XXL' }])
  await ensureValues(pattern.id, [{ value: 'Floral' }, { value: 'Solid' }, { value: 'Printed' }])
  await ensureValues(work.id, [{ value: 'Plain' }, { value: 'Embroidery' }, { value: 'Zari' }])

  const category = await db.category.upsert({ where: { businessId_slug: { businessId: business.id, slug: 'kurtis' } }, update: { name: 'Kurti' }, create: { businessId: business.id, name: 'Kurti', slug: 'kurtis' } })
  const kurtiAttributeIds = [color.id, size.id, fabric.id, pattern.id, work.id]
  await db.categoryAttribute.deleteMany({ where: { categoryId: category.id } })
  await db.categoryAttribute.createMany({ data: kurtiAttributeIds.map((attributeId) => ({ categoryId: category.id, attributeId })) })

  const product = await db.product.upsert({
    where: { businessId_code: { businessId: business.id, code: 'K-101' } },
    update: { name: 'Floral Rayon Straight Kurti', categoryId: category.id, status: RecordStatus.ACTIVE },
    create: { businessId: business.id, categoryId: category.id, code: 'K-101', name: 'Floral Rayon Straight Kurti', description: 'Demo bestseller', moq: 12, status: RecordStatus.ACTIVE },
  })

  await db.productAttribute.deleteMany({ where: { productId: product.id } })
  await db.productAttribute.createMany({ data: kurtiAttributeIds.map((attributeId) => ({ productId: product.id, attributeId })) })

  const values = await db.attributeValue.findMany({ where: { attributeId: { in: kurtiAttributeIds } } })
  const value = (name: string) => values.find((item) => item.value === name)!
  const allowed = ['Rayon', 'Black', 'Maroon', 'L', 'XL'].map((name) => value(name).id)
  // skipDuplicates (not delete+create) so re-seeding never cascades away existing attribute-value images.
  await db.productAttributeValue.createMany({ data: allowed.map((attributeValueId) => ({ productId: product.id, attributeValueId })), skipDuplicates: true })

  // Demo attribute-value images for K-101 (Rayon / Black / Maroon), written through the configured storage provider.
  const storage = createStorageProvider()
  const demoImages: [string, [number, number, number]][] = [['Rayon', [96, 125, 139]], ['Black', [33, 33, 33]], ['Maroon', [128, 0, 0]]]
  for (const [name, rgb] of demoImages) {
    const attributeValueId = value(name).id
    if (await db.productAttributeValueImage.count({ where: { productId: product.id, attributeValueId } })) continue
    const key = `business/${business.id}/products/${product.id}/attributes/${attributeValueId}/seed-${name.toLowerCase()}.png`
    const body = placeholderPng(rgb)
    if (!(await storage.exists?.(key))) await storage.upload({ key, body, contentType: 'image/png' })
    await db.productAttributeValueImage.create({ data: { productId: product.id, attributeValueId, objectKey: key, mimeType: 'image/png', sizeBytes: body.length, altText: `${name} placeholder`, sortOrder: 0 } })
  }

  for (const [sku, colour, fit, price] of [['K-101-BLK-XL', 'Black', 'XL', 425], ['K-101-MAR-L', 'Maroon', 'L', 435]] as const) {
    const variant = await db.productVariant.upsert({ where: { productId_sku: { productId: product.id, sku } }, update: { price }, create: { productId: product.id, sku, price } })
    await db.variantAttributeValue.deleteMany({ where: { variantId: variant.id } })
    for (const label of ['Rayon', colour, fit]) {
      await db.variantAttributeValue.create({ data: { variantId: variant.id, attributeValueId: value(label).id } })
    }
  }

  const customer = await db.customer.upsert({ where: { id: 'seed-raj-fashion-house' }, update: {}, create: { id: 'seed-raj-fashion-house', businessId: business.id, businessName: 'Raj Fashion House', contactPerson: 'Rajesh Kumar', phone: '+919820011223', type: CustomerType.WHOLESALER } })
  const collection = await db.collection.upsert({ where: { businessId_name: { businessId: business.id, name: 'September New Arrivals' } }, update: {}, create: { businessId: business.id, name: 'September New Arrivals', description: 'Vastraa demo collection' } })
  await db.collectionProduct.upsert({ where: { collectionId_productId: { collectionId: collection.id, productId: product.id } }, update: {}, create: { collectionId: collection.id, productId: product.id } })
  await db.catalogue.upsert({ where: { token: 'vastraa-demo-catalogue' }, update: { status: RecordStatus.ACTIVE }, create: { businessId: business.id, customerId: customer.id, title: 'September New Arrivals', token: 'vastraa-demo-catalogue', status: RecordStatus.ACTIVE, items: { create: { productId: product.id } } } })
  console.log(`Seeded Vastraa demo for ${admin.email}`)
}

main().finally(() => db.$disconnect())
