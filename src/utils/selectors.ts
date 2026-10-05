import type { AppData } from '@/services/seed'
import type { Catalogue, Product, ProductVariant } from '@/types'

export function variantsForProduct(data: AppData, productId: string): ProductVariant[] {
  return data.variants.filter((v) => v.productId === productId)
}

export function activeVariantsForProduct(data: AppData, productId: string): ProductVariant[] {
  return variantsForProduct(data, productId).filter((v) => v.status === 'active')
}

/** Lowest/highest price over a set of variants; undefined when there are none. */
export function variantPriceRange(variants: { price: number }[]): { min: number; max: number } | undefined {
  if (variants.length === 0) return undefined
  const prices = variants.map((v) => v.price)
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** "Red / M": the variant's attribute values in a stable (alphabetical by attribute) order; the SKU when it has none. */
export function variantLabel(variant: Pick<ProductVariant, 'attributes' | 'sku'>): string {
  const parts = Object.keys(variant.attributes).sort().map((key) => variant.attributes[key]).filter(Boolean)
  return parts.length ? parts.join(' / ') : variant.sku
}

export function categoryName(data: AppData, categoryId: string): string {
  return data.categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorised'
}

export function customerName(data: AppData, customerId: string): string {
  return data.customers.find((c) => c.id === customerId)?.businessName ?? 'Unknown customer'
}

/**
 * Price preview for the builder: the variant's base price with the catalogue percentage, rounded to paise in integer
 * arithmetic (the server is authoritative and uses exact decimals; both give 600 + 10% = 660).
 * A per-variant custom price replaces the adjusted price.
 */
export function effectiveVariantPrice(basePrice: number, adjustmentPct = 0, customPrice?: number | null): number {
  if (customPrice !== undefined && customPrice !== null) return customPrice
  const cents = Math.round(basePrice * 100)
  const basisPoints = Math.round(adjustmentPct * 100)
  return Math.round((cents * (10000 + basisPoints)) / 10000) / 100
}

/** The variants this catalogue exposes for a product: active ones that are part of the persisted selection. */
export function catalogueProductVariants(data: AppData, catalogue: Catalogue, product: Product): ProductVariant[] {
  const item = catalogue.items.find((i) => i.productId === product.id)
  if (!item) return []
  const shared = new Set(item.variants.map((v) => v.variantId))
  return variantsForProduct(data, product.id).filter((v) => v.status === 'active' && shared.has(v.id))
}

export function catalogueProducts(data: AppData, catalogue: Catalogue): Product[] {
  return catalogue.items
    .map((i) => data.products.find((p) => p.id === i.productId))
    .filter((p): p is Product => !!p)
}

export function isCatalogueExpired(catalogue: Catalogue): boolean {
  if (!catalogue.expiresAt) return false
  return new Date(catalogue.expiresAt).getTime() < Date.now()
}

export function effectiveCatalogueStatus(catalogue: Catalogue): Catalogue['status'] {
  if (catalogue.status === 'disabled' || catalogue.status === 'draft') return catalogue.status
  if (isCatalogueExpired(catalogue)) return 'expired'
  return 'active'
}

export function primaryImage(product: Product): string {
  return product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url ?? ''
}

export function waCatalogueLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
}
