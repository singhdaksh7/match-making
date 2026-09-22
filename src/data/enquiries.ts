import type { Enquiry, EnquiryStatus } from '@/types'
import { CATALOGUES } from './catalogues'
import { CUSTOMERS } from './customers'
import { PRODUCTS, VARIANTS, productById } from './products'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

interface SeedEnq {
  catalogueIdx: number
  customerIdx: number
  status: EnquiryStatus
  daysAgo: number
  itemCount: number
  offset: number
  message?: string
}

interface EnquirySeedItem {
  product: NonNullable<ReturnType<typeof productById>>
  variant: (typeof VARIANTS)[number]
}

const SEED: SeedEnq[] = [
  { catalogueIdx: 0, customerIdx: 0, status: 'New', daysAgo: 0, itemCount: 5, offset: 0, message: 'Please share best price for bulk order of 200+ pieces.' },
  { catalogueIdx: 0, customerIdx: 0, status: 'Contacted', daysAgo: 2, itemCount: 3, offset: 4 },
  { catalogueIdx: 1, customerIdx: 1, status: 'New', daysAgo: 1, itemCount: 4, offset: 2, message: 'Interested in the embroidered range, need sample first.' },
  { catalogueIdx: 4, customerIdx: 4, status: 'Negotiating', daysAgo: 6, itemCount: 6, offset: 0 },
  { catalogueIdx: 6, customerIdx: 6, status: 'Converted', daysAgo: 10, itemCount: 8, offset: 1, message: 'Confirming order, please send invoice.' },
  { catalogueIdx: 2, customerIdx: 2, status: 'Closed', daysAgo: 14, itemCount: 2, offset: 0 },
  { catalogueIdx: 3, customerIdx: 3, status: 'New', daysAgo: 1, itemCount: 3, offset: 1 },
  { catalogueIdx: 7, customerIdx: 7, status: 'Contacted', daysAgo: 8, itemCount: 5, offset: 2 },
  { catalogueIdx: 1, customerIdx: 1, status: 'Converted', daysAgo: 20, itemCount: 7, offset: 0, message: 'Great quality, will order again next month.' },
  { catalogueIdx: 4, customerIdx: 4, status: 'New', daysAgo: 0, itemCount: 2, offset: 3 },
]

export const ENQUIRIES: Enquiry[] = SEED.map((s, i) => {
  const catalogue = CATALOGUES[s.catalogueIdx]
  const customer = CUSTOMERS[s.customerIdx]
  const catalogueVariants: EnquirySeedItem[] = catalogue.items
    .slice(s.offset, s.offset + s.itemCount)
    .flatMap((item) => {
      const product = productById(item.productId)
      if (!product) {
        console.warn(`Skipping invalid demo enquiry product reference: ${item.productId}`)
        return []
      }
      const variant = VARIANTS.find((v) => v.productId === product.id)
      if (!variant) {
        console.warn(`Skipping demo enquiry item with no variants: ${product.code}`)
        return []
      }
      return [{ product, variant }]
    })

  let items = catalogueVariants.map((x, idx) => ({
    productId: x.product.id,
    variantId: x.variant.id,
    quantity: [12, 24, 36, 50][idx % 4],
    priceAtEnquiry: x.variant.price,
  }))

  // Keep the hero enquiry ready for the live demonstration: both K-101 variants
  // are distinct selection lines and use the quantities shown in the demo guide.
  if (i === 0) {
    const k101 = PRODUCTS.find((product) => product.code === 'K-101')
    const blackXl = k101 && VARIANTS.find((v) => v.productId === k101.id && v.attributes.fabric === 'Rayon' && v.attributes.color === 'Black' && v.attributes.size === 'XL')
    const maroonL = k101 && VARIANTS.find((v) => v.productId === k101.id && v.attributes.fabric === 'Rayon' && v.attributes.color === 'Maroon' && v.attributes.size === 'L')
    const otherItems = catalogueVariants.slice(1).map((x, idx) => ({ productId: x.product.id, variantId: x.variant.id, quantity: [18, 24, 30, 36][idx], priceAtEnquiry: x.variant.price }))

    if (!k101 || !blackXl || !maroonL) {
      console.warn('ENQ-2026-0018 is missing its required K-101 demo product or variants; retaining only validated catalogue items.')
      items = otherItems
    } else {
      items = [
        { productId: k101.id, variantId: blackXl.id, quantity: 24, priceAtEnquiry: blackXl.price },
        { productId: k101.id, variantId: maroonL.id, quantity: 12, priceAtEnquiry: maroonL.price },
        ...otherItems,
      ]
    }
  }

  const estimatedValue = items.reduce((sum, it) => sum + it.quantity * it.priceAtEnquiry, 0)
  const createdAt = daysAgoIso(s.daysAgo)

  const timeline: Enquiry['timeline'] = [{ status: 'New', at: createdAt }]
  const order: EnquiryStatus[] = ['New', 'Contacted', 'Negotiating', 'Converted', 'Closed']
  const finalIdx = order.indexOf(s.status)
  for (let step = 1; step <= finalIdx; step++) {
    timeline.push({ status: order[step], at: daysAgoIso(Math.max(0, s.daysAgo - step)) })
  }

  return {
    id: `enq-${i + 1}`,
    refNumber: i === 0 ? 'ENQ-2026-0018' : `ENQ-2026-${String(i + 1).padStart(4, '0')}`,
    catalogueId: catalogue.id,
    customerId: customer.id,
    businessName: customer.businessName,
    contactName: customer.contactPerson,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    message: s.message,
    items,
    estimatedValue,
    status: s.status,
    createdAt,
    timeline,
  }
})

export const enquiryById = (id: string) => ENQUIRIES.find((e) => e.id === id)
