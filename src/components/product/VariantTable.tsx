import { Boxes } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ProductVariant } from '@/types'
import { formatINR } from '@/utils/format'

interface Props {
  variants: ProductVariant[]
  onAdjustStock?: (variant: ProductVariant) => void
  onEdit?: (variant: ProductVariant) => void
}

export function VariantTable({ variants, onAdjustStock, onEdit }: Props) {
  if (variants.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-200 py-10 text-center text-stone-400">
        <Boxes size={24} strokeWidth={1.5} />
        <p className="text-sm">No variants yet</p>
      </div>
    )
  }

  const attrKeys = Object.keys(variants[0].attributes)

  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-stone-100 bg-stone-50/60 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
            <th className="px-4 py-3">SKU</th>
            {attrKeys.map((k) => <th key={k} className="px-4 py-3 capitalize">{k}</th>)}
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Status</th>
            {(onAdjustStock || onEdit) && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const stockStatus = v.stock === 0 ? 'out of stock' : v.stock <= v.lowStockThreshold ? 'low stock' : 'in stock'
            return (
              <tr key={v.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                <td className="px-4 py-3 font-mono text-xs text-stone-600">{v.sku}</td>
                {attrKeys.map((k) => <td key={k} className="px-4 py-3 text-stone-700">{v.attributes[k]}</td>)}
                <td className="px-4 py-3 font-semibold text-stone-800">{formatINR(v.price)}</td>
                <td className="px-4 py-3 text-stone-700">{v.stock}</td>
                <td className="px-4 py-3"><StatusBadge status={stockStatus} /></td>
                {(onAdjustStock || onEdit) && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {onAdjustStock && (
                      <button onClick={() => onAdjustStock(v)} className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100">
                        Adjust
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
