import type { AppSettings, Business, User } from '@/types'

export const BUSINESS: Business = {
  id: 'biz-1',
  name: 'Vastraa Wholesale',
  tagline: 'Fashion. Variety. Delivered.',
  type: 'Manufacturer & Wholesale Clothing Supplier',
  phone: '+91 98200 11223',
  whatsapp: '+91 98200 11223',
  email: 'hello@vastraa.demo',
  address: '204, Textile Market, Ring Road',
  city: 'Surat',
  state: 'Gujarat',
}

export const OWNER: User = {
  id: 'user-1',
  name: 'Amit Shah',
  email: 'admin@vastraa.demo',
  role: 'owner',
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  business: BUSINESS,
  catalogueDefaults: {
    showPrice: true,
    showStock: false,
    defaultExpiry: '30d',
    defaultMOQ: 12,
  },
  lowStockThreshold: 10,
}
