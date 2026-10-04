import { ChevronDown, ChevronLeft, ChevronRight, ImageOff, Loader2, Star, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteAttributeImage, fetchProductAttributeImages, reorderAttributeImages, uploadAttributeImages, validateImageFile,
} from '@/services/api/attributeImages'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Attribute, AttributeValue } from '@/types'

/** One thumbnail. `file` is set while the image is only staged locally (product / value not saved yet). */
export interface AttrImageItem {
  id: string
  url: string
  file?: File
}

export interface AttributePhotoSection {
  attr: Attribute
  values: AttributeValue[]
}

/**
 * State for attribute-value photos of the product form.
 * - A value that already exists on the saved product uploads immediately (persisted).
 * - Anything else (new product, or a value just ticked and not yet saved) is staged client-side with a
 *   local preview and uploaded by flushStaged() right after the product has been saved.
 */
export function useAttributeImages(productId: string | undefined, isPersisted: (valueId: string) => boolean) {
  const [items, setItems] = useState<Record<string, AttrImageItem[]>>({})
  const [busy, setBusy] = useState<Record<string, string | null>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(Boolean(productId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const itemsRef = useRef(items)
  const persistedRef = useRef(isPersisted)
  useEffect(() => { itemsRef.current = items; persistedRef.current = isPersisted })

  const setBusyFor = (valueId: string, label: string | null) => setBusy((prev) => ({ ...prev, [valueId]: label }))
  const setErrorFor = (valueId: string, message: string | null) => setErrors((prev) => ({ ...prev, [valueId]: message }))

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    fetchProductAttributeImages(productId)
      .then((grouped) => {
        if (cancelled) return
        setItems((prev) => {
          const next = { ...prev }
          for (const [valueId, images] of Object.entries(grouped)) {
            next[valueId] = [...images.map((image) => ({ id: image.id, url: image.url })), ...(prev[valueId] ?? []).filter((item) => item.file)]
          }
          return next
        })
      })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load attribute photos.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId])

  const addFiles = useCallback(async (valueId: string, list: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const problems = files.map(validateImageFile).filter((item): item is string => Boolean(item))
    const valid = files.filter((file) => !validateImageFile(file))
    setErrorFor(valueId, problems.length ? problems.join(' ') : null)
    if (!valid.length) return
    if (productId && persistedRef.current(valueId)) {
      setBusyFor(valueId, `Uploading ${valid.length} image${valid.length > 1 ? 's' : ''}…`)
      try {
        const uploaded = await uploadAttributeImages(productId, valueId, valid)
        setItems((prev) => ({ ...prev, [valueId]: [...(prev[valueId] ?? []), ...uploaded.map((image) => ({ id: image.id, url: image.url }))] }))
      } catch (error) {
        setErrorFor(valueId, error instanceof Error ? error.message : 'Upload failed. Please retry.')
      } finally { setBusyFor(valueId, null) }
      return
    }
    setItems((prev) => ({ ...prev, [valueId]: [...(prev[valueId] ?? []), ...valid.map((file) => ({ id: `staged-${crypto.randomUUID()}`, url: URL.createObjectURL(file), file }))] }))
  }, [productId])

  const remove = useCallback(async (valueId: string, item: AttrImageItem) => {
    if (item.file) {
      URL.revokeObjectURL(item.url)
      setItems((prev) => ({ ...prev, [valueId]: (prev[valueId] ?? []).filter((entry) => entry.id !== item.id) }))
      return
    }
    if (!productId) return
    setBusyFor(valueId, 'Deleting…'); setErrorFor(valueId, null)
    try {
      await deleteAttributeImage(productId, valueId, item.id)
      setItems((prev) => ({ ...prev, [valueId]: (prev[valueId] ?? []).filter((entry) => entry.id !== item.id) }))
    } catch (error) {
      setErrorFor(valueId, error instanceof Error ? error.message : 'Could not delete image.')
    } finally { setBusyFor(valueId, null) }
  }, [productId])

  const move = useCallback(async (valueId: string, index: number, delta: -1 | 1) => {
    const current = itemsRef.current[valueId] ?? []
    const target = index + delta
    if (target < 0 || target >= current.length) return
    const next = [...current]
    const moved = next[index]
    next[index] = next[target]
    next[target] = moved
    const hasSaved = next.some((entry) => !entry.file)
    if (!hasSaved || !productId) {
      setItems((prev) => ({ ...prev, [valueId]: next }))
      return
    }
    setBusyFor(valueId, 'Saving order…'); setErrorFor(valueId, null)
    try {
      const ordered = await reorderAttributeImages(productId, valueId, next.map((entry) => entry.id))
      setItems((prev) => ({ ...prev, [valueId]: ordered.map((image) => ({ id: image.id, url: image.url })) }))
    } catch (error) {
      setErrorFor(valueId, error instanceof Error ? error.message : 'Could not reorder images.')
    } finally { setBusyFor(valueId, null) }
  }, [productId])

  /** Drops staged files held for a value (used when the value is deselected). */
  const discardValue = useCallback((valueId: string) => {
    for (const item of itemsRef.current[valueId] ?? []) if (item.file) URL.revokeObjectURL(item.url)
    setItems((prev) => ({ ...prev, [valueId]: (prev[valueId] ?? []).filter((item) => !item.file) }))
    setErrors((prev) => ({ ...prev, [valueId]: null }))
  }, [])

  /** Uploads staged files for the given values to a saved product. Never throws; returns the failures. */
  const flushStaged = useCallback(async (savedProductId: string, valueIds: string[], nameOf: (valueId: string) => string) => {
    const failures: { valueId: string; name: string; message: string }[] = []
    for (const valueId of valueIds) {
      const staged = (itemsRef.current[valueId] ?? []).filter((item) => item.file)
      if (!staged.length) continue
      setBusyFor(valueId, `Uploading ${staged.length} image${staged.length > 1 ? 's' : ''}…`)
      try {
        await uploadAttributeImages(savedProductId, valueId, staged.map((item) => item.file!))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed.'
        setErrorFor(valueId, message)
        failures.push({ valueId, name: nameOf(valueId), message })
      } finally { setBusyFor(valueId, null) }
    }
    return failures
  }, [])

  return { items, busy, errors, loading, loadError, addFiles, remove, move, discardValue, flushStaged }
}

