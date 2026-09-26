import type { Prisma } from '@prisma/client'

const EXPIRY_TO_ENUM: Record<string, string> = { '1d': 'd1', '7d': 'd7', '30d': 'd30', never: 'never' }
export const EXPIRY_TO_FRONTEND: Record<string, string> = { d1: '1d', d7: '7d', d30: '30d', never: 'never' }

export function mapExpiryInput(expiry: string) {
  return EXPIRY_TO_ENUM[expiry] ?? 'd7'
}

export function computeExpiresAt(expiry: string, from = new Date()): Date | null {
  const days: Record<string, number | null> = { '1d': 1, '7d': 7, '30d': 30, never: null }
  const d = days[expiry]
  if (d == null) return null
  const result = new Date(from)
  result.setDate(result.getDate() + d)
  return result
}

export function isCatalogueExpired(catalogue: { expiresAt: Date | null; status: string }): boolean {
  if (catalogue.status !== 'active') return false
  if (!catalogue.expiresAt) return false
  return catalogue.expiresAt.getTime() < Date.now()
}

/** Strips fields the public catalogue must never leak, per catalogue.settings. */
export function sanitizeVariantForPublic(
  variant: { id: string; sku: string; attributes: Prisma.JsonValue; price: Prisma.Decimal; stock: number; status: string },
  settings: { showWholesalePrice: boolean; showExactStock: boolean; showAvailability: boolean },
  priceAdjust: (price: number) => number,
) {
  return {
    id: variant.id,
    sku: variant.sku,
    attributes: variant.attributes,
    status: variant.status,
    ...(settings.showWholesalePrice ? { price: priceAdjust(Number(variant.price)) } : {}),
    ...(settings.showExactStock ? { stock: variant.stock } : {}),
    ...(settings.showAvailability ? { inStock: variant.stock > 0 } : {}),
  }
}

export function applyPriceAdjustment(price: number, type: string, value: number): number {
  if (type === 'percentage') return Math.round(price * (1 + Number(value) / 100))
  if (type === 'custom') return Number(value) || price
  return price
}
