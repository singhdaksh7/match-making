/**
 * Pricing mode of the product form. It is a pure UI convenience derived from the variant prices: there is no stored
 * "pricing mode" and no product-level price. Every ProductVariant always keeps its own price.
 */
export type PricingMode = 'same' | 'different'

const num = (text: string) => {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null
}

/** Existing product: all prices equal (or only one variant) -> "same"; otherwise "different". */
export function derivePricingMode(prices: number[]): PricingMode {
  return new Set(prices).size <= 1 ? 'same' : 'different'
}

/** The common price when every price is equal, else '' (nothing to prefill). */
export function commonPriceOf(prices: number[]): string {
  return prices.length > 0 && new Set(prices).size === 1 ? String(prices[0]) : ''
}

/** True when the typed prices contain at least two different valid values (blank/invalid entries are ignored). */
export function pricesDiffer(prices: string[]): boolean {
  return new Set(prices.map(num).filter((value): value is number => value !== null)).size > 1
}

/** The most frequently used valid price (first seen wins ties); '' when none. Used to prefill newly added variants. */
export function mostCommonPrice(prices: string[]): string {
  const counts = new Map<number, number>()
  for (const price of prices.map(num)) if (price !== null) counts.set(price, (counts.get(price) ?? 0) + 1)
  let best = '', bestCount = 0
  for (const [price, count] of counts) if (count > bestCount) { best = String(price); bestCount = count }
  return best
}
