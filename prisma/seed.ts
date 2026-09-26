import { PrismaClient, AttributeKind, CustomerType, RecordStatus, Role } from '@prisma/client'
import argon2 from 'argon2'

const db = new PrismaClient()

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

  const fabric = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Fabric' } }, update: {}, create: { businessId: business.id, name: 'Fabric', kind: AttributeKind.SELECT } })
  const color = await db.attribute.upsert({ where: { businessId_name: { businessId: business.id, name: 'Color' } }, update: {}, create: { businessId: business.id, name: 'Color', kind: AttributeKind.COLOR } })
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
    create: { businessId: business.id, categoryId: category.id, code: 'K-101', name: 'Floral Rayon Straight Kurti', description: 'Demo bestseller', basePrice: 425, moq: 12, status: RecordStatus.ACTIVE },
  })

  await db.productAttribute.deleteMany({ where: { productId: product.id } })
  await db.productAttribute.createMany({ data: kurtiAttributeIds.map((attributeId) => ({ productId: product.id, attributeId })) })

  const values = await db.attributeValue.findMany({ where: { attributeId: { in: kurtiAttributeIds } } })
  const value = (name: string) => values.find((item) => item.value === name)!
  const allowed = ['Rayon', 'Black', 'Maroon', 'L', 'XL'].map((name) => value(name).id)
  await db.productAttributeValue.deleteMany({ where: { productId: product.id } })
  await db.productAttributeValue.createMany({ data: allowed.map((attributeValueId) => ({ productId: product.id, attributeValueId })) })

  for (const [sku, colour, fit, stock] of [['K-101-BLK-XL', 'Black', 'XL', 40], ['K-101-MAR-L', 'Maroon', 'L', 36]] as const) {
    const variant = await db.productVariant.upsert({ where: { productId_sku: { productId: product.id, sku } }, update: { stock }, create: { productId: product.id, sku, price: 425, stock } })
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
