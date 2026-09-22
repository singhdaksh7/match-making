import type { Catalogue, CatalogueSettings } from '@/types'
import { CUSTOMERS } from './customers'
import { PRODUCTS } from './products'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}
function daysFromNowIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

const defaultSettings = (overrides: Partial<CatalogueSettings> = {}): CatalogueSettings => ({
  showWholesalePrice: true,
  showExactStock: false,
  showAvailability: true,
  showMOQ: true,
  allowProductSelection: true,
  allowEnquiry: true,
  allowImageDownload: false,
  priceAdjustmentType: 'none',
  priceAdjustmentValue: 0,
  pinProtected: false,
  expiry: '30d',
  ...overrides,
})

function pickItems(count: number, offset = 0) {
  return PRODUCTS.slice(offset, offset + count).map((p) => ({
    productId: p.id,
    variantFilter: {},
    allVariants: true,
  }))
}

interface SeedCat {
  slug: string
  name: string
  customerIdx: number
  message?: string
  itemCount: number
  offset: number
  daysAgo: number
  expiry: CatalogueSettings['expiry']
  status: Catalogue['status']
  views: number
  uniqueVisitors: number
  settings?: Partial<CatalogueSettings>
}

const SEED: SeedCat[] = [
  { slug: 'raj-september-x7k29', name: 'September New Arrivals – Raj Fashion House', customerIdx: 0, message: "Hi Rajesh, here's our festive-ready September collection curated for you.", itemCount: 14, offset: 0, daysAgo: 5, expiry: '30d', status: 'active', views: 96, uniqueVisitors: 4 },
  { slug: 'gupta-kurti-4m2p1', name: 'Kurti & Set Collection – Gupta Garments', customerIdx: 1, itemCount: 10, offset: 0, daysAgo: 9, expiry: '30d', status: 'active', views: 64, uniqueVisitors: 3 },
  { slug: 'balaji-denim-9q3rt', name: 'Denim Bulk Collection – Shree Balaji', customerIdx: 2, itemCount: 4, offset: 17, daysAgo: 12, expiry: '7d', status: 'expired', views: 41, uniqueVisitors: 2 },
  { slug: 'fashionpoint-tops-2z8kd', name: 'Casual Tops Range – Fashion Point', customerIdx: 3, itemCount: 8, offset: 26, daysAgo: 3, expiry: '30d', status: 'active', views: 29, uniqueVisitors: 2 },
  { slug: 'rk-shirts-5j7wq', name: 'Shirts & Co-ord Preview – RK Garments', customerIdx: 4, itemCount: 7, offset: 21, daysAgo: 20, expiry: '30d', status: 'active', views: 118, uniqueVisitors: 6 },
  { slug: 'mehta-newdesigns-8h4nx', name: 'New Designs Draft – Mehta Fashion', customerIdx: 5, itemCount: 12, offset: 0, daysAgo: 1, expiry: 'never', status: 'draft', views: 0, uniqueVisitors: 0 },
  { slug: 'delhi-festive-3c9lm', name: 'Festive Kurti Sets – Delhi Fashion Hub', customerIdx: 6, itemCount: 6, offset: 15, daysAgo: 15, expiry: '30d', status: 'active', views: 73, uniqueVisitors: 5 },
  { slug: 'aarav-summer-6v1bf', name: 'Summer Essentials – Aarav Clothing', customerIdx: 7, itemCount: 9, offset: 8, daysAgo: 40, expiry: '30d', status: 'disabled', views: 55, uniqueVisitors: 3 },
]

export const CATALOGUES: Catalogue[] = SEED.map((s, i) => {
  const customer = CUSTOMERS[s.customerIdx]
  return {
    id: `cat-log-${i + 1}`,
    slug: s.slug,
    name: s.name,
    message: s.message,
    customerId: customer.id,
    items: pickItems(s.itemCount, s.offset),
    settings: defaultSettings(s.settings),
    status: s.status,
    views: s.views,
    uniqueVisitors: s.uniqueVisitors,
    createdAt: daysAgoIso(s.daysAgo),
    expiresAt: s.expiry === 'never' ? null : daysFromNowIso(s.expiry === '1d' ? -s.daysAgo + 1 : s.expiry === '7d' ? 7 - s.daysAgo : 30 - s.daysAgo),
  }
})

export const catalogueBySlug = (slug: string) => CATALOGUES.find((c) => c.slug === slug)
export const catalogueById = (id: string) => CATALOGUES.find((c) => c.id === id)
