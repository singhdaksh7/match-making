import { Boxes, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import type { Product } from '@/types'
import { formatINR } from '@/utils/format'
import { categoryName, primaryImage, totalStockForProduct, variantsForProduct } from '@/utils/selectors'

export function ProductCard({ product, onQuickView }: { product: Product; onQuickView?: (product: Product) => void }) {
  const { data } = useAppData()
  const variants = variantsForProduct(data, product.id)
  const stock = totalStockForProduct(data, product.id)
  const stockStatus = stock === 0 ? 'out of stock' : stock <= 20 ? 'low stock' : 'in stock'

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/5"
    >
      <Link to={`/products/${product.id}`} className="relative aspect-[3/4] overflow-hidden bg-stone-100">
        <ImageWithFallback
          src={primaryImage(product)}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-2.5 top-2.5">
          <StatusBadge status={product.status} />
        </div>
        <div className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-stone-600 backdrop-blur">
          {product.code}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{categoryName(data, product.categoryId)}</p>
        <Link to={`/products/${product.id}`} className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{product.name}</Link>
        <div className="mt-auto flex items-center justify-between pt-2">
          <p className="text-sm font-bold text-stone-900">{formatINR(product.wholesalePrice)}<span className="font-normal text-stone-400">/pc</span></p>
          <StatusBadge status={stockStatus} />
        </div>
        <div className="flex items-center gap-3 border-t border-stone-100 pt-2 text-xs text-stone-500">
          <span className="flex items-center gap-1"><Boxes size={12} /> {variants.length} variants</span>
          <span className="flex items-center gap-1"><Package size={12} /> {stock} pcs</span>
        </div>
        {onQuickView && <button onClick={() => onQuickView(product)} className="mt-1 rounded-lg border border-stone-200 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50">Quick View</button>}
      </div>
    </div>
  )
}
