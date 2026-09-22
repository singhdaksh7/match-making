import { ATTRIBUTES } from '@/data/attributes'
import { DEFAULT_APP_SETTINGS } from '@/data/business'
import { CATALOGUES } from '@/data/catalogues'
import { CATEGORIES } from '@/data/categories'
import { CUSTOMERS } from '@/data/customers'
import { ENQUIRIES } from '@/data/enquiries'
import { INVENTORY_ENTRIES } from '@/data/inventory'
import { NOTIFICATIONS } from '@/data/notifications'
import { PRODUCTS, VARIANTS } from '@/data/products'
import { COLLECTIONS } from '@/data/collections'
import { CUSTOMER_ACTIVITIES } from '@/data/customerActivities'
import type {
  Attribute, AppSettings, Catalogue, Category, Customer,
  Collection, CustomerActivity, Enquiry, InventoryEntry, Notification, Product, ProductVariant,
} from '@/types'

export interface AppData {
  products: Product[]
  variants: ProductVariant[]
  categories: Category[]
  attributes: Attribute[]
  customers: Customer[]
  collections: Collection[]
  customerActivities: CustomerActivity[]
  catalogues: Catalogue[]
  enquiries: Enquiry[]
  notifications: Notification[]
  inventoryEntries: InventoryEntry[]
  settings: AppSettings
}

export function buildSeedData(): AppData {
  return {
    products: structuredClone(PRODUCTS),
    variants: structuredClone(VARIANTS),
    categories: structuredClone(CATEGORIES),
    attributes: structuredClone(ATTRIBUTES),
    customers: structuredClone(CUSTOMERS),
    collections: structuredClone(COLLECTIONS),
    customerActivities: structuredClone(CUSTOMER_ACTIVITIES),
    catalogues: structuredClone(CATALOGUES),
    enquiries: structuredClone(ENQUIRIES),
    notifications: structuredClone(NOTIFICATIONS),
    inventoryEntries: structuredClone(INVENTORY_ENTRIES),
    settings: structuredClone(DEFAULT_APP_SETTINGS),
  }
}

export function isValidAppData(data: AppData): boolean {
  if (
    !Array.isArray(data.products) ||
    !Array.isArray(data.variants) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.attributes) ||
    !Array.isArray(data.customers) ||
    !Array.isArray(data.collections) ||
    !Array.isArray(data.customerActivities) ||
    !Array.isArray(data.catalogues) ||
    !Array.isArray(data.enquiries) ||
    !Array.isArray(data.notifications) ||
    !Array.isArray(data.inventoryEntries) ||
    !data.settings
  ) {
    return false
  }

  const productIds = new Set(data.products.map((p) => p.id))
  const variantIds = new Set(data.variants.map((v) => v.id))
  const catalogueIds = new Set(data.catalogues.map((c) => c.id))
  const customerIds = new Set(data.customers.map((c) => c.id))

  const variantsMatchProducts = data.variants.every((variant) => productIds.has(variant.productId))
  const cataloguesMatchProducts = data.catalogues.every((catalogue) =>
    customerIds.has(catalogue.customerId) && catalogue.items.every((item) => productIds.has(item.productId)),
  )
  const enquiriesMatchReferences = data.enquiries.every((enquiry) =>
    catalogueIds.has(enquiry.catalogueId) &&
    customerIds.has(enquiry.customerId) &&
    enquiry.items.every((item) => {
      const variant = data.variants.find((v) => v.id === item.variantId)
      return productIds.has(item.productId) && !!variant && variant.productId === item.productId
    }),
  )
  const inventoryMatchesVariants = data.inventoryEntries.every((entry) =>
    productIds.has(entry.productId) && variantIds.has(entry.variantId),
  )
  const collectionsMatchProducts = data.collections.every((collection) =>
    collection.productIds.every((productId) => productIds.has(productId)),
  )

  return variantsMatchProducts &&
    cataloguesMatchProducts &&
    enquiriesMatchReferences &&
    inventoryMatchesVariants &&
    collectionsMatchProducts
}
