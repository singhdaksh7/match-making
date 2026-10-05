import { test, expect, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'

// Same convention as the other specs: runs against the full stack (frontend + API + Postgres, seeded) on 8088.
const baseURL = 'http://127.0.0.1:8088'
const catalogueSlug = 'vastraa-demo-catalogue'

function crc32(buf: Buffer) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** Small solid-colour PNG generated in memory (no external fixtures). */
function png(r: number, g: number, b: number, size = 16) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const files = [
  { name: 'rayon-red.png', mimeType: 'image/png', buffer: png(220, 30, 30) },
  { name: 'rayon-green.png', mimeType: 'image/png', buffer: png(30, 200, 60) },
  { name: 'rayon-blue.png', mimeType: 'image/png', buffer: png(30, 60, 220) },
]

async function assertNoOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth - clientWidth, `${label}: horizontal overflow (scrollWidth=${scrollWidth} clientWidth=${clientWidth})`).toBeLessThanOrEqual(1)
}

async function login(page: Page) {
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill('admin@vastraa.demo')
  await page.getByPlaceholder('••••••••').fill('ChangeMe123!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/dashboard/)
}

async function k101Id(page: Page) {
  const res = await page.request.get(`${baseURL}/api/v1/products?q=K-101&limit=10`)
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const product = (body.data as any[]).find((p) => p.code === 'K-101')
  expect(product, 'seeded product K-101').toBeTruthy()
  return product.id as string
}

async function gotoImagesStep(page: Page, productId: string) {
  await page.goto(`${baseURL}/products/${productId}/edit`)
  await expect(page.getByText('Basic Information').first()).toBeVisible()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Step 6 of 7')).toBeVisible()
}

test('attribute-value images: admin upload/reorder/delete/persist and public gallery rules', async ({ browser }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401 (Unauthorized)') && !m.text().includes('/auth/me')) errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await login(page)

  // 1. Enable images for Fabric (Size stays off)
  await page.goto(`${baseURL}/attributes`)
  const fabricCheckbox = page.getByTestId('attr-supports-images-Fabric')
  await expect(page.getByTestId('attr-header-Fabric')).toBeVisible()
  if (!(await fabricCheckbox.isVisible().catch(() => false))) await page.getByTestId('attr-header-Fabric').click()
  await expect(fabricCheckbox).toBeVisible()
  if (!(await fabricCheckbox.isChecked())) await fabricCheckbox.check()
  await expect(page.getByTestId('attr-images-badge-Fabric')).toBeVisible()
  await expect(page.getByTestId('attr-images-badge-Size')).toHaveCount(0)

  // 2. Edit K-101 -> images step -> Fabric Rayon manager, no Size manager
  const productId = await k101Id(page)
  await gotoImagesStep(page, productId)
  await expect(page.getByTestId('attr-images-section-Fabric')).toBeVisible()
  await expect(page.getByTestId('attr-images-section-Size')).toHaveCount(0)

  // start from a clean slate if a previous run left images behind
  while (await page.getByTestId('attr-image-thumb-Rayon-0').count()) {
    await page.getByTestId('attr-image-thumb-Rayon-0').getByTestId('attr-image-delete').click()
    await expect.poll(() => page.getByTestId('attr-image-count-Rayon').textContent()).toBeTruthy()
    await page.waitForTimeout(300)
  }

  // 3. Upload several images at once
  await page.getByTestId('attr-image-upload-Rayon').setInputFiles(files)
  await expect(page.getByTestId('attr-image-count-Rayon')).toContainText('3 images')
  await expect(page.getByTestId('attr-image-thumb-Rayon-0')).toContainText('Primary')
  const srcOf = (i: number) => page.getByTestId(`attr-image-thumb-Rayon-${i}`).locator('img').getAttribute('src')
  const first = await srcOf(0)

  // 4. Reorder: move first image right -> becomes second
  await page.getByTestId('attr-image-thumb-Rayon-0').getByTestId('attr-image-move-right').click()
  await expect.poll(() => srcOf(1)).toBe(first)

  // 5. Delete one
  await page.getByTestId('attr-image-thumb-Rayon-2').getByTestId('attr-image-delete').click()
  await expect(page.getByTestId('attr-image-count-Rayon')).toContainText('2 images')
  const order = [await srcOf(0), await srcOf(1)]

  // 6. Mobile: no horizontal overflow on this form
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page, 'admin product form (390)')
  await page.setViewportSize({ width: 1440, height: 900 })

  // 7. Save, reload, persistence + order
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
  await gotoImagesStep(page, productId)
  await expect(page.getByTestId('attr-image-count-Rayon')).toContainText('2 images')
  expect([await srcOf(0), await srcOf(1)]).toEqual(order)

  // 8. Public catalogue gallery
  // Anonymous customer: a fresh context (a logged-in admin session loads catalogue data via the admin API).
  const pubContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pub = await pubContext.newPage()
  pub.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401 (Unauthorized)')) errors.push(`[public] ${m.text()}`) })
  await pub.goto(`${baseURL}/catalogue/${catalogueSlug}/product/${productId}`)
  await expect(pub.getByTestId('gallery-main')).toBeVisible()
  await pub.getByRole('button', { name: 'Rayon', exact: true }).click()
  const main = pub.getByTestId('gallery-main')
  await expect(main).toHaveAttribute('data-gallery-context', 'fabric:Rayon')
  await expect(pub.getByTestId('gallery-thumb-0')).toHaveAttribute('data-source', 'attribute')
  await expect(pub.getByTestId('gallery-thumb-1')).toHaveAttribute('data-source', 'attribute')
  const mainSrc = await main.getAttribute('data-gallery-src')
  expect(mainSrc).toBeTruthy()

  // selecting a size (non-image attribute) must not change the gallery
  const sizeButton = pub.locator('p:has-text("Size") + div button').first()
  await sizeButton.click()
  await expect(main).toHaveAttribute('data-gallery-context', 'fabric:Rayon')
  expect(await main.getAttribute('data-gallery-src')).toBe(mainSrc)

  // 9. Mobile overflow on public detail
  await pub.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(pub, 'public product detail (390)')

  expect(errors, errors.join('\n')).toEqual([])
  await pubContext.close()
  await context.close()
})
