import { ArrowLeft, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { applyPriceAdjustment, catalogueProductVariants } from '@/utils/selectors'

export default function CatalogueProductDetailPage() {
  const { slug, productId } = useParams()
  const navigate = useNavigate()
  const { data } = useAppData()
  const { showToast } = useToast()
  const [activeImage, setActiveImage] = useState(0)
  const [fabric, setFabric] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(12)

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
        <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-stone-100">
          <ImageWithFallback src={product.media[activeImage]?.url} alt={product.name} className="h-full w-full object-cover" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {product.media.map((m, i) => (
            <button key={m.id} onClick={() => setActiveImage(i)} className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${activeImage === i ? 'border-stone-900' : 'border-transparent'}`}>
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
                <button key={f} onClick={() => setFabric(f!)} className={`rounded-full border px-4 py-2 text-sm font-medium ${fabric === f ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                  {f}
                </button>
              ))}
            </Selector>
          )}
          {colors.length > 0 && (
            <Selector label="Color">
              {colors.map((c) => {
                const hex = COLORS.find((cv) => cv.value === c)?.hex
                return <ColorSwatch key={c} hex={hex} name={c!} showLabel selected={color === c} onClick={() => setColor(c!)} />
              })}
            </Selector>
          )}
          {sizes.length > 0 && (
            <Selector label="Size">
              {sizes.map((s) => (
                <button key={s} onClick={() => setSize(s!)} className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold ${size === s ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
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
            <button onClick={handleAdd} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3.5 text-sm font-semibold text-white hover:bg-stone-800">
              <Check size={16} /> Add to Selection
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
