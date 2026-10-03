import crypto from 'node:crypto'
import { config } from '../config.js'
import { HttpError } from '../http.js'
import { LocalStorageProvider } from './local.js'
import { CloudflareR2StorageProvider } from './r2.js'
import { StorageError, type StorageProvider } from './types.js'

export type { StorageProvider } from './types.js'
export { StorageError } from './types.js'

type StorageConfig = Pick<typeof config, 'uploadProvider' | 'uploadDir' | 'r2'>

/** Builds the provider for a config. Fails fast with a clear message (names of missing variables only, never values). */
export function createStorageProvider(c: StorageConfig = config): StorageProvider {
  if (c.uploadProvider === 'local') return new LocalStorageProvider(c.uploadDir)
  if (c.uploadProvider === 'r2') {
    const required = { R2_ACCOUNT_ID: c.r2.accountId, R2_ACCESS_KEY_ID: c.r2.accessKeyId, R2_SECRET_ACCESS_KEY: c.r2.secretAccessKey, R2_BUCKET_NAME: c.r2.bucket, R2_PUBLIC_BASE_URL: c.r2.publicBaseUrl }
    const missing = Object.entries(required).filter(([, v]) => !v?.trim()).map(([k]) => k)
    if (missing.length) throw new Error(`UPLOAD_PROVIDER=r2 requires these environment variables: ${missing.join(', ')}`)
    if (!/^https?:\/\//.test(c.r2.publicBaseUrl!)) throw new Error('R2_PUBLIC_BASE_URL must be an absolute http(s) URL')
    return new CloudflareR2StorageProvider({ accountId: c.r2.accountId, accessKeyId: c.r2.accessKeyId!, secretAccessKey: c.r2.secretAccessKey!, bucket: c.r2.bucket!, publicBaseUrl: c.r2.publicBaseUrl!, endpoint: c.r2.endpoint || undefined })
  }
  throw new Error(`Unsupported UPLOAD_PROVIDER "${c.uploadProvider}" (expected "local" or "r2")`)
}

let current: StorageProvider | undefined
/** Call once at process start so a bad storage configuration stops the server immediately. */
export function initStorage() { current = createStorageProvider(); return current }
export function getStorage() { return current ??= createStorageProvider() }
/** Test hook: inject a fake provider (pass undefined to reset to the configured one). */
export function setStorageProvider(provider: StorageProvider | undefined) { current = provider }

export const publicUrl = (key: string) => getStorage().getPublicUrl(key)

// ---- image validation ----
export const IMAGE_EXTENSIONS: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
export const allowedMime = new Set(Object.keys(IMAGE_EXTENSIONS))

/** Detects the real image type from magic bytes; undefined when it is not an allowed image. */
export function sniffImageType(b: Buffer): string | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return undefined
}

/** Throws 400 unless the buffer is an allowed image whose real type matches the declared MIME. */
export function assertImageFile(file: { mimetype: string; buffer: Buffer; size?: number }) {
  const detected = sniffImageType(file.buffer)
  if (!allowedMime.has(file.mimetype) || !detected || detected !== file.mimetype) throw new HttpError(400, 'Only JPEG, PNG, WebP or GIF images are accepted, and the file content must match its type', 'VALIDATION_ERROR')
}

// ---- key generation (server-generated only; original file names are never used) ----
const ext = (mime: string) => IMAGE_EXTENSIONS[mime]
export const generalMediaKey = (businessId: string, productId: string | undefined, mime: string) => `business/${businessId}/products/${productId ?? '_staged'}/general/${crypto.randomUUID()}${ext(mime)}`
export const attributeImageKey = (businessId: string, productId: string, attributeValueId: string, mime: string) => `business/${businessId}/products/${productId}/attributes/${attributeValueId}/${crypto.randomUUID()}${ext(mime)}`
/** A client-submitted key may only point into the caller's own tenant prefix (new-style or legacy). */
export function isOwnedKey(businessId: string, key: string) {
  if (typeof key !== 'string' || key.includes('..') || key.includes(String.fromCharCode(92)) || key.startsWith('/') || key.includes('//')) return false
  return key.startsWith(`business/${businessId}/`) || key.startsWith(`${businessId}/`)
}

// ---- upload / delete with the documented failure semantics ----
const unavailable = () => new HttpError(502, 'Image storage is temporarily unavailable. Please try again.', 'STORAGE_UNAVAILABLE')
function logStorageFailure(operation: string, key: string, error: unknown) {
  const e = error as StorageError
  console.error(`[storage] ${operation} failed for key "${key}"${e?.causeCode ? ` (${e.causeCode})` : ''}`)
}

/** Uploads; on provider failure nothing is persisted and a generic 502 STORAGE_UNAVAILABLE is raised. */
export async function saveImage(input: { key: string; body: Buffer; contentType: string }) {
  try { await getStorage().upload(input) } catch (error) { logStorageFailure('upload', input.key, error); throw unavailable() }
  return input.key
}

/** Best-effort delete: failures are logged (no secrets) and leave an orphan object; never throws. */
export async function deleteImageFiles(keys: string[]) {
  for (const key of new Set(keys)) {
    try { await getStorage().delete(key) } catch (error) { logStorageFailure('delete', key, error) }
  }
}
