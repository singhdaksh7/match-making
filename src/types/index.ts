// ==========================================================================
// Vastraa Wholesale — core data models
// Designed so a future Node/Express/Prisma/PostgreSQL backend can replace
// the localStorage mock layer without changing consumers of these types.
// ==========================================================================

export interface User {
  id: string
  name: string
  email: string
  role: 'owner' | 'staff'
  avatarUrl?: string
}

export interface Business {
  id: string
  name: string
  tagline: string
  type: string
  phone: string
  whatsapp: string
  email: string
  address: string
  city: string
  state: string
}

export interface Category {
  id: string
  name: string
  slug: string
  imageUrl: string
  attributeIds: string[]
  status: 'active' | 'inactive'
  createdAt: string
}

export type AttributeType = 'color' | 'text' | 'size'

export interface AttributeValue {
  id: string
  value: string
  hex?: string // only for color attributes
}

export interface Attribute {
  id: string
  name: string
  type: AttributeType
  values: AttributeValue[]
  /** When true, admins may attach photos to individual values of this attribute (e.g. Fabric -> Rayon). */
  supportsImages?: boolean
}

/** A photo attached to one attribute value of one product. */
export interface AttributeValueImage {
  id: string
  url: string
  altText?: string
  sortOrder: number
}

/** Public catalogue: the photos for one value of an image-capable attribute on a product. */
export interface ProductAttributeImageGroup {
  /** lower-cased attribute name, matching ProductVariant.attributes keys (e.g. "fabric") */
  attributeKey: string
  attributeName: string
  valueId: string
  value: string
  images: AttributeValueImage[]
}

export interface ProductMedia {
  id: string
  url: string
  isPrimary: boolean
  /** Only on images uploaded in the current form session (not yet attached to a saved product). */
  objectKey?: string
  mimeType?: string
}

/** Dynamic key-value bag, e.g. { fabric: "Rayon", color: "Maroon", size: "XL" } */
export type VariantAttributes = Record<string, string>

export interface ProductVariant {
  id: string
  productId: string
  sku: string
  attributes: VariantAttributes
  price: number
  comparePrice?: number
  stock: number
  reserved: number
  status: 'active' | 'inactive'
  lowStockThreshold: number
}

export type ProductStatus = 'active' | 'draft' | 'archived'

export interface Product {
  id: string
  code: string
  name: string
  categoryId: string
  description: string
  media: ProductMedia[]
  attributeIds: string[]
  /** Product-specific allowed AttributeValue ids. Not the global catalogue. */
  allowedAttributeValueIds: string[]
  wholesalePrice: number
  comparePrice?: number
  moq: number
  /** Public catalogue only: attribute-value-specific photos. */
  attributeImages?: ProductAttributeImageGroup[]
  /** Public catalogue only: lower-cased names of this product's attributes that support images. */
  imageAttributeKeys?: string[]
  status: ProductStatus
  views: number
  createdAt: string
  updatedAt: string
}

export type InventoryReason =
  | 'New Production'
  | 'Customer Order'
  | 'Damage'
  | 'Correction'
  | 'Return'

export interface InventoryEntry {
  id: string
  variantId: string
  productId: string
  type: 'add' | 'remove' | 'set'
  quantity: number
  previousStock: number
  newStock: number
  reason: InventoryReason
  note?: string
  createdAt: string
  createdBy: string
}

export type CustomerType = 'Wholesaler' | 'Retailer' | 'Distributor' | 'Reseller'

export interface Customer {
  id: string
  businessName: string
  contactPerson: string
  phone: string
  whatsapp: string
  email: string
  city: string
  state: string
  type: CustomerType
  gstNumber?: string
  notes?: string
  status: 'active' | 'inactive'
  createdAt: string
  lastActivityAt?: string
}

export interface CustomerActivity {
  id: string
  customerId: string
  type: 'viewed_catalogue' | 'viewed_product' | 'selected_products' | 'submitted_enquiry' | 'catalogue_sent'
  title: string
  detail?: string
  createdAt: string
  link?: string
}

export interface Collection {
  id: string
  name: string
  description: string
  coverImage: string
  productIds: string[]
  status: 'active' | 'draft' | 'archived'
  createdAt: string
}

export interface CatalogueItemVariantSelection {
  /** attribute key -> allowed values for this catalogue; empty/absent = all values allowed */
  [attributeKey: string]: string[]
}

export interface CatalogueItem {
  /** Server id of the catalogue entry (needed to remove it). */
  id?: string
  productId: string
  variantFilter: CatalogueItemVariantSelection
  allVariants: boolean
}

export interface CatalogueSettings {
  showWholesalePrice: boolean
  showExactStock: boolean
  showAvailability: boolean
  showMOQ: boolean
  allowProductSelection: boolean
  allowEnquiry: boolean
  allowImageDownload: boolean
  priceAdjustmentType: 'none' | 'percentage' | 'custom'
  priceAdjustmentValue: number // e.g. -10 for -10%
  pinProtected: boolean
  pin?: string
  expiry: '1d' | '7d' | '30d' | 'never'
}

export type CatalogueStatus = 'active' | 'expired' | 'draft' | 'disabled'

export interface Catalogue {
  id: string
  slug: string
  name: string
  message?: string
  customerId: string
  items: CatalogueItem[]
  settings: CatalogueSettings
  status: CatalogueStatus
  views: number
  uniqueVisitors: number
  createdAt: string
  expiresAt: string | null
}

export interface CatalogueVisit {
  id: string
  catalogueId: string
  visitedAt: string
  productIdsViewed: string[]
}

export interface CustomerSelectionItem {
  productId: string
  variantId: string
  quantity: number
}

export type EnquiryStatus = 'New' | 'Contacted' | 'Negotiating' | 'Converted' | 'Closed'

export interface EnquiryItem {
  productId: string
  variantId: string
  quantity: number
  priceAtEnquiry: number
}

export interface Enquiry {
  id: string
  refNumber: string
  catalogueId: string
  customerId: string
  businessName: string
  contactName: string
  phone: string
  whatsapp: string
  message?: string
  items: EnquiryItem[]
  estimatedValue: number
  status: EnquiryStatus
  createdAt: string
  timeline: { status: EnquiryStatus; at: string; note?: string }[]
}

export type NotificationType = 'enquiry' | 'low_stock' | 'catalogue_view' | 'catalogue_milestone'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  link?: string
}

export interface AppSettings {
  business: Business
  catalogueDefaults: {
    showPrice: boolean
    showStock: boolean
    defaultExpiry: CatalogueSettings['expiry']
    defaultMOQ: number
  }
  lowStockThreshold: number
}
