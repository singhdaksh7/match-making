import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StockAdjustModal } from '@/components/inventory/StockAdjustModal'
import { useAppData } from '@/context/AppDataContext'
import type { ProductVariant } from '@/types'
import { lowStockVariants, primaryImage } from '@/utils/selectors'

export default function LowStockPage() {
  const { data } = useAppData()
  const [adjusting, setAdjusting] = useState<ProductVariant | null>(null)
  const items = useMemo(() => lowStockVariants(data), [data])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Low Stock</h1>
        <p className="mt-1 text-sm text-stone-500">{items.length} variants below the {data.settings.lowStockThreshold}-piece threshold</p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="All stocked up" description="No variants are currently below the low stock threshold." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/60 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Current Stock</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map(({ variant, product }) => (
                <tr key={variant.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <Link to={`/products/${product.id}`} className="flex items-center gap-3">
                      <ImageWithFallback src={primaryImage(product)} alt={product.name} className="h-9 w-9 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-stone-800">{product.name}</p>
                        <p className="text-xs text-stone-400">{product.code}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{Object.values(variant.attributes).join(' / ')}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-500">{variant.sku}</td>
                  <td className="px-4 py-3 font-semibold text-amber-600">{variant.stock} pcs</td>
                  <td className="px-4 py-3 text-stone-500">{variant.lowStockThreshold}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setAdjusting(variant)} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800">
                      Update Stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StockAdjustModal variant={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  )
}
