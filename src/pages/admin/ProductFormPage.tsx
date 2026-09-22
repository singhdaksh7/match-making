import {
  ArrowLeft, ArrowRight, Check, ImagePlus, Star, Trash2, UploadCloud,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { ATTRIBUTES } from '@/data/attributes'
import type { Product, ProductMedia, ProductVariant } from '@/types'
import { formatINR } from '@/utils/format'
import { primaryImage } from '@/utils/selectors'

const VARIANT_DIM_ATTRS = ['attr-fabric', 'attr-color', 'attr-size', 'attr-waist']
const STEPS = ['Basic Info', 'Media', 'Attributes', 'Variants', 'Pricing & MOQ', 'Review']

interface DraftVariant {
  key: string
  attributes: Record<string, string>
  price: number
  stock: number
  enabled: boolean
}

export default function ProductFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { data, addProduct, updateProduct } = useAppData()
  const { showToast } = useToast()

  const existing = isEdit ? data.products.find((p) => p.id === id) : undefined
  if (isEdit && !existing) return <Navigate to="/products" replace />

  const [step, setStep] = useState(0)
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? data.categories[0]?.id ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [media, setMedia] = useState<ProductMedia[]>(existing?.media ?? [])
  const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({})
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([])
  const [wholesalePrice, setWholesalePrice] = useState(existing?.wholesalePrice ?? 0)
  const [comparePrice, setComparePrice] = useState(existing?.comparePrice ?? 0)
  const [moq, setMoq] = useState(existing?.moq ?? data.settings.catalogueDefaults.defaultMOQ)

  const category = data.categories.find((c) => c.id === categoryId)
  const categoryAttributes = useMemo(
    () => (category ? category.attributeIds.map((id) => ATTRIBUTES.find((a) => a.id === id)).filter(Boolean) : []),
    [category],
  ) as typeof ATTRIBUTES

  const variantAttributes = categoryAttributes.filter((a) => VARIANT_DIM_ATTRS.includes(a.id))
  const descriptiveAttributes = categoryAttributes.filter((a) => !VARIANT_DIM_ATTRS.includes(a.id))

  function toggleValue(attrId: string, value: string) {
    setSelectedValues((prev) => {
      const current = prev[attrId] ?? []
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      return { ...prev, [attrId]: next }
    })
  }

  function generateVariants() {
    const dims = variantAttributes
      .map((a) => ({ attr: a, values: selectedValues[a.id] ?? [] }))
      .filter((d) => d.values.length > 0)

    if (dims.length === 0) {
      showToast('Select at least one attribute value to generate variants', 'error')
      return
    }

    let combos: Record<string, string>[] = [{}]
    for (const dim of dims) {
      const next: Record<string, string>[] = []
      const key = dim.attr.name.toLowerCase() === 'waist size' ? 'waist' : dim.attr.name.toLowerCase()
      for (const combo of combos) {
        for (const value of dim.values) {
          next.push({ ...combo, [key]: value })
        }
      }
      combos = next
    }

    setDraftVariants(
      combos.map((attrs) => ({
        key: Object.values(attrs).join('-'),
        attributes: attrs,
        price: wholesalePrice || 0,
        stock: 20,
        enabled: true,
      })),
    )
    showToast(`${combos.length} variants generated`)
  }

  function handleImageUpload(files: FileList | null) {
    if (!files) return
    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        }),
    )
    Promise.all(readers).then((urls) => {
      setMedia((prev) => [
        ...prev,
        ...urls.map((url, i) => ({ id: `media-${Date.now()}-${i}`, url, isPrimary: prev.length === 0 && i === 0 })),
      ])
    })
  }

  function canProceed() {
    if (step === 0) return name.trim() && code.trim() && categoryId
    if (step === 3) return draftVariants.length > 0 || isEdit
    if (step === 4) return wholesalePrice > 0 && moq > 0
    return true
  }

  function handleSave() {
    const productId = existing?.id ?? `prod-${Date.now()}`
    const attributeIds = categoryAttributes.map((a) => a.id)
    const product: Product = {
      id: productId,
      code,
      name,
      categoryId,
      description,
      media: media.length ? media : [{ id: 'media-fallback', url: category?.imageUrl ?? '', isPrimary: true }],
      attributeIds,
      wholesalePrice,
      comparePrice: comparePrice || undefined,
      moq,
      status: 'active',
      views: existing?.views ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (isEdit) {
      updateProduct(productId, product)
      showToast('Product updated successfully')
    } else {
      const variants: ProductVariant[] = draftVariants
        .filter((v) => v.enabled)
        .map((v, i) => ({
          id: `var-${productId}-${i}`,
          productId,
          sku: `${code}-${Object.values(v.attributes).map((x) => x.slice(0, 3).toUpperCase()).join('-')}`,
          attributes: v.attributes,
          price: v.price,
          stock: v.stock,
          reserved: 0,
          status: 'active',
          lowStockThreshold: 10,
        }))
      addProduct(product, variants)
      showToast('Product created successfully')
    }
    navigate(`/products/${productId}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-sm text-stone-500">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-stone-900' : 'bg-stone-200'}`} />
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Category">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
                {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Product Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floral Rayon Straight Kurti" className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="Product Code">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. K-108" className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the product..." className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 py-10 text-center hover:border-stone-400 hover:bg-stone-50">
              <UploadCloud size={26} className="text-stone-400" />
              <p className="text-sm font-medium text-stone-600">Drag & drop images, or click to browse</p>
              <p className="text-xs text-stone-400">PNG, JPG up to 5MB each</p>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e.target.files)} />
            </label>
            {media.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {media.map((m) => (
                  <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200">
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                    {m.isPrimary && (
                      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Star size={9} fill="white" /> Primary
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      {!m.isPrimary && (
                        <button onClick={() => setMedia((prev) => prev.map((x) => ({ ...x, isPrimary: x.id === m.id })))} className="rounded-full bg-white p-1.5">
                          <Star size={13} />
                        </button>
                      )}
                      <button onClick={() => setMedia((prev) => prev.filter((x) => x.id !== m.id))} className="rounded-full bg-white p-1.5 text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {categoryAttributes.length === 0 && <p className="text-sm text-stone-400">This category has no assigned attributes yet.</p>}
            {[...variantAttributes, ...descriptiveAttributes].map((attr) => (
              <div key={attr.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                  {attr.name} {VARIANT_DIM_ATTRS.includes(attr.id) && <span className="text-stone-300">· forms variants</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {attr.values.map((v) =>
                    attr.type === 'color' ? (
                      <ColorSwatch key={v.id} hex={v.hex} name={v.value} showLabel selected={(selectedValues[attr.id] ?? []).includes(v.value)} onClick={() => toggleValue(attr.id, v.value)} />
                    ) : (
                      <button
                        key={v.id}
                        onClick={() => toggleValue(attr.id, v.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          (selectedValues[attr.id] ?? []).includes(v.value) ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {v.value}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <button onClick={generateVariants} className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50">
              Generate Variant Combinations
            </button>
            {draftVariants.length > 0 && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                  <span className="font-medium text-stone-700">{draftVariants.length} variants generated</span>
                  <div className="flex gap-2">
                    <BulkPriceButton variants={draftVariants} setVariants={setDraftVariants} />
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-stone-50">
                      <tr className="text-left text-xs font-semibold uppercase text-stone-400">
                        <th className="px-3 py-2">Combination</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Stock</th>
                        <th className="px-3 py-2">Enabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftVariants.map((v, i) => (
                        <tr key={v.key} className="border-t border-stone-100">
                          <td className="px-3 py-2 text-stone-700">{Object.values(v.attributes).join(' / ')}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={v.price}
                              onChange={(e) => setDraftVariants((prev) => prev.map((x, xi) => xi === i ? { ...x, price: Number(e.target.value) } : x))}
                              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={v.stock}
                              onChange={(e) => setDraftVariants((prev) => prev.map((x, xi) => xi === i ? { ...x, stock: Number(e.target.value) } : x))}
                              className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={v.enabled}
                              onChange={(e) => setDraftVariants((prev) => prev.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <Field label="Wholesale Price (₹)">
              <input type="number" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="Compare Price (₹, optional)">
              <input type="number" value={comparePrice} onChange={(e) => setComparePrice(Number(e.target.value))} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="MOQ (Minimum Order Quantity)">
              <input type="number" value={moq} onChange={(e) => setMoq(Number(e.target.value))} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <img src={media[0]?.url || category?.imageUrl} className="h-24 w-24 rounded-xl object-cover" />
              <div>
                <p className="font-mono text-xs font-semibold text-stone-400">{code}</p>
                <p className="font-serif text-lg font-semibold text-stone-900">{name}</p>
                <p className="text-sm text-stone-500">{category?.name}</p>
                <p className="mt-1 text-sm font-semibold text-stone-800">{formatINR(wholesalePrice)} · MOQ {moq}</p>
              </div>
            </div>
            <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">
              <p>{draftVariants.filter((v) => v.enabled).length || variantsCountFallback(existing)} variants will be saved.</p>
              <p className="mt-1">{media.length} images uploaded.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 disabled:opacity-40"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canProceed() && setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button onClick={handleSave} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">
            <Check size={15} /> {isEdit ? 'Save Changes' : 'Save Product'}
          </button>
        )}
      </div>
    </div>
  )
}

function variantsCountFallback(existing?: Product) {
  return existing ? '' : 0
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-stone-600">{label}</label>
      {children}
    </div>
  )
}

function BulkPriceButton({ variants, setVariants }: { variants: DraftVariant[]; setVariants: (fn: (prev: DraftVariant[]) => DraftVariant[]) => void }) {
  return (
    <button
      onClick={() => {
        const price = prompt('Set price for all variants:')
        if (price) setVariants((prev) => prev.map((v) => ({ ...v, price: Number(price) })))
      }}
      className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-white"
    >
      Bulk set price
    </button>
  )
}
