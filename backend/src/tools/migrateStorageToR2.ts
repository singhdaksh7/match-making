/**
 * One-off utility: copies legacy local uploads (ProductMedia / VariantMedia rows) into the configured object
 * storage (R2).
 *
 *   node dist-tools/backend/src/tools/migrateStorageToR2.js [--dry-run] [--verify-urls] [--rewrite-keys [--delete-local]]
 *
 * DEFAULT = MIRROR MODE (zero-downtime cutover): every legacy object is copied to R2 under the SAME key it has in
 * the database (`<businessId>/<uuid>.ext`) and NO database rows are written. The old/local system keeps working
 * untouched, and once UPLOAD_PROVIDER=r2 is switched on, `R2_PUBLIC_BASE_URL + key` already resolves. Re-running
 * is idempotent (objects that already exist in R2 are skipped).
 *   --verify-urls   after copying, HTTP-check the public URL of EVERY row (status 200; size must match the local file)
 *   --dry-run       report only; nothing is uploaded or written
 *   --rewrite-keys  OPTIONAL later clean-up: copy to new-style keys (business/<id>/products/<id>/general/<uuid>) and
 *                   rewrite the DB rows. Do NOT run this before the cutover: rows would point at keys the old
 *                   system cannot serve. Only with this flag is --delete-local honoured.
 *
 * Requires UPLOAD_PROVIDER=r2 plus the R2_* variables, and UPLOAD_DIR pointing at the old local files.
 * Rows whose key starts with "business/" are already new-style and are only existence-checked. Never prints
 * credentials. Not wired into prisma migrate.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { IMAGE_EXTENSIONS, sniffImageType } from '../storage/index.js'
import { assertSafeKey, type StorageProvider } from '../storage/types.js'

export interface MigrationOptions {
  prisma: PrismaClient; target: StorageProvider; sourceDir: string; dryRun?: boolean
  /** Copy to new-style keys and rewrite DB rows (default: mirror the existing keys, no DB writes). */
  rewriteKeys?: boolean
  /** Only honoured together with rewriteKeys. */
  deleteLocal?: boolean
  /** HTTP-check every row's public URL after copying. */
  verifyUrls?: boolean
  fetchFn?: (url: string, init?: { method: string }) => Promise<{ status: number; headers: { get(name: string): string | null } }>
  log?: (line: string) => void
}
export interface MigrationReport { scanned: number; migrated: number; skipped: number; failed: number; verified: number; failures: string[] }

const MIME_BY_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
const isNewStyle = (key: string) => key.startsWith('business/')

interface Row { kind: 'ProductMedia' | 'VariantMedia'; id: string; objectKey: string; businessId: string; productId: string }

