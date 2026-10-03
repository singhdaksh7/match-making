import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { SelectionTray } from '@/components/catalogue/SelectionTray'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { COLORS } from '@/data/attributes'
import { useCatalogueSelection } from '@/hooks/useCatalogueSelection'
import { formatINR } from '@/utils/format'
import { resolveGallery } from '@/utils/gallery'
import { applyPriceAdjustment, catalogueProductVariants } from '@/utils/selectors'

export default function CatalogueProductDetailPage() {
  const { slug, productId } = useParams()
  const navigate = useNavigate()
  const { data } = useAppData()
  const { showToast } = useToast()
  const [activeImage, setActiveImage] = useState<{ ctx: string; index: number }>({ ctx: '', index: 0 })
  const [pickOrder, setPickOrder] = useState<string[]>([])
  const [fabric, setFabric] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(12)
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false)

  const catalogue = data.catalogues.find((c) => c.slug === slug)
  const product = data.products.find((p) => p.id === productId)
  const selection = useCatalogueSelection(slug ?? '')

  const variants = useMemo(
    () => (catalogue && product ? catalogueProductVariants(data, catalogue, product) : []),
    [catalogue, product, data],
  )

  const fabrics = [...new Set(variants.map((v) => v.attributes.fabric).filter(Boolean))]
  const colors = [...new Set(variants.map((v) => v.attributes.color).filter(Boolean))]
  const sizes = [...new Set(variants.map((v) => v.attributes.size).filter(Boolean))]

  const matchedVariant = variants.find(
    (v) => (!fabrics.length || v.attributes.fabric === fabric) && (!colors.length || v.attributes.color === color) && (!sizes.length || v.attributes.size === size),
  )

  const selections: Record<string, string | null> = { fabric, color, size }
  const defaults: Record<string, string> = {}
  if (fabrics.length === 1) defaults.fabric = fabrics[0]!
  if (colors.length === 1) defaults.color = colors[0]!
  if (sizes.length === 1) defaults.size = sizes[0]!
  const gallery = product ? resolveGallery(product, selections, pickOrder, defaults) : { context: null, images: [] }
  const ctxKey = gallery.context ? `${gallery.context.attributeKey}:${gallery.context.value}` : 'general'
  const activeIndex = activeImage.ctx === ctxKey ? Math.min(activeImage.index, Math.max(gallery.images.length - 1, 0)) : 0

  function pick(key: 'fabric' | 'color' | 'size', value: string) {
    if (key === 'fabric') setFabric(value)
    else if (key === 'color') setColor(value)
    else setSize(value)
    setPickOrder((prev) => [...prev.filter((item) => item !== key), key])
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

  const price = applyPriceAdjustment(matchedVariant?.price ?? product.wholesalePrice, catalogue)

  function handleAdd() {
    if (!matchedVariant) {
      showToast('Please select fabric, color and size', 'error')
      return
    }
    selection.addItem({ productId: product!.id, variantId: matchedVariant.id, quantity })
    showToast('Added to your selection')
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-stone-100">
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
            <button key={`${m.source}-${i}-${m.url}`} data-testid={`gallery-thumb-${i}`} data-source={m.source} onClick={() => setActiveImage({ ctx: ctxKey, index: i })} className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${activeIndex === i ? 'border-stone-900' : 'border-transparent'}`}>
              <ImageWithFallback src={m.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-5">
          <p className="font-mono text-xs font-semibold text-stone-400">{product.code}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-stone-900">{product.name}</h1>
          {catalogue.settings.showWholesalePrice && <p className="mt-1.5 text-xl font-bold text-stone-900">{formatINR(price)}<span className="text-sm font-normal text-stone-400"> / piece</span></p>}
          {catalogue.settings.showMOQ && <p className="mt-1 text-sm text-stone-500">MOQ: {product.moq} pieces</p>}
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{product.description}</p>
        </div>

        <div className="mt-6 space-y-5">
          {fabrics.length > 0 && (
            <Selector label="Fabric">
              {fabrics.map((f) => (
                <button key={f} onClick={() => pick('fabric', f!)} className={`rounded-full border px-4 py-2 text-sm font-medium ${fabric === f ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                  {f}
                </button>
              ))}
            </Selector>
          )}
          {colors.length > 0 && (
            <Selector label="Color">
              {colors.map((c) => {
                const hex = COLORS.find((cv) => cv.value === c)?.hex
                return <ColorSwatch key={c} hex={hex} name={c!} showLabel selected={color === c} onClick={() => pick('color', c!)} />
              })}
            </Selector>
          )}
          {sizes.length > 0 && (
            <Selector label="Size">
              {sizes.map((s) => (
                <button key={s} onClick={() => pick('size', s!)} className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold ${size === s ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                  {s}
                </button>
              ))}
            </Selector>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Quantity</p>
            <QuantitySelector value={quantity} onChange={setQuantity} min={product.moq} step={1} />
          </div>

          {catalogue.settings.showAvailability && (
            <p className={`text-sm font-medium ${matchedVariant && matchedVariant.stock > 0 ? 'text-emerald-600' : 'text-stone-500'}`}>
              {matchedVariant
                ? matchedVariant.stock > 0
                  ? catalogue.settings.showExactStock ? `${matchedVariant.stock} pieces available` : 'Available'
                  : 'Out of stock'
                : 'Select options to check availability'}
            </p>
          )}

          {catalogue.settings.allowProductSelection && (
            <button
              onClick={handleAdd}
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
