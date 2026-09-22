import type { AppData } from '@/services/seed'
import type { Catalogue, CatalogueItem, Product, ProductVariant } from '@/types'

export function variantsForProduct(data: AppData, productId: string): ProductVariant[] {
  return data.variants.filter((v) => v.productId === productId)
}

export function totalStockForProduct(data: AppData, productId: string): number {
  return variantsForProduct(data, productId).reduce((sum, v) => sum + v.stock, 0)
}

export function lowStockVariants(data: AppData) {
  return data.variants
    .filter((v) => v.status === 'active' && v.stock > 0 && v.stock <= (v.lowStockThreshold ?? data.settings.lowStockThreshold))
    .map((v) => ({ variant: v, product: data.products.find((p) => p.id === v.productId)! }))
    .filter((x) => !!x.product)
}

export function categoryName(data: AppData, categoryId: string): string {
  return data.categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorised'
}

export function customerName(data: AppData, customerId: string): string {
  return data.customers.find((c) => c.id === customerId)?.businessName ?? 'Unknown customer'
}

export function applyPriceAdjustment(price: number, catalogue: Catalogue): number {
  if (catalogue.settings.priceAdjustmentType === 'percentage') {
    return Math.round(price * (1 + catalogue.settings.priceAdjustmentValue / 100))
  }
  if (catalogue.settings.priceAdjustmentType === 'custom') return catalogue.settings.priceAdjustmentValue || price
  return price
}

export function variantMatchesFilter(variant: ProductVariant, item: CatalogueItem): boolean {
  if (item.allVariants) return true
  const filter = item.variantFilter
  for (const [key, allowed] of Object.entries(filter)) {
    if (!allowed || allowed.length === 0) continue
    if (!allowed.includes(variant.attributes[key])) return false
  }
  return true
}

export function catalogueProductVariants(data: AppData, catalogue: Catalogue, product: Product): ProductVariant[] {
  const item = catalogue.items.find((i) => i.productId === product.id)
  if (!item) return []
  return variantsForProduct(data, product.id).filter((v) => v.status === 'active' && variantMatchesFilter(v, item))
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