export type AttributeImagesState = ReturnType<typeof useAttributeImages>

interface Props {
  sections: AttributePhotoSection[]
  state: AttributeImagesState
  isPersisted: (valueId: string) => boolean
  isEdit: boolean
}

export function AttributePhotos({ sections, state, isPersisted, isEdit }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Only attributes that opted in (supportsImages) and have at least one value picked for this product get a section.
  const visible = sections.filter((section) => section.attr.supportsImages === true && section.values.length > 0)
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 border-t border-stone-100 pt-5" data-testid="attr-photos-area">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Attribute photos</h3>
        <p className="text-xs text-stone-500">Photos shown to customers when they pick that value. JPG, PNG, WebP or GIF up to 5 MB each.</p>
      </div>
      {state.loading && <p className="flex items-center gap-2 text-xs text-stone-500"><Loader2 size={13} className="animate-spin" /> Loading saved photos…</p>}
      {state.loadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{state.loadError}</p>}
      {visible.map(({ attr, values }) => {
        const isCollapsed = collapsed[attr.id] ?? false
        return (
          <section key={attr.id} data-testid={`attr-images-section-${attr.name}`} className="rounded-xl border border-stone-200">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((prev) => ({ ...prev, [attr.id]: !isCollapsed }))}
              className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left"
            >
              <span className="text-sm font-semibold text-stone-800">{attr.name} photos</span>
              <ChevronDown size={16} className={`text-stone-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 gap-3 border-t border-stone-100 p-3">
                {values.map((value) => (
                  <ValueCard key={value.id} attrName={attr.name} value={value} state={state} persisted={isEdit && isPersisted(value.id)} isEdit={isEdit} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function ValueCard({ attrName, value, state, persisted, isEdit }: { attrName: string; value: AttributeValue; state: AttributeImagesState; persisted: boolean; isEdit: boolean }) {
  const list = state.items[value.id] ?? []
  const [confirmItem, setConfirmItem] = useState<AttrImageItem | null>(null)
  const busy = state.busy[value.id]
  const error = state.errors[value.id]
  const inputId = `attr-image-input-${attrName}-${value.value}`.replace(/\s+/g, '-')
  return (
    <div data-testid={`attr-image-card-${value.value}`} className="min-w-0 rounded-xl bg-stone-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-800">
          {value.value} <span data-testid={`attr-image-count-${value.value}`} className="font-normal text-stone-400">· {list.length} {list.length === 1 ? 'image' : 'images'}</span>
        </p>
        <label
          htmlFor={inputId}
          className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 text-xs font-semibold text-white ${busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          <UploadCloud size={14} /> + Upload images
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          data-testid={`attr-image-upload-${value.value}`}
          className="sr-only"
          onChange={(e) => { void state.addFiles(value.id, e.target.files); e.target.value = '' }}
        />
      </div>
      {!persisted && list.some((item) => item.file) && (
        <p className="mt-2 text-xs text-amber-700">{isEdit ? 'These photos will upload when you save the product.' : 'These photos will upload right after the product is saved.'}</p>
      )}
      {busy && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-stone-600"><Loader2 size={13} className="animate-spin" /> {busy}</p>}
      {error && <p role="alert" data-testid={`attr-image-error-${value.value}`} className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {list.length === 0 && !busy ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500">
          <ImageOff size={16} /> No {value.value} photos yet. Customers will see the general product photos.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((item, index) => (
            <div key={item.id} data-testid={`attr-image-thumb-${value.value}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="relative aspect-square">
                <img src={item.url} alt={`${value.value} photo ${index + 1}`} className="h-full w-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Star size={9} fill="white" /> Primary
                  </span>
                )}
                {item.file && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Not uploaded</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-1">
                <button type="button" aria-label="Move left" data-testid="attr-image-move-left" disabled={index === 0 || Boolean(busy)} onClick={() => void state.move(value.id, index, -1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" aria-label="Delete image" data-testid="attr-image-delete" disabled={Boolean(busy)} onClick={() => (item.file ? void state.remove(value.id, item) : setConfirmItem(item))} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30">
                  <Trash2 size={15} />
                </button>
                <button type="button" aria-label="Move right" data-testid="attr-image-move-right" disabled={index === list.length - 1 || Boolean(busy)} onClick={() => void state.move(value.id, index, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmItem)}
        danger
        title="Delete image?"
        description={`This ${attrName} ${value.value} image will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete image"
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => { const item = confirmItem; setConfirmItem(null); if (item) void state.remove(value.id, item) }}
      />
    </div>
  )
}
