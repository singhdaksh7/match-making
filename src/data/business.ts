import type { AppSettings, Business, User } from '@/types'
import { BRAND } from '@/config/brand'

export const BUSINESS: Business = {
  id: 'biz-1',
  name: BRAND.name,
  tagline: '',
  type: 'Wholesale',
  phone: '',
  whatsapp: BRAND.whatsapp,
  email: '',
  address: '',
  city: '',
  state: '',
}

export const OWNER: User = {
  id: 'user-1',
  name: '',
  email: '',
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