export async function migrateStorage(o: MigrationOptions): Promise<MigrationReport> {
  const log = o.log ?? (() => {})
  const root = path.resolve(o.sourceDir)
  const report: MigrationReport = { scanned: 0, migrated: 0, skipped: 0, failed: 0, verified: 0, failures: [] }
  const rows: Row[] = [
    ...(await o.prisma.productMedia.findMany({ include: { product: { select: { businessId: true } } } })).map((r) => ({ kind: 'ProductMedia' as const, id: r.id, objectKey: r.objectKey, businessId: r.product.businessId, productId: r.productId })),
    ...(await o.prisma.variantMedia.findMany({ include: { variant: { select: { productId: true, product: { select: { businessId: true } } } } } })).map((r) => ({ kind: 'VariantMedia' as const, id: r.id, objectKey: r.objectKey, businessId: r.variant.product.businessId, productId: r.variant.productId })),
  ]
  const fail = (row: Row, why: string) => { report.failed++; report.failures.push(`${row.kind} ${row.id}: ${why}`); log(`FAIL ${row.kind} ${row.id}: ${why}`) }

  for (const row of rows) {
    report.scanned++
    if (isNewStyle(row.objectKey)) {
      if (o.target.exists && !o.dryRun && !(await o.target.exists(row.objectKey).catch(() => false))) { fail(row, 'already has a new-style key but the object is missing in storage'); continue }
      report.skipped++; continue
    }
    const source = path.resolve(root, row.objectKey)
    if (!source.startsWith(root + path.sep)) { fail(row, 'key escapes the upload directory'); continue }
    if (!o.rewriteKeys && !o.dryRun && o.target.exists && (await o.target.exists(row.objectKey).catch(() => false))) { report.skipped++; log(`SKIP ${row.kind} ${row.id}: already in storage`); continue }
    let body: Buffer
    try { body = await fs.readFile(source) } catch { fail(row, 'local file not found or unreadable'); continue }
    const mime = sniffImageType(body) ?? MIME_BY_EXT[path.extname(row.objectKey).toLowerCase()]
    if (!mime || !IMAGE_EXTENSIONS[mime]) { fail(row, 'not a supported image'); continue }
    if (!o.rewriteKeys) {
      // MIRROR MODE: same key in R2, database untouched.
      const key = row.objectKey
      try { assertSafeKey(key) } catch { fail(row, 'unsafe key'); continue }
      if (o.dryRun) { log(`DRY-RUN ${row.kind} ${row.id}: mirror ${key}`); report.migrated++; continue }
      try {
        if (o.target.exists && (await o.target.exists(key))) { report.skipped++; log(`SKIP ${row.kind} ${row.id}: already in storage`); continue }
        await o.target.upload({ key, body, contentType: mime })
        if (o.target.exists && !(await o.target.exists(key))) throw new Error('verification failed')
      } catch { fail(row, 'upload failed'); continue }
      report.migrated++; log(`OK ${row.kind} ${row.id}: mirrored ${key}`)
      continue
    }
    const newKey = `business/${row.businessId}/products/${row.productId}/general/${crypto.randomUUID()}${IMAGE_EXTENSIONS[mime]}`
    if (o.dryRun) { log(`DRY-RUN ${row.kind} ${row.id}: ${row.objectKey} -> ${newKey}`); report.migrated++; continue }
    try {
      await o.target.upload({ key: newKey, body, contentType: mime })
      if (o.target.exists && !(await o.target.exists(newKey))) throw new Error('verification failed')
    } catch { fail(row, 'upload failed'); await o.target.delete(newKey).catch(() => {}); continue }
    try {
      const data = { objectKey: newKey, url: o.target.getPublicUrl(newKey) }
      if (row.kind === 'ProductMedia') await o.prisma.productMedia.update({ where: { id: row.id }, data: { ...data, sizeBytes: body.length, mimeType: mime } })
      else await o.prisma.variantMedia.update({ where: { id: row.id }, data })
    } catch { fail(row, 'database update failed (uploaded object removed)'); await o.target.delete(newKey).catch(() => {}); continue }
    report.migrated++
    log(`OK ${row.kind} ${row.id}: ${row.objectKey} -> ${newKey}`)
    if (o.deleteLocal) await fs.unlink(source).catch(() => log(`WARN could not delete local file for ${row.kind} ${row.id}`))
  }

  if (o.verifyUrls && !o.dryRun) {
    const doFetch = o.fetchFn ?? ((url: string, init?: { method: string }) => fetch(url, { ...init, redirect: 'follow' }))
    for (const row of rows) {
      let key = row.objectKey
      if (o.rewriteKeys) {
        const current = await (row.kind === 'ProductMedia' ? o.prisma.productMedia.findUnique({ where: { id: row.id } }) : o.prisma.variantMedia.findUnique({ where: { id: row.id } }))
        if (!current) continue
        key = current.objectKey
      }
      const url = o.target.getPublicUrl(key)
      try {
        const res = await doFetch(url, { method: 'HEAD' })
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
        const local = await fs.stat(path.resolve(root, row.objectKey)).catch(() => undefined)
        const length = Number(res.headers.get('content-length'))
        if (local && length && length !== local.size) throw new Error(`size mismatch (public ${length} vs local ${local.size})`)
        report.verified++
      } catch (error) { fail(row, `public URL check failed for ${key}: ${(error as Error).message}`) }
    }
  }
  return report
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const unknown = [...args].filter((a) => !['--dry-run', '--delete-local', '--rewrite-keys', '--verify-urls'].includes(a))
  if (unknown.length) { console.error(`Unknown option(s): ${unknown.join(', ')}`); process.exit(2) }
  if (args.has('--delete-local') && !args.has('--rewrite-keys')) { console.error('--delete-local is only allowed together with --rewrite-keys (never during the first mirror pass).'); process.exit(2) }
  const { config } = await import('../config.js')
  if (config.uploadProvider !== 'r2') { console.error('UPLOAD_PROVIDER must be "r2" to run this migration.'); process.exit(2) }
  const { createStorageProvider } = await import('../storage/index.js')
  const { prisma } = await import('../db.js')
  let target: StorageProvider
  try { target = createStorageProvider() } catch (error) { console.error((error as Error).message); process.exit(2) }
  const report = await migrateStorage({ prisma, target, sourceDir: config.uploadDir, dryRun: args.has('--dry-run'), rewriteKeys: args.has('--rewrite-keys'), deleteLocal: args.has('--delete-local'), verifyUrls: args.has('--verify-urls'), log: console.log })
  console.log(`${args.has('--dry-run') ? '[dry-run] ' : ''}scanned=${report.scanned} migrated=${report.migrated} skipped=${report.skipped} failed=${report.failed} verified=${report.verified}`)
  await prisma.$disconnect()
  process.exit(report.failed ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main()
