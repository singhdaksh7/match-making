import { ArrowLeft, ArrowRight, Check, Plus, Star, Trash2, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AttributePhotos, useAttributeImages } from '@/components/product/AttributePhotos'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, apiClient } from '@/services/api/client'
import type { Attribute, Product, ProductMedia, ProductVariant } from '@/types'
import { formatINR } from '@/utils/format'
import { variantsForProduct } from '@/utils/selectors'

const STEPS = ['Basic Information', 'Category', 'Product Attributes', 'Variants / SKUs', 'Pricing / MOQ', 'Images', 'Save']

interface DraftVariant {
  key: string
  attributes: Record<string, string>
  price: number
  stock: number
  enabled: boolean
  existingId?: string
}

function attrKey(attr: Attribute) {
  return attr.name.toLowerCase() === 'waist size' ? 'waist' : attr.name.toLowerCase()
}

export default function ProductFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { data, addProduct, updateProduct, addVariant, refreshData } = useAppData()
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)

  const existing = isEdit ? data.products.find((p) => p.id === id) : undefined
  const existingVariants = existing ? variantsForProduct(data, existing.id) : []
  const [step, setStep] = useState(0)
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [media, setMedia] = useState<ProductMedia[]>(existing?.media ?? [])
  const [deletingMedia, setDeletingMedia] = useState<ProductMedia | null>(null)
  const persistedMediaIds = useMemo(() => new Set((existing?.media ?? []).map((m) => m.id)), [existing])
  const [selectedValueIds, setSelectedValueIds] = useState<Record<string, string[]>>(() => {
    if (!existing) return {}
    const grouped: Record<string, string[]> = {}
    for (const attr of data.attributes) {
      const ids = attr.values.filter((value) => existing.allowedAttributeValueIds.includes(value.id)).map((value) => value.id)
      if (ids.length) grouped[attr.id] = ids
    }
    return grouped
  })
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>(() =>
    existingVariants.map((variant) => ({
      key: variant.id,
      attributes: variant.attributes,
      price: variant.price,
      stock: variant.stock,
      enabled: true,
      existingId: variant.id,
    })),
  )
  const [wholesalePrice, setWholesalePrice] = useState(existing?.wholesalePrice ?? 0)
  const [comparePrice, setComparePrice] = useState(existing?.comparePrice ?? 0)
  const [moq, setMoq] = useState(existing?.moq ?? data.settings.catalogueDefaults.defaultMOQ)
  const [manualAttrs, setManualAttrs] = useState<Record<string, string>>({})
  const [pendingDeselect, setPendingDeselect] = useState<{ attrId: string; valueId: string; name: string; usedByVariants: boolean } | null>(null)
  const attrImages = useAttributeImages(isEdit ? id : undefined, (valueId) => existing?.allowedAttributeValueIds.includes(valueId) ?? false)

  const category = data.categories.find((item) => item.id === categoryId)
  const categoryAttributes = useMemo(
    () => (category ? category.attributeIds.map((attrId) => data.attributes.find((item) => item.id === attrId)).filter((item): item is Attribute => Boolean(item)) : []),
    [category, data.attributes],
  )

  function toggleValue(attrId: string, valueId: string) {
    const selected = (selectedValueIds[attrId] ?? []).includes(valueId)
    const attr = data.attributes.find((item) => item.id === attrId)
    const value = attr?.values.find((item) => item.id === valueId)
    if (selected && attr && value && (attrImages.items[valueId]?.length ?? 0) > 0) {
      const key = attrKey(attr)
      const usedByVariants = draftVariants.some((variant) => variant.enabled && variant.existingId && variant.attributes[key] === value.value)
      setPendingDeselect({ attrId, valueId, name: value.value, usedByVariants })
      return
    }
    applyToggle(attrId, valueId)
  }

  function applyToggle(attrId: string, valueId: string) {
    setSelectedValueIds((prev) => {
      const current = prev[attrId] ?? []
      const next = current.includes(valueId) ? current.filter((item) => item !== valueId) : [...current, valueId]
      return { ...prev, [attrId]: next }
    })
  }

  function allowedValuesFor(attr: Attribute) {
    const ids = new Set(selectedValueIds[attr.id] ?? [])
    return attr.values.filter((value) => ids.has(value.id))
  }

  function generateVariants() {
    const dims = categoryAttributes
      .map((attr) => ({ attr, values: allowedValuesFor(attr) }))
      .filter((dim) => dim.values.length > 0)
    if (dims.length === 0) {
      showToast('Select at least one attribute value to generate variants', 'error')
      return
    }
    let combos: Record<string, string>[] = [{}]
    for (const dim of dims) {
      const next: Record<string, string>[] = []
      const key = attrKey(dim.attr)
      for (const combo of combos) {
        for (const value of dim.values) next.push({ ...combo, [key]: value.value })
      }
      combos = next
    }
    setDraftVariants(
      combos.map((attrs) => ({
        key: Object.values(attrs).join('-'),
        attributes: attrs,
        price: wholesalePrice || 0,
        stock: 0,
        enabled: true,
      })),
    )
    showToast(`${combos.length} combinations generated. Disable any that are not manufactured.`)
  }

  function addManualVariant() {
    const attributes: Record<string, string> = {}
    for (const attr of categoryAttributes) {
      const allowed = allowedValuesFor(attr)
      if (!allowed.length) continue
      const chosen = manualAttrs[attr.id] || allowed[0].value
      attributes[attrKey(attr)] = chosen
    }
    if (!Object.keys(attributes).length) {
      showToast('Enable product attribute values before adding a variant', 'error')
      return
    }
    const key = Object.values(attributes).join('-')
    if (draftVariants.some((item) => item.key === key && item.enabled)) {
      showToast('That combination is already in the list', 'error')
      return
    }
    setDraftVariants((prev) => [...prev, { key, attributes, price: wholesalePrice || 0, stock: 0, enabled: true }])
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files) return
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => {
        const form = new FormData(); form.append('file', file)
        return apiClient.post<{ objectKey: string; url: string; mimeType: string }>('/api/v1/media', form)
      }))
      setMedia((prev) => [
        ...prev,
        ...uploaded.map((item, i) => ({ id: item.objectKey, url: item.url, objectKey: item.objectKey, mimeType: item.mimeType, isPrimary: prev.length === 0 && i === 0 } as ProductMedia)),
      ])
    } catch { showToast('Image upload failed. Please retry.', 'error') }
  }

  const allowedAttributeValueIds = Object.values(selectedValueIds).flat()

  function canProceed() {
    if (step === 0) return Boolean(name.trim() && code.trim())
    if (step === 1) return Boolean(categoryId)
    if (step === 4) return wholesalePrice > 0 && moq > 0
    return true
  }

  /** Uploads photos that were staged client-side. Returns a comma list of failed values, or '' when all went fine. */
  async function flushAttributePhotos(productId: string) {
    const valueIds = categoryAttributes.filter((attr) => attr.supportsImages).flatMap((attr) => allowedValuesFor(attr).map((value) => value.id))
    const nameOf = (valueId: string) => data.attributes.flatMap((attr) => attr.values).find((value) => value.id === valueId)?.value ?? valueId
    const failures = await attrImages.flushStaged(productId, valueIds, nameOf)
    return failures.map((failure) => `${failure.name} (${failure.message})`).join(', ')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const productId = existing?.id ?? `prod-${Date.now()}`
      const attributeIds = categoryAttributes.map((item) => item.id)
      const product: Product = {
        id: productId,
        code,
        name,
        categoryId,
        description,
        media: media.length ? media : [{ id: 'media-fallback', url: category?.imageUrl ?? '', isPrimary: true }],
        attributeIds,
        allowedAttributeValueIds,
        wholesalePrice,
        comparePrice: comparePrice || undefined,
        moq,
        status: 'active',
        views: existing?.views ?? 0,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const variants: ProductVariant[] = draftVariants.filter((item) => item.enabled && !item.existingId).map((item, i) => ({
        id: `var-${productId}-${i}`,
        productId,
        sku: `${code}-${Object.values(item.attributes).map((part) => part.slice(0, 3).toUpperCase()).join('-')}`,
        attributes: item.attributes,
        price: item.price || wholesalePrice,
        stock: item.stock,
        reserved: 0,
        status: 'active',
        lowStockThreshold: 10,
      }))

      if (isEdit) {
        await updateProduct(productId, product)
        // images uploaded during this edit exist only in R2 until they are attached to the product
        for (const item of media.filter((m) => !persistedMediaIds.has(m.id) && m.objectKey)) {
          await apiClient.post(`/api/v1/products/${productId}/media`, { objectKey: item.objectKey, mimeType: item.mimeType ?? 'image/jpeg' })
        }
        for (const variant of variants) await addVariant({ ...variant, productId })
        const failures = await flushAttributePhotos(productId)
        if (failures) {
          showToast(`Product saved, but photos failed for ${failures}. Fix and save again.`, 'error')
          return
        }
        showToast('Product updated successfully')
        navigate(`/products/${productId}`)
        return
      }
      const createdId = await addProduct(product, variants)
      const failures = await flushAttributePhotos(createdId)
      if (failures) {
        showToast(`Product created, but photos failed for ${failures}. Open Edit to retry.`, 'error')
        navigate(`/products/${createdId}/edit`)
        return
      }
      showToast('Product created successfully')
      navigate(`/products/${createdId}`)
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not save product', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && !existing) return <Navigate to="/products" replace />

  return (
    <div className="mx-auto max-w-3xl space-y-6 overflow-x-hidden">
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
        {STEPS.map((label, i) => (
          <div key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-stone-900' : 'bg-stone-200'}`} />
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Product Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floral Rayon Straight Kurti" className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
            </Field>
            <Field label="Product Code">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. K-101" className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the product..." className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <Field label="Category">
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSelectedValueIds({}); setDraftVariants((prev) => prev.filter((item) => item.existingId)) }} className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm">
              <option value="">Select a category</option>
              {data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {!category && <p className="text-sm text-stone-400">Select a category first.</p>}
            {category && categoryAttributes.length === 0 && (
              <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">No attributes are configured for {category.name}. Configure them under Categories → {category.name}.</p>
            )}
            {categoryAttributes.map((attr) => (
              <div key={attr.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{attr.name}</p>
                {attr.values.length === 0 ? (
                  <p className="text-sm text-stone-500">No values exist for {attr.name}. Add values from Attributes.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((value) =>
                      attr.type === 'color' ? (
                        <ColorSwatch key={value.id} hex={value.hex} name={value.value} showLabel selected={(selectedValueIds[attr.id] ?? []).includes(value.id)} onClick={() => toggleValue(attr.id, value.id)} />
                      ) : (
                        <button
                          key={value.id}
                          type="button"
                          onClick={() => toggleValue(attr.id, value.id)}
                          className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${
                            (selectedValueIds[attr.id] ?? []).includes(value.id) ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          {value.value}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-stone-500">Add only the combinations you actually manufacture. Generating every combination is optional.</p>
            <div className="space-y-3 rounded-xl border border-stone-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Add a variant</p>
              {categoryAttributes.filter((attr) => allowedValuesFor(attr).length > 0).length === 0 && (
                <p className="text-sm text-stone-500">Enable attribute values in the previous step to add variants.</p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {categoryAttributes.filter((attr) => allowedValuesFor(attr).length > 0).map((attr) => (
                  <label key={attr.id} className="text-xs font-semibold text-stone-600">
                    {attr.name}
                    <select
                      value={manualAttrs[attr.id] ?? allowedValuesFor(attr)[0]?.value ?? ''}
                      onChange={(e) => setManualAttrs((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-800"
                    >
                      {allowedValuesFor(attr).map((value) => <option key={value.id} value={value.value}>{value.value}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" onClick={addManualVariant} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 text-sm font-semibold text-white">
                <Plus size={16} /> Add Variant
              </button>
            </div>
            <button type="button" onClick={generateVariants} className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50">
              Generate combinations (optional)
            </button>
            {draftVariants.length > 0 && (
              <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="sticky top-0 bg-stone-50">
                    <tr className="text-left text-xs font-semibold uppercase text-stone-400">
                      <th className="px-3 py-2">Combination</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Stock</th>
                      <th className="px-3 py-2">Keep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftVariants.map((variant, i) => (
                      <tr key={variant.key} className="border-t border-stone-100">
                        <td className="px-3 py-2 text-stone-700">{Object.values(variant.attributes).join(' / ')}</td>
                        <td className="px-3 py-2">
                          <input type="number" value={variant.price} onChange={(e) => setDraftVariants((prev) => prev.map((item, index) => index === i ? { ...item, price: Number(e.target.value) } : item))} className="h-10 w-24 rounded-lg border border-stone-200 px-2 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={variant.stock} onChange={(e) => setDraftVariants((prev) => prev.map((item, index) => index === i ? { ...item, stock: Number(e.target.value) } : item))} className="h-10 w-20 rounded-lg border border-stone-200 px-2 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={variant.enabled} onChange={(e) => setDraftVariants((prev) => prev.map((item, index) => index === i ? { ...item, enabled: e.target.checked } : item))} className="h-5 w-5" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <Field label="Wholesale Price (₹)">
              <input type="number" inputMode="decimal" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
            </Field>
            <Field label="Compare Price (₹, optional)">
              <input type="number" inputMode="decimal" value={comparePrice} onChange={(e) => setComparePrice(Number(e.target.value))} className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
            </Field>
            <Field label="MOQ (Minimum Order Quantity)">
              <input type="number" inputMode="numeric" value={moq} onChange={(e) => setMoq(Number(e.target.value))} className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 py-10 text-center hover:border-stone-400 hover:bg-stone-50">
              <UploadCloud size={26} className="text-stone-400" />
              <p className="text-sm font-medium text-stone-600">Drag & drop images, or tap to browse</p>
              <p className="text-xs text-stone-400">PNG, JPG up to 5MB each</p>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e.target.files)} />
            </label>
            {media.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {media.map((item) => (
                  <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200">
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                    {item.isPrimary && (
                      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Star size={9} fill="white" /> Primary
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      {!item.isPrimary && (
                        <button onClick={() => setMedia((prev) => prev.map((mediaItem) => ({ ...mediaItem, isPrimary: mediaItem.id === item.id })))} className="rounded-full bg-white p-1.5">
                          <Star size={13} />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Delete image"
                      data-testid="media-delete"
                      onClick={() => (persistedMediaIds.has(item.id) ? setDeletingMedia(item) : setMedia((prev) => prev.filter((mediaItem) => mediaItem.id !== item.id)))}
                      className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1.5 text-red-600 shadow hover:bg-white"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <AttributePhotos
            sections={categoryAttributes.map((attr) => ({ attr, values: allowedValuesFor(attr) }))}
            state={attrImages}
            isEdit={isEdit}
            isPersisted={(valueId) => existing?.allowedAttributeValueIds.includes(valueId) ?? false}
          />
        )}

        {step === 6 && (
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
              <p>{draftVariants.filter((item) => item.enabled).length} variants will be kept.</p>
              <p className="mt-1">{allowedAttributeValueIds.length} product-specific attribute values selected.</p>
              <p className="mt-1">{media.length} images uploaded.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pb-8">
        <button
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="h-11 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-600 disabled:opacity-40"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canProceed() && setStep((current) => current + 1)}
            disabled={!canProceed()}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button disabled={saving} onClick={handleSave} className="flex h-11 items-center gap-1.5 rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-40">
            <Check size={15} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Product'}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeselect)}
        danger
        title={`Remove ${pendingDeselect?.name ?? ''}?`}
        description={pendingDeselect?.usedByVariants
          ? `${pendingDeselect.name} has photos and is used by existing variants. Saving will be blocked until those variants are removed.`
          : `${pendingDeselect?.name ?? 'This value'} has photos. They will be deleted when you save this product.`}
        confirmLabel="Remove value"
        onCancel={() => setPendingDeselect(null)}
        onConfirm={() => {
          if (pendingDeselect) {
            attrImages.discardValue(pendingDeselect.valueId)
            applyToggle(pendingDeselect.attrId, pendingDeselect.valueId)
          }
          setPendingDeselect(null)
        }}
      />
      {deletingMedia && (
        <DeleteDialog
          open
          onClose={() => setDeletingMedia(null)}
          entityLabel="Image"
          collection="media"
          id={deletingMedia.id}
          deletePath={`/api/v1/products/${id}/media/${deletingMedia.id}`}
          onDeleted={async () => { setMedia((prev) => prev.filter((m) => m.id !== deletingMedia.id)); await refreshData() }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-stone-600">{label}</label>
      {children}
    </div>
  )
}
