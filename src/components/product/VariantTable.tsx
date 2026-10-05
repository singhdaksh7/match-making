import { Boxes, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ProductVariant } from '@/types'
import { formatINR } from '@/utils/format'
import { variantLabel } from '@/utils/selectors'

interface Props {
  variants: ProductVariant[]
  /** Saves a new final price for one variant. Rejects (throws) on server validation errors. */
  onPriceChange?: (variant: ProductVariant, price: number) => Promise<void>
  onToggleStatus?: (variant: ProductVariant) => Promise<void>
  onDelete?: (variant: ProductVariant) => void
}

function validPrice(text: string): number | null {
  const value = Number(text)
  if (!text.trim() || !Number.isFinite(value) || value <= 0) return null
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? value : null
}

/** Inline price editor: shows the saved price, and a Save button only when the typed value differs and is valid. */
function PriceEditor({ variant, onPriceChange }: { variant: ProductVariant; onPriceChange?: Props['onPriceChange'] }) {
  const [text, setText] = useState(String(variant.price))
  const [saving, setSaving] = useState(false)
  const next = validPrice(text)
  const dirty = text !== String(variant.price)
  if (!onPriceChange) return <span className="font-semibold text-stone-800">{formatINR(variant.price)}</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs font-semibold text-stone-400">₹</span>
      <input
        type="number" inputMode="decimal" min="0" step="0.01" value={text} data-testid="variant-price-input" aria-label={`Price for ${variantLabel(variant)}`}
        onChange={(e) => setText(e.target.value)}
        className={`h-10 w-24 rounded-lg border px-2 text-sm font-semibold text-stone-900 ${dirty && next === null ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
      />
      {dirty && (
        <button
          type="button" disabled={next === null || saving} data-testid="variant-price-save"
          onClick={async () => { if (next === null) return; setSaving(true); try { await onPriceChange(variant, next) } catch { setText(String(variant.price)) } finally { setSaving(false) } }}
          className="h-10 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          {saving ? '…' : 'Save'}
        </button>
      )}
    </span>
  )
}

export function VariantTable({ variants, onPriceChange, onToggleStatus, onDelete }: Props) {
  if (variants.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-200 py-10 text-center text-stone-400">
        <Boxes size={24} strokeWidth={1.5} />
        <p className="text-sm">No variants yet</p>
      </div>
    )
  }

  const attrKeys = [...new Set(variants.flatMap((v) => Object.keys(v.attributes)))].sort()
  const hasActions = Boolean(onToggleStatus || onDelete)

  return (
    <div>
      {/* Mobile Cards View (<md) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {variants.map((v) => (
          <div key={v.id} className="flex flex-col gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-stone-500">{v.sku}</span>
              <StatusBadge status={v.status} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {attrKeys.filter((k) => v.attributes[k]).map((k) => (
                <span key={k} className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs text-stone-700">
                  <span className="text-stone-400 capitalize">{k}: </span>
                  <span className="font-semibold">{v.attributes[k]}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
              <PriceEditor variant={v} onPriceChange={onPriceChange} />
              {hasActions && (
                <div className="flex gap-2">
                  {onToggleStatus && (
                    <button onClick={() => void onToggleStatus(v)} className="rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 active:bg-stone-100">
                      {v.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={() => onDelete(v)} aria-label={`Delete variant ${v.sku}`} data-testid="variant-delete" className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View (>=md) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-stone-200 md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/60 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">SKU</th>
              {attrKeys.map((k) => <th key={k} className="px-4 py-3 capitalize">{k}</th>)}
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              {hasActions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                <td className="px-4 py-3 font-mono text-xs text-stone-600">{v.sku}</td>
                {attrKeys.map((k) => <td key={k} className="px-4 py-3 text-stone-700">{v.attributes[k] ?? '—'}</td>)}
                <td className="px-4 py-3"><PriceEditor variant={v} onPriceChange={onPriceChange} /></td>
                <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                {hasActions && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {onToggleStatus && (
                      <button onClick={() => void onToggleStatus(v)} className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100">
                        {v.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(v)} aria-label={`Delete variant ${v.sku}`} data-testid="variant-delete" className="ml-2 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
