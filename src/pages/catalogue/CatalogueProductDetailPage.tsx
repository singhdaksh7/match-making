import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { SelectionTray } from '@/components/catalogue/SelectionTray'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { useCatalogueSelection } from '@/hooks/useCatalogueSelection'
import { formatINR, formatPriceRange } from '@/utils/format'
import { resolveGallery } from '@/utils/gallery'
import { catalogueProductVariants, variantLabel, variantPriceRange } from '@/utils/selectors'
import type { ProductVariant } from '@/types'

const matches = (variant: ProductVariant, selection: Record<string, string>) => Object.entries(selection).every(([key, value]) => variant.attributes[key] === value)

export default function CatalogueProductDetailPage() {
  const { slug, productId } = useParams()
  const navigate = useNavigate()
  const { data } = useAppData()
  const { showToast } = useToast()
  const [activeImage, setActiveImage] = useState<{ ctx: string; index: number }>({ ctx: '', index: 0 })
  // What the shopper explicitly picked, and in which order (the gallery follows the latest image-capable pick).
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [pickOrder, setPickOrder] = useState<string[]>([])
  // Each variant keeps its own quantity while the shopper compares variants.
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [quantityValid, setQuantityValid] = useState(true)
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false)

  const catalogue = data.catalogues.find((c) => c.slug === slug)
  const product = data.products.find((p) => p.id === productId)
  const selection = useCatalogueSelection(slug ?? '')

  // ONLY the variants this catalogue shares. Nothing else can ever be chosen, priced or ordered.
  const variants = useMemo(() => (catalogue && product ? catalogueProductVariants(data, catalogue, product) : []), [catalogue, product, data])

  // One selector per attribute type that the shared variants actually use, with only the values that appear in them.
  const options = useMemo(() => {
    const used = new Map<string, Set<string>>()
    for (const variant of variants) for (const [key, value] of Object.entries(variant.attributes)) used.set(key, (used.get(key) ?? new Set()).add(value))
    const known = product?.publicAttributes ?? []
    return [...used.entries()].map(([key, values]) => {
      const meta = known.find((a) => a.key === key)
      const ordered = meta ? meta.values.filter((v) => values.has(v.value)) : []
      const extra = [...values].filter((v) => !ordered.some((o) => o.value === v)).map((value) => ({ value, hex: null as string | null | undefined }))
      return { key, name: meta?.name ?? key.charAt(0).toUpperCase() + key.slice(1), kind: meta?.kind ?? 'TEXT', values: [...ordered, ...extra] }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [variants, product])

  // An attribute with a single possible value needs no tap: it is selected for the shopper (lowest priority for the gallery).
  const defaults = Object.fromEntries(options.filter((o) => o.values.length === 1).map((o) => [o.key, o.values[0].value]))
  const effective: Record<string, string> = { ...defaults, ...picked }
  const exact = options.length > 0 && options.every((o) => effective[o.key]) ? variants.find((v) => matches(v, effective)) : undefined
  const candidates = variants.filter((v) => matches(v, effective))
  const missing = options.filter((o) => !effective[o.key]).map((o) => o.name)

  const showPrice = catalogue?.settings.showWholesalePrice
  const priceRange = variantPriceRange(candidates)

  const gallery = product ? resolveGallery(product, picked, pickOrder, defaults, exact) : { context: null, images: [] }
  const ctxKey = gallery.context ? `${gallery.context.attributeKey}:${gallery.context.value}` : 'general'
  const activeIndex = activeImage.ctx === ctxKey ? Math.min(activeImage.index, Math.max(gallery.images.length - 1, 0)) : 0

  /**
   * Picks one value. A combination that is not shared can never form: any other pick that would make the choice impossible
   * is released (oldest first), so the shopper always ends on a real, orderable variant or a valid partial selection.
   */
  function pick(key: string, value: string) {
    const next = { ...picked, [key]: value }
    const order = [...pickOrder.filter((item) => item !== key), key]
    const release = order.filter((item) => item !== key)
    while (!variants.some((v) => matches(v, { ...defaults, ...next })) && release.length) delete next[release.shift()!]
    setPicked(next)
    setPickOrder(order.filter((item) => item in next))
  }

  function pickVariant(variant: ProductVariant) {
    setPicked(variant.attributes)
    setPickOrder(Object.keys(variant.attributes))
  }

  // A direct hit on a product link renders before the public catalogue has loaded; wait briefly
  // instead of bouncing to the catalogue list, then fall back to the redirect (e.g. unavailable catalogue).
  const stillLoading = data.catalogues.length === 0 && !gaveUpWaiting
  useEffect(() => {
    if (!stillLoading) return
    const timer = setTimeout(() => setGaveUpWaiting(true), 5000)
    return () => clearTimeout(timer)
  }, [stillLoading])
  if ((!catalogue || !product) && stillLoading) return <div className="min-h-screen bg-white" aria-busy="true" />
  if (!catalogue || !product) return <Navigate to={`/catalogue/${slug}`} replace />

  // A quantity typed before a variant is chosen carries over to the first variant picked.
  const qty = quantities[exact?.id ?? ''] ?? quantities[''] ?? Math.max(12, product.moq)

  function handleAdd() {
    if (!exact) {
      showToast(`Please select ${missing.length ? missing.join(', ').toLowerCase() : 'an available variant'}`, 'error')
      return
    }
    if (!quantityValid) {
      showToast('Enter a valid quantity (a whole number from 1 to 1,000,000)', 'error')
      return
    }
    selection.addItem({ productId: product!.id, variantId: exact.id, quantity: qty })
    showToast(`Added ${variantLabel(exact)} to your selection`)
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={() => navigate(-1)} aria-label="Back" className="rounded-full p-1.5 hover:bg-stone-100">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-stone-800">{product.code}</p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <div data-testid="gallery-main" data-gallery-context={ctxKey} data-gallery-src={gallery.images[activeIndex]?.url ?? ''} className="aspect-[3/4] overflow-hidden rounded-2xl bg-stone-100">
          <ImageWithFallback key={gallery.images[activeIndex]?.url} src={gallery.images[activeIndex]?.url} alt={gallery.images[activeIndex]?.alt ?? product.name} className="h-full w-full object-cover" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {gallery.images.map((m, i) => (
            <button key={`${m.source}-${i}-${m.url}`} data-testid={`gallery-thumb-${i}`} data-source={m.source} aria-label={`Photo ${i + 1}`} onClick={() => setActiveImage({ ctx: ctxKey, index: i })} className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${activeIndex === i ? 'border-stone-900' : 'border-transparent'}`}>
              <ImageWithFallback src={m.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-5">
          <p className="font-mono text-xs font-semibold text-stone-400">{product.code}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-stone-900">{product.name}</h1>
          {showPrice && priceRange && (
            <p data-testid="variant-price" data-variant-id={exact?.id ?? ''} className="mt-1.5 text-xl font-bold text-stone-900">
              {exact ? formatINR(exact.price) : formatPriceRange(priceRange)}
              <span className="text-sm font-normal text-stone-400"> / piece</span>
            </p>
          )}
          {exact && <p className="mt-0.5 text-sm font-medium text-stone-600">{variantLabel(exact)} <span className="font-mono text-xs text-stone-400">{exact.sku}</span></p>}
          {catalogue.settings.showMOQ && <p className="mt-1 text-sm text-stone-500">MOQ: {product.moq} pieces</p>}
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{product.description}</p>
        </div>

        <div className="mt-6 space-y-5">
          {options.map((option) => (
            <Selector key={option.key} label={option.name}>
              {option.values.map(({ value, hex }) => {
                const isSelected = effective[option.key] === value
                // dimmed = cannot be combined with the other current picks; tapping it still works and releases the conflicting pick
                const reachable = variants.some((v) => v.attributes[option.key] === value && matches(v, Object.fromEntries(Object.entries(effective).filter(([k]) => k !== option.key))))
                return (
                  <button
                    key={value} type="button" aria-pressed={isSelected} data-testid={`option-${option.key}-${value}`}
                    onClick={() => pick(option.key, value)}
                    className={`flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${isSelected ? 'border-stone-900 bg-stone-900 text-white' : reachable ? 'border-stone-200 bg-white text-stone-700' : 'border-dashed border-stone-200 bg-stone-50 text-stone-400'}`}
                  >
                    {option.kind === 'COLOR' && <span className="inline-block h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: hex ?? '#ccc' }} />}
                    {value}
                  </button>
                )
              })}
            </Selector>
          ))}

          <div data-testid="shared-variants">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Available variants ({variants.length})</p>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {variants.map((variant) => (
                <button
                  key={variant.id} type="button" aria-pressed={exact?.id === variant.id} data-testid={`variant-chip-${variant.sku}`}
                  onClick={() => pickVariant(variant)}
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left text-sm ${exact?.id === variant.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}
                >
                  <span className="min-w-0 truncate font-medium">{variantLabel(variant)}</span>
                  {showPrice && <span className="shrink-0 font-semibold">{formatINR(variant.price)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
                        <p className="mb-2 text-sm font-medium text-stone-700">How many pieces do you want?</p>
            <QuantitySelector key={exact?.id ?? 'none'} value={qty} onChange={(q) => setQuantities((prev) => ({ ...prev, [exact?.id ?? '']: q }))} onValidityChange={setQuantityValid} />
            {showPrice && exact && quantityValid && <p data-testid="estimated-total" className="mt-2 text-sm text-stone-600">Estimated total: <span className="font-bold text-stone-900">{formatINR(exact.price * qty)}</span></p>}
          </div>

          {!exact && <p data-testid="select-hint" className="text-sm font-medium text-stone-500">{missing.length ? `Select ${missing.join(', ').toLowerCase()} to choose a variant` : 'Choose one of the available variants'}</p>}

          {catalogue.settings.allowProductSelection && (
            <button
              onClick={handleAdd}
              data-testid="add-to-selection"
              className="sticky bottom-20 z-20 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 text-sm font-semibold text-white shadow-lg active:scale-[0.98] sm:static sm:h-auto sm:py-3.5"
            >
              <Check size={18} /> Add to Selection
            </button>
          )}
        </div>
      </div>

      {catalogue.settings.allowProductSelection && <SelectionTray slug={slug!} count={selection.items.length} />}
    </div>
  )
}

function Selector({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
