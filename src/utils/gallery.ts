import type { Product, ProductVariant } from '@/types'

export interface GalleryImage {
  url: string
  alt: string
  source: 'variant' | 'attribute' | 'general'
}

export interface GalleryContext {
  attributeKey: string
  value: string
}

/**
 * Deterministic public gallery. Image priority (highest first):
 *   1. the exactly selected variant's own photos (VariantMedia)
 *   2. photos of the most recently chosen image-capable attribute value (e.g. Color -> Blue)
 *   3. the product's general photos
 * Lower-priority photos stay available as trailing thumbnails; photos of unselected values never appear.
 *
 * Context = the most recently selected value of an image-capable attribute (supportsImages) that has images.
 * - Selections of non-image attributes (e.g. Size) are ignored, so they never change the gallery.
 * - If the latest image-capable selection has no images we fall back to the previous image-capable
 *   selection that does, then to general product photos.
 * - `order` lists attribute keys oldest -> newest by when the shopper picked them. Attributes with a single
 *   possible value that were never explicitly picked count as selected "by default" (lowest priority).
 *
 * Layout choice: attribute-value photos come first; the general product photos stay available as trailing
 * thumbnails (labelled source "general") so nothing is hidden from the shopper. Photos of unselected or
 * unrelated values are never included.
 */
export function resolveGallery(
  product: Product,
  selections: Record<string, string | null>,
  order: string[],
  defaults: Record<string, string> = {},
  /** Photos of the variant that the current selections identify exactly (undefined until a full variant is picked). */
  exactVariant?: Pick<ProductVariant, 'id' | 'images'> | null,
): { context: GalleryContext | null; images: GalleryImage[] } {
  const base = resolveAttributeGallery(product, selections, order, defaults)
  const own = exactVariant?.images ?? []
  if (!exactVariant || own.length === 0) return base
  const variantImages: GalleryImage[] = own.map((image) => ({ url: image.url, alt: product.name, source: 'variant' as const }))
  const seen = new Set(variantImages.map((image) => image.url))
  return { context: { attributeKey: 'variant', value: exactVariant.id }, images: [...variantImages, ...base.images.filter((image) => !seen.has(image.url))] }
}

function resolveAttributeGallery(
  product: Product,
  selections: Record<string, string | null>,
  order: string[],
  defaults: Record<string, string>,
): { context: GalleryContext | null; images: GalleryImage[] } {
  const general: GalleryImage[] = product.media.map((m) => ({ url: m.url, alt: product.name, source: 'general' }))
  const imageKeys = new Set(product.imageAttributeKeys ?? [])
  const groups = product.attributeImages ?? []

  const candidates: { key: string; value: string }[] = []
  for (const key of [...order].reverse()) {
    const value = selections[key]
    if (value && imageKeys.has(key)) candidates.push({ key, value })
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (imageKeys.has(key) && !selections[key]) candidates.push({ key, value })
  }

  for (const candidate of candidates) {
    const group = groups.find((g) => g.attributeKey === candidate.key && g.value === candidate.value && g.images.length > 0)
    if (!group) continue
    const images: GalleryImage[] = [...group.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({ url: image.url, alt: image.altText || `${product.name} - ${group.value}`, source: 'attribute' as const }))
    return { context: { attributeKey: candidate.key, value: candidate.value }, images: [...images, ...general] }
  }
  return { context: null, images: general }
}

/** One representative photo for a specific variant (cart lines, summaries), using the same priority as the gallery. */
export function variantThumbnail(product: Product, variant: Pick<ProductVariant, 'attributes' | 'images'>): string {
  const own = variant.images?.[0]?.url
  if (own) return own
  const imageKeys = new Set(product.imageAttributeKeys ?? [])
  for (const key of [...imageKeys].sort()) {
    const value = variant.attributes[key]
    const group = value ? (product.attributeImages ?? []).find((g) => g.attributeKey === key && g.value === value && g.images.length > 0) : undefined
    if (group) return [...group.images].sort((a, b) => a.sortOrder - b.sortOrder)[0].url
  }
  return product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url ?? ''
}
