import { AlertTriangle, Check } from 'lucide-react'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import type { Product, ProductVariant } from '@/types'
import { formatINR } from '@/utils/format'
import { effectiveVariantPrice, primaryImage, variantLabel } from '@/utils/selectors'

/** variantId -> optional custom price for this catalogue (presence in the map = the variant is shared). */
export type VariantSelection = Record<string, number | null>
export type ProductSelections = Record<string, VariantSelection>

interface Props {
  products: Product[]
  /** Active variants of a product, in display order. */
  variantsFor: (productId: string) => ProductVariant[]
  selections: ProductSelections
  onChange: (productId: string, next: VariantSelection) => void
  /** Catalogue-wide percentage; used only to preview the price the customer will see. */
  adjustmentPct: number
}

/**
 * Explicit variant choice for every product of a catalogue. Nothing is shared unless it is ticked here; "Select all" and
 * "Clear all" are just shortcuts that tick / untick every variant visibly.
 */
export function CatalogueVariantPicker({ products, variantsFor, selections, onChange, adjustmentPct }: Props) {
  const totalSelected = products.reduce((n, p) => n + Object.keys(selections[p.id] ?? {}).length, 0)
  const missing = products.filter((p) => Object.keys(selections[p.id] ?? {}).length === 0)

  return (
    <div className="space-y-4" data-testid="catalogue-variant-picker">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm">
        <p className="text-stone-700"><span className="font-bold text-stone-900">{totalSelected}</span> variant{totalSelected === 1 ? '' : 's'} selected across {products.length} product{products.length === 1 ? '' : 's'}</p>
        <div className="flex gap-2">
          <button type="button" data-testid="select-all-everything" onClick={() => products.forEach((p) => onChange(p.id, Object.fromEntries(variantsFor(p.id).map((v) => [v.id, selections[p.id]?.[v.id] ?? null]))))} className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">Select all variants</button>
          <button type="button" data-testid="clear-all-everything" onClick={() => products.forEach((p) => onChange(p.id, {}))} className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">Clear all</button>
        </div>
      </div>
      {missing.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Choose at least one variant for: {missing.map((p) => p.name).join(', ')}.</span>
        </p>
      )}

      {products.map((product) => {
        const variants = variantsFor(product.id)
        const selected = selections[product.id] ?? {}
        const count = Object.keys(selected).length
        const toggle = (variantId: string) => {
          const next = { ...selected }
          if (variantId in next) delete next[variantId]
          else next[variantId] = null
          onChange(product.id, next)
        }
        return (
          <section key={product.id} data-testid={`picker-product-${product.code}`} className="rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-4">
            <div className="flex items-center gap-3">
              <ImageWithFallback src={primaryImage(product)} alt={product.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-800">{product.name}</p>
                <p className="text-xs text-stone-400">{product.code}</p>
              </div>
              <span data-testid="picker-count" className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${count === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-900 text-white'}`}>{count} / {variants.length}</span>
            </div>
            {variants.length === 0 ? (
              <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-500">This product has no active variants. Add variants with prices to the product first.</p>
            ) : (
              <>
                <div className="mt-3 flex gap-2">
                  <button type="button" data-testid="select-all-variants" onClick={() => onChange(product.id, Object.fromEntries(variants.map((v) => [v.id, selected[v.id] ?? null])))} className="h-9 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700">Select all</button>
                  <button type="button" data-testid="clear-all-variants" onClick={() => onChange(product.id, {})} className="h-9 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700">Clear all</button>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {variants.map((variant) => {
                    const on = variant.id in selected
                    const custom = selected[variant.id]
                    const shown = effectiveVariantPrice(variant.price, adjustmentPct, custom)
                    return (
                      <li key={variant.id} className={`rounded-xl border ${on ? 'border-stone-900 bg-stone-50' : 'border-stone-200'}`}>
                        <button type="button" role="checkbox" aria-checked={on} data-testid={`variant-option-${variant.sku}`} onClick={() => toggle(variant.id)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white'}`}>{on && <Check size={13} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-stone-800">{variantLabel(variant)}</span>
                            <span className="block truncate font-mono text-[11px] text-stone-400">{variant.sku}</span>
                          </span>
                          <span className="shrink-0 text-right text-sm font-semibold text-stone-900">
                            {formatINR(shown)}
                            {shown !== variant.price && <span className="block text-[11px] font-normal text-stone-400 line-through">{formatINR(variant.price)}</span>}
                          </span>
                        </button>
                        {on && (
                          <label className="flex items-center gap-2 border-t border-stone-200 px-3 py-2 text-xs text-stone-500">
                            Custom price for this catalogue
                            <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="optional" value={custom ?? ''} data-testid={`variant-custom-price-${variant.sku}`}
                              onChange={(e) => onChange(product.id, { ...selected, [variant.id]: e.target.value === '' ? null : Number(e.target.value) })}
                              className="h-9 w-28 min-w-0 rounded-lg border border-stone-200 px-2 text-sm text-stone-800" />
                          </label>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
