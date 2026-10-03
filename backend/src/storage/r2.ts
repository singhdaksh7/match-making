import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { assertSafeKey, joinUrl, StorageError, type StorageProvider, type StorageUploadInput } from './types.js'

export interface R2Options {
  accountId?: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
  endpoint?: string
  /** Injectable for tests; anything exposing send(). */
  client?: { send(command: unknown): Promise<unknown> }
}

export class CloudflareR2StorageProvider implements StorageProvider {
  readonly name = 'r2'
  private readonly client: { send(command: unknown): Promise<unknown> }
  private readonly bucket: string
  private readonly publicBaseUrl: string
  constructor(options: R2Options) {
    this.bucket = options.bucket
    this.publicBaseUrl = options.publicBaseUrl
    this.client = options.client ?? new S3Client({
      region: 'auto',
      endpoint: options.endpoint ?? `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 20_000 },
    })
  }
  private fail(operation: string, error: unknown): never {
    const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    // Only non-sensitive diagnostics are kept: no messages (they can echo endpoints), no credentials.
    throw new StorageError('Object storage request failed', operation, [e?.name ?? e?.Code, e?.$metadata?.httpStatusCode].filter(Boolean).join(':') || undefined)
  }
  async upload({ key, body, contentType }: StorageUploadInput) {
    assertSafeKey(key)
    try { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length, CacheControl: 'public, max-age=31536000, immutable' })) } catch (error) { this.fail('upload', error) }
  }
  async delete(key: string) {
    assertSafeKey(key)
    try { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })) } catch (error) { this.fail('delete', error) }
  }
  async exists(key: string) {
    assertSafeKey(key)
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); return true } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return false
      this.fail('exists', error)
    }
  }
  getPublicUrl(key: string) { return joinUrl(this.publicBaseUrl, key) }
}
