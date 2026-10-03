export interface StorageUploadInput { key: string; body: Buffer; contentType: string }

/** Minimal object-storage contract. Keys are stable, server-generated, relative keys (never URLs or paths). */
export interface StorageProvider {
  readonly name: string
  upload(input: StorageUploadInput): Promise<void>
  delete(key: string): Promise<void>
  exists?(key: string): Promise<boolean>
  getPublicUrl(key: string): string
}

/** Thrown by providers on any backend failure. Messages never contain credentials. */
export class StorageError extends Error {
  constructor(message: string, public readonly operation: string, public readonly causeCode?: string) { super(message); this.name = 'StorageError' }
}

/** Rejects keys that could escape the storage root or are not plain relative keys. */
export function assertSafeKey(key: string) {
  if (typeof key !== 'string' || !key || key.length > 512 || key.startsWith('/') || key.includes(String.fromCharCode(92)) || key.includes(String.fromCharCode(0))) throw new StorageError('Invalid storage key', 'validate')
  for (const segment of key.split('/')) if (!segment || segment === '.' || segment === '..') throw new StorageError('Invalid storage key', 'validate')
}

/** Encodes each path segment of a key and joins it to a base URL/prefix without duplicate or missing slashes. */
export function joinUrl(base: string, key: string) {
  const encoded = key.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `${base.replace(/\/+$/, '')}/${encoded}`
}
