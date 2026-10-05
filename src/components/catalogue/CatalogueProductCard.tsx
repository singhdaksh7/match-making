import { Link } from 'react-router-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import type { Catalogue, Product, ProductVariant } from '@/types'
import { formatPriceRange } from '@/utils/format'
import { primaryImage, variantPriceRange } from '@/utils/selectors'

interface Props {
  product: Product
  /** The variants this catalogue shares for the product (nothing else is ever listed). */
  variants: ProductVariant[]
  catalogue: Catalogue
  slug: string
}

export function CatalogueProductCard({ product, variants, catalogue, slug }: Props) {
  const colors = [...new Set(variants.map((v) => v.attributes.color).filter(Boolean))]
  const hexOf = (name: string) => product.publicAttributes?.find((a) => a.key === 'color')?.values.find((v) => v.value === name)?.hex ?? undefined
  const range = variantPriceRange(variants)

  return (
    <Link to={`/catalogue/${slug}/product/${product.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
        <ImageWithFallback src={primaryImage(product)} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-stone-600 backdrop-blur">{product.code}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{product.name}</h3>
        {catalogue.settings.showWholesalePrice && range && <p className="text-sm font-bold text-stone-900" data-testid="card-price">{formatPriceRange(range)}<span className="text-xs font-normal text-stone-400">/pc</span></p>}
        {colors.length > 0 && (
          <div className="flex items-center gap-1">
            {colors.slice(0, 5).map((c) => <ColorSwatch key={c} hex={hexOf(c!)} name={c!} size="sm" />)}
            {colors.length > 5 && <span className="text-[10px] text-stone-400">+{colors.length - 5}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-stone-500">
          {catalogue.settings.showMOQ && <span>MOQ {product.moq}</span>}
          <span className="font-medium text-stone-600">{variants.length} {variants.length === 1 ? 'variant' : 'variants'}</span>
        </div>
      </div>
    </Link>
  )
}
