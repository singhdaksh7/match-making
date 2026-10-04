import type { Attribute, Catalogue, Category, Collection, Customer, Enquiry, Product, ProductVariant, User } from '@/types'

const status = (value: string | undefined) => (value ?? 'ACTIVE').toLowerCase() as 'active' | 'inactive' | 'draft' | 'archived'
const date = (value: string | Date | undefined) => value ? new Date(value).toISOString() : new Date().toISOString()

export function backendUserToFrontendUser(value: any): User {
  return { id: value.id, name: value.name, email: value.email, role: value.role === 'OWNER' || value.role === 'ADMIN' ? 'owner' : 'staff' }
}
export function backendCategoryToFrontend(value: any): Category {
  return { id: value.id, name: value.name, slug: value.slug, imageUrl: value.imageUrl ?? '', attributeIds: value.categoryAttributes?.map((x: any) => x.attributeId) ?? value.attributeIds ?? [], status: value.status === 'INACTIVE' ? 'inactive' : 'active', createdAt: date(value.createdAt) }
}
export function backendAttributeToFrontend(value: any): Attribute {
  const kind = String(value.kind ?? value.type ?? 'text').toLowerCase()
  return { id: value.id, name: value.name, type: kind === 'select' || kind === 'text' ? 'text' : kind === 'size' ? 'size' : 'color', values: (value.values ?? []).map((x: any) => ({ id: x.id, value: x.value, hex: x.hex })), supportsImages: Boolean(value.supportsImages) }
}
function attributeKey(name: string) {
  const lower = name.toLowerCase()
  if (lower === 'waist size') return 'waist'
  return lower
}
export function backendVariantToFrontend(value: any, productId: string): ProductVariant {
  const links = value.attributeValues ?? []
  return { id: value.id, productId, sku: value.sku, attributes: Object.fromEntries(links.map((x: any) => [attributeKey(x.attributeValue?.attribute?.name ?? x.attribute?.name ?? ''), x.attributeValue?.value ?? x.value])), price: Number(value.price), stock: value.stock, reserved: value.reserved ?? 0, status: value.status === 'INACTIVE' ? 'inactive' : 'active', lowStockThreshold: 10 }
}
export function backendProductToFrontend(value: any): Product {
  return { id: value.id, code: value.code, name: value.name, categoryId: value.categoryId, description: value.description ?? '', media: (value.media ?? []).map((x: any) => ({ id: x.id, url: x.url, isPrimary: Boolean(x.primary ?? x.isPrimary) })), attributeIds: (value.attributes ?? []).map((x: any) => x.attributeId), allowedAttributeValueIds: (value.allowedValues ?? []).map((x: any) => x.attributeValueId), wholesalePrice: Number(value.basePrice ?? value.wholesalePrice ?? 0), moq: value.moq, status: status(value.status) as Product['status'], views: value.views ?? 0, createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) }
}
export function backendCustomerToFrontend(value: any): Customer {
  return { id: value.id, businessName: value.businessName, contactPerson: value.contactPerson, phone: value.phone, whatsapp: value.whatsapp ?? value.phone, email: value.email ?? '', city: value.city ?? '', state: value.state ?? '', type: `${value.type[0]}${value.type.slice(1).toLowerCase()}` as Customer['type'], gstNumber: value.gstNumber, notes: value.notes, status: value.status === 'INACTIVE' ? 'inactive' : 'active', createdAt: date(value.createdAt) }
}
export function backendCollectionToFrontend(value: any): Collection {
  return { id: value.id, name: value.name, description: value.description ?? '', coverImage: '', productIds: (value.products ?? []).map((x: any) => x.productId), status: status(value.status) as Collection['status'], createdAt: date(value.createdAt) }
}
export function backendCatalogueToFrontend(value: any): Catalogue {
  return { id: value.id, slug: value.token, name: value.title, message: value.message ?? undefined, customerId: value.customerId ?? '', items: (value.items ?? []).map((x: any) => ({ id: x.id, productId: x.productId, variantFilter: {}, allVariants: !x.variantId })), settings: { showWholesalePrice: value.showPrice, showExactStock: value.showExactStock, showAvailability: value.showAvailability, showMOQ: value.showMOQ, allowProductSelection: value.allowSelection, allowEnquiry: value.allowEnquiry, allowImageDownload: value.allowImageDownload, priceAdjustmentType: Number(value.priceAdjustmentPct) ? 'percentage' : 'none', priceAdjustmentValue: Number(value.priceAdjustmentPct), pinProtected: Boolean(value.pinHash), expiry: value.expiresAt ? '30d' : 'never' }, status: status(value.status) as Catalogue['status'], views: value.views ?? 0, uniqueVisitors: 0, createdAt: date(value.createdAt), expiresAt: value.expiresAt ? date(value.expiresAt) : null }
}
export function backendEnquiryToFrontend(value: any): Enquiry {
  const items = (value.items ?? []).map((x: any) => ({ productId: x.productId ?? '', variantId: x.variantId ?? '', quantity: x.quantity, priceAtEnquiry: Number(x.priceSnapshot) }))
  return { id: value.id, refNumber: value.reference, catalogueId: value.catalogueId ?? '', customerId: value.customerId ?? '', businessName: value.customer?.businessName ?? '', contactName: value.contactName, phone: value.phone, whatsapp: value.phone, message: value.message ?? undefined, items, estimatedValue: items.reduce((sum: number, item: any) => sum + item.quantity * item.priceAtEnquiry, 0), status: `${value.status[0]}${value.status.slice(1).toLowerCase()}` as Enquiry['status'], createdAt: date(value.createdAt), timeline: (value.history ?? []).map((x: any) => ({ status: `${x.status[0]}${x.status.slice(1).toLowerCase()}` as Enquiry['status'], at: date(x.createdAt), note: x.note })) }
}
