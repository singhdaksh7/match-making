import { Prisma } from '@prisma/client'
import { z } from 'zod'

/**
 * Money handling. Amounts are PostgreSQL DECIMAL(12,2) and are computed with decimal.js (Prisma.Decimal), never with floats,
 * so 600 + 10% is exactly 660.00 and never 660.0000000000001.
 *
 * Pricing hierarchy (highest priority first):
 *   1. CatalogueItemVariant.customPrice   explicit per-variant price for ONE catalogue
 *   2. ProductVariant.price x (1 + Catalogue.priceAdjustmentPct / 100), rounded half-up to 2 decimals
 * The legacy product-level price (Product.basePrice) takes no part in any price.
 */
const Decimal = Prisma.Decimal
export const MAX_PRICE = 9_999_999.99

export const roundMoney = (value: Prisma.Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

export const adjustedPrice = (base: Prisma.Decimal.Value, adjustmentPct: Prisma.Decimal.Value) =>
  roundMoney(new Decimal(base).mul(new Decimal(100).plus(adjustmentPct)).div(100))

export const effectivePrice = (base: Prisma.Decimal.Value, adjustmentPct: Prisma.Decimal.Value, customPrice?: Prisma.Decimal.Value | null) =>
  customPrice === null || customPrice === undefined ? adjustedPrice(base, adjustmentPct) : roundMoney(customPrice)

/** JSON-safe number with exactly the stored precision. */
export const moneyNumber = (value: Prisma.Decimal.Value) => Number(roundMoney(value).toFixed(2))

/** Validated rupee amount: finite, > 0, at most 2 decimals, within DECIMAL(12,2). */
export const priceInput = z.number({ error: 'Price is required' })
  .positive('Price must be greater than zero')
  .max(MAX_PRICE, 'Price is too large')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Price can have at most 2 decimal places')
