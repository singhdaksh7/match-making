import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import type { InventoryReason, ProductVariant } from '@/types'

const REASONS: InventoryReason[] = ['New Production', 'Customer Order', 'Damage', 'Correction', 'Return']

export function StockAdjustModal({ variant, onClose }: { variant: ProductVariant | null; onClose: () => void }) {
  const { adjustStock } = useAppData()
  const { showToast } = useToast()
  const [type, setType] = useState<'add' | 'remove' | 'set'>('add')
  const [quantity, setQuantity] = useState(10)
  const [reason, setReason] = useState<InventoryReason>('New Production')
  const [note, setNote] = useState('')

  if (!variant) return null

  function handleSubmit() {
    adjustStock(variant!.id, type, quantity, reason, note || undefined)
    showToast('Stock updated successfully')
    onClose()
  }

  return (
    <Modal open={!!variant} onClose={onClose} title={`Adjust Stock — ${variant.sku}`} size="sm">
      <div className="space-y-4">
        <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Current stock: <span className="font-semibold text-stone-900">{variant.stock} pieces</span>
        </p>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">Action</p>
          <div className="grid grid-cols-3 gap-2">
            {(['add', 'remove', 'set'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-xl border py-2 text-sm font-semibold capitalize ${type === t ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">{type === 'set' ? 'New stock value' : 'Quantity'}</p>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">Reason</p>
          <select value={reason} onChange={(e) => setReason(e.target.value as InventoryReason)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">Note (optional)</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none" />
        </div>

        <button onClick={handleSubmit} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800">
          Save Adjustment
        </button>
      </div>
    </Modal>
  )
}
