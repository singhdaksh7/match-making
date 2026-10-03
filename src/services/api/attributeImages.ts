import type { AttributeValueImage } from '@/types'
import { apiClient } from './client'

export const ATTR_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const ATTR_IMAGE_MAX_PER_REQUEST = 10
export const ATTR_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const base = (productId: string, valueId: string) => `/api/v1/products/${productId}/attribute-values/${valueId}/images`

function toImage(x: any, index: number): AttributeValueImage {
  return { id: x.id, url: x.url, altText: x.altText ?? undefined, sortOrder: x.sortOrder ?? index }
}

/** Returns a user-facing problem with the file, or null if it is acceptable. */
export function validateImageFile(file: File): string | null {
  if (!ATTR_IMAGE_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG, WebP or GIF images are allowed.`
  if (file.size > ATTR_IMAGE_MAX_BYTES) return `${file.name}: larger than ${ATTR_IMAGE_MAX_BYTES / 1024 / 1024} MB.`
  return null
}

/** Group images of a backend admin product (allowedValues[].images) by attribute value id. */
export function imagesFromProduct(product: any): Record<string, AttributeValueImage[]> {
  const out: Record<string, AttributeValueImage[]> = {}
  for (const row of product?.allowedValues ?? []) {
    const images = (row.images ?? []).map(toImage).sort((a: AttributeValueImage, b: AttributeValueImage) => a.sortOrder - b.sortOrder)
    if (images.length) out[row.attributeValueId] = images
  }
  return out
}

export async function fetchProductAttributeImages(productId: string) {
  return imagesFromProduct(await apiClient.get<any>(`/api/v1/products/${productId}`))
}

/** Uploads in chunks of at most 10 files per request. */
export async function uploadAttributeImages(productId: string, valueId: string, files: File[]): Promise<AttributeValueImage[]> {
  const uploaded: AttributeValueImage[] = []
  for (let i = 0; i < files.length; i += ATTR_IMAGE_MAX_PER_REQUEST) {
    const form = new FormData()
    for (const file of files.slice(i, i + ATTR_IMAGE_MAX_PER_REQUEST)) form.append('files', file)
    const result = await apiClient.post<any[]>(base(productId, valueId), form)
    uploaded.push(...result.map(toImage))
  }
  return uploaded
}

export const deleteAttributeImage = (productId: string, valueId: string, imageId: string) =>
  apiClient.delete<void>(`${base(productId, valueId)}/${imageId}`)

export async function reorderAttributeImages(productId: string, valueId: string, imageIds: string[]) {
  const result = await apiClient.put<any[]>(`${base(productId, valueId)}/order`, { imageIds })
  return result.map(toImage)
}
