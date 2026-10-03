import fs from 'node:fs/promises'
import path from 'node:path'
import { assertSafeKey, joinUrl, StorageError, type StorageProvider, type StorageUploadInput } from './types.js'

export const LOCAL_URL_PREFIX = '/api/v1/media'

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local'
  private readonly root: string
  constructor(uploadDir: string) { this.root = path.resolve(uploadDir) }
  resolve(key: string) {
    assertSafeKey(key)
    const destination = path.resolve(this.root, key)
    if (!destination.startsWith(this.root + path.sep)) throw new StorageError('Invalid storage key', 'validate')
    return destination
  }
  async upload({ key, body }: StorageUploadInput) {
    const destination = this.resolve(key)
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, body, { flag: 'wx' })
    } catch (error) { throw new StorageError('Local storage write failed', 'upload', (error as { code?: string }).code) }
  }
  async delete(key: string) {
    const target = this.resolve(key)
    try { await fs.unlink(target) } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return
      throw new StorageError('Local storage delete failed', 'delete', (error as { code?: string }).code)
    }
  }
  async exists(key: string) { try { await fs.access(this.resolve(key)); return true } catch { return false } }
  getPublicUrl(key: string) { return joinUrl(LOCAL_URL_PREFIX, key) }
}
