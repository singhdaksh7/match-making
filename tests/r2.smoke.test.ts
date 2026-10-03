// Optional live Cloudflare R2 smoke test. NEVER runs by default.
//   R2_SMOKE=1 UPLOAD_PROVIDER=r2 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//   R2_BUCKET_NAME=... R2_PUBLIC_BASE_URL=... node --import tsx --test tests/r2.smoke.test.ts
// Writes and deletes a single object under business/_smoke/. Not part of `npm run test:backend`.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { test } from 'node:test'
import { createStorageProvider } from '../backend/src/storage/index.js'

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL']
const enabled = process.env.R2_SMOKE === '1' && process.env.UPLOAD_PROVIDER === 'r2' && required.every((name) => process.env[name])

test('R2 smoke: upload, exists, delete', { skip: enabled ? false : 'set R2_SMOKE=1 and R2 credentials to run' }, async () => {
  const provider = createStorageProvider()
  const key = `business/_smoke/${crypto.randomUUID()}.png`
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await provider.upload({ key, body: png, contentType: 'image/png' })
  try { assert.equal(await provider.exists?.(key), true) } finally { await provider.delete(key) }
  assert.equal(await provider.exists?.(key), false)
})
