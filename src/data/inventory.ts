import type { InventoryEntry, InventoryReason } from '@/types'
import { VARIANTS } from './products'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const REASONS: InventoryReason[] = ['New Production', 'Customer Order', 'Damage', 'Correction', 'Return']

export const INVENTORY_ENTRIES: InventoryEntry[] = []

VARIANTS.forEach((variant, idx) => {
  if (idx % 4 !== 0) return // seed history for a subset to keep data reasonable
  const reason = REASONS[idx % REASONS.length]
  const isAdd = reason === 'New Production' || reason === 'Return'
  const qty = 10 + (idx % 15)
  const previousStock = Math.max(0, variant.stock - (isAdd ? qty : -qty))
  INVENTORY_ENTRIES.push({
    id: `inv-${variant.id}`,
    variantId: variant.id,
    productId: variant.productId,
    type: isAdd ? 'add' : 'remove',
    quantity: qty,
    previousStock,
    newStock: variant.stock,
    reason,
    createdAt: daysAgoIso(3 + (idx % 20)),
    createdBy: 'Amit Shah',
  })
})
