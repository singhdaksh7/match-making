// Explicit demo-seed script. Never run automatically on container start —
// see BACKUP_RESTORE.md and DEPLOYMENT.md for when to run this.
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 12)

  const owner = await prisma.user.upsert({
    where: { email: 'admin@vastraa.demo' },
    update: {},
    create: { name: 'Amit Shah', email: 'admin@vastraa.demo', passwordHash, role: 'owner' },
  })

  await prisma.business.upsert({
    where: { id: 'business' },
    update: {},
    create: {
      id: 'business',
      name: 'Vastraa Wholesale',
      tagline: 'Wholesale fashion, simplified',
      type: 'Apparel Wholesaler',
      phone: '+91 98765 43210',
      whatsapp: '+91 98765 43210',
      email: 'contact@vastraa.demo',
      address: 'Textile Market, Ring Road',
      city: 'Surat',
      state: 'Gujarat',
    },
  })

  await prisma.appSettings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings', showPrice: true, showStock: true, defaultExpiry: '7d', defaultMOQ: 5, lowStockThreshold: 10 },
  })

  const colorAttr = await prisma.attribute.upsert({
    where: { id: 'attr-color' },
    update: {},
    create: {
      id: 'attr-color',
      name: 'Color',
      type: 'color',
      values: { create: [{ value: 'Maroon', hex: '#7f1d1d' }, { value: 'Navy', hex: '#1e3a8a' }, { value: 'Beige', hex: '#e7d9c4' }] },
    },
  })
  const sizeAttr = await prisma.attribute.upsert({
    where: { id: 'attr-size' },
    update: {},
    create: { id: 'attr-size', name: 'Size', type: 'size', values: { create: [{ value: 'S' }, { value: 'M' }, { value: 'L' }, { value: 'XL' }] } },
  })

  const category = await prisma.category.upsert({
    where: { id: 'cat-sarees' },
    update: {},
    create: {
      id: 'cat-sarees',
      name: 'Sarees',
      slug: 'sarees',
      status: 'active',
      attributes: { create: [{ attributeId: colorAttr.id }, { attributeId: sizeAttr.id }] },
    },
  })

  const product = await prisma.product.upsert({
    where: { code: 'SAR-001' },
    update: {},
    create: {
      code: 'SAR-001',
      name: 'Rayon Printed Saree',
      categoryId: category.id,
      description: 'Soft rayon saree with block print, ideal for daily wholesale orders.',
      wholesalePrice: 450,
      comparePrice: 650,
      moq: 5,
      status: 'active',
      media: { create: [{ url: '/media/placeholder-saree.jpg', isPrimary: true, sortOrder: 0 }] },
      variants: {
        create: [
          { sku: 'SAR-001-MAROON-M', attributes: { Color: 'Maroon', Size: 'M' }, price: 450, stock: 120, lowStockThreshold: 15 },
          { sku: 'SAR-001-NAVY-L', attributes: { Color: 'Navy', Size: 'L' }, price: 450, stock: 8, lowStockThreshold: 15 },
        ],
      },
    },
  })

  const customer = await prisma.customer.upsert({
    where: { id: 'cust-demo-1' },
    update: {},
    create: {
      id: 'cust-demo-1',
      businessName: 'Shree Textiles',
      contactPerson: 'Rakesh Patel',
      phone: '+91 90000 11111',
      whatsapp: '+91 90000 11111',
      city: 'Ahmedabad',
      state: 'Gujarat',
      type: 'Wholesaler',
      status: 'active',
    },
  })

  await prisma.catalogue.upsert({
    where: { id: 'cat-log-demo-1' },
    update: {},
    create: {
      id: 'cat-log-demo-1',
      slug: 'demo-catalogue',
      name: 'Demo Catalogue — Shree Textiles',
      customerId: customer.id,
      status: 'active',
      expiry: 'd30',
      items: { create: [{ productId: product.id, allVariants: true, variantFilter: {} }] },
    },
  })

  // eslint-disable-next-line no-console
  console.log(`Seed complete. Owner login: admin@vastraa.demo / ${process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'}`)
  void owner
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
