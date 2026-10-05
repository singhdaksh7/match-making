import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

// End-to-end coverage of variant-level pricing and explicit catalogue variants, through the real UI:
//   admin product form (price per variant, no stock) -> catalogue builder (tick exact variants) -> anonymous public catalogue on a
//   phone (variant selection, price, image switching) -> enquiry (exact variant + price snapshot) -> catalogue editing.
// Needs a running LOCAL stack (web + API + a database containing one OWNER); refuses non-local hosts. Env:
//   E2E_BASE_URL (default http://127.0.0.1:8088), E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8088'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@vastraa.test'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!'
const tag = Date.now().toString(36)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  const { hostname } = new URL(baseURL)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Refusing to run against non-local host "${hostname}".`)
})

type Id = { id: string }
const s: { color?: any; size?: any; category?: Id; customer?: Id; product?: any; ui?: Id; token?: string; catalogueId?: string } = {}
let admin: BrowserContext
let page: Page

async function api(request: APIRequestContext, method: 'get' | 'post' | 'patch', path: string, data?: unknown) {
  const r = await request[method](`${baseURL}/api/v1${path}`, data === undefined ? {} : { data })
  expect(r.status(), `${method} ${path}`).toBeLessThan(300)
  return r.status() === 204 ? undefined : (await r.json()).data
}

test.beforeAll(async ({ browser }) => {
  admin = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await admin.newPage()
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  const r = admin.request
  // attribute names are unique per business: reuse them when an earlier run already created them
  const ensure = async (name: string, kind: string, supportsImages: boolean, values: { value: string; hex?: string }[]) => {
    const existing = ((await api(r, 'get', '/attributes')) as any[]).find((a) => a.name === name)
    if (existing) { for (const value of values) if (!existing.values.some((x: any) => x.value === value.value)) await api(r, 'post', `/attributes/${existing.id}/values`, value); return ((await api(r, 'get', '/attributes')) as any[]).find((a) => a.name === name) }
    return api(r, 'post', '/attributes', { name, kind, supportsImages, values })
  }
  s.color = await ensure('Color', 'COLOR', true, [{ value: 'Red', hex: '#cc0000' }, { value: 'Blue', hex: '#0000cc' }, { value: 'Green', hex: '#00cc00' }])
  s.size = await ensure('Size', 'SIZE', false, [{ value: 'M' }, { value: 'L' }, { value: 'XL' }])
  s.category = await api(r, 'post', '/categories', { name: `Kurtis ${tag}`, slug: `kurtis-${tag}`, attributeIds: [s.color.id, s.size.id] })
  s.customer = await api(r, 'post', '/customers', { businessName: `Anand Traders ${tag}`, contactPerson: 'Raj', phone: '+919820011223', type: 'WHOLESALER' })
  const v = (attr: any, name: string) => attr.values.find((x: any) => x.value === name).id
  const combos: [string, string, number][] = [['Red', 'M', 620], ['Red', 'L', 640], ['Red', 'XL', 660], ['Blue', 'M', 630], ['Blue', 'L', 650]]
  s.product = await api(r, 'post', '/products', {
    categoryId: s.category!.id, code: `PRK-${tag}`, name: `Premium Rayon Kurti ${tag}`, moq: 6, description: 'Rayon kurti',
    attributeIds: [s.color.id, s.size.id], allowedAttributeValueIds: [v(s.color, 'Red'), v(s.color, 'Blue'), v(s.size, 'M'), v(s.size, 'L'), v(s.size, 'XL')],
    variants: combos.map(([c, z, price]) => ({ sku: `PRK-${tag}-${c}-${z}`, price, attributeValueIds: [v(s.color, c), v(s.size, z)] })),
  })
  for (const colour of ['Red', 'Blue']) {
    const res = await r.post(`${baseURL}/api/v1/products/${s.product.id}/attribute-values/${v(s.color, colour)}/images`, { multipart: { files: { name: `${colour}.png`, mimeType: 'image/png', buffer: PNG } } })
    expect(res.status(), `${colour} image`).toBe(201)
  }
})
test.afterAll(async () => { await admin?.close() })

const bodyText = async (p: Page) => (await p.locator('body').innerText())
const noHorizontalScroll = async (p: Page) => expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

test('admin product form: no stock, no product price, a required price for every variant', async () => {
  await page.goto(`${baseURL}/products/new`)
  await page.getByPlaceholder('e.g. Floral Rayon Straight Kurti').fill(`UI Kurti ${tag}`)
  await page.getByPlaceholder('e.g. K-101').fill(`UI-${tag}`)
  const next = page.getByRole('button', { name: /^Continue/ })
  await next.click()
  await page.locator('select').selectOption(s.category!.id)
  await next.click()
  for (const name of ['Red', 'Blue']) await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  for (const name of ['M', 'L']) await page.getByRole('button', { name, exact: true }).click()
  await next.click()
  await page.getByRole('button', { name: /Generate combinations/ }).click()
  const rows = page.getByTestId('variant-price')
  await expect(rows).toHaveCount(4)
  expect(await bodyText(page)).not.toMatch(/stock/i)
  expect(await bodyText(page)).not.toMatch(/wholesale price|compare price/i)
  await expect(next).toBeDisabled() // unpriced variants block the step
  await expect(page.getByRole('alert')).toContainText('4 variants need a price')
  await page.getByTestId('bulk-price').fill('500')
  await page.getByRole('button', { name: 'Apply to all' }).click()
  await rows.nth(1).fill('520.5')
  await expect(next).toBeEnabled()
  await rows.nth(2).fill('0')
  await expect(next).toBeDisabled()
  await rows.nth(2).fill('510')
  await next.click() // MOQ
  expect(await bodyText(page)).not.toMatch(/in stock|low stock|total stock/i)
  await next.click() // images
  await next.click() // save
  await page.getByRole('button', { name: 'Save Product' }).click()
  await expect(page).toHaveURL(/\/products\/(?!new)[^/]+$/)
  s.ui = { id: page.url().split('/').pop()! }
  const prices = ((await api(admin.request, 'get', `/products/${s.ui.id}`)).variants as any[]).map((x) => Number(x.price)).sort((a, b) => a - b)
  expect(prices).toEqual([500, 500, 510, 520.5])
  // product detail: prices editable inline, no stock column
  expect(await bodyText(page)).not.toMatch(/stock/i)
  await expect(page.getByTestId('variant-price-input').filter({ visible: true }).first()).toBeVisible()
})

test('admin can edit a variant price from the product page and it persists', async () => {
  await page.goto(`${baseURL}/products/${s.product.id}`)
  const input = page.getByTestId('variant-price-input').filter({ visible: true }).first()
  await input.fill('625')
  await page.getByTestId('variant-price-save').filter({ visible: true }).first().click()
  await expect(page.getByText('Variant price saved').first()).toBeVisible()
  const variants = (await api(admin.request, 'get', `/products/${s.product.id}`)).variants as any[]
  expect(variants.map((x) => Number(x.price)).sort((a, b) => a - b)).toContain(625)
  // put the brief's price back
  const changed = variants.find((x) => Number(x.price) === 625)
  await api(admin.request, 'patch', `/products/${s.product.id}/variants/${changed.id}`, { price: 620 })
})

test('catalogue builder: every product needs explicit variants; only ticked variants are shared', async () => {
  await page.goto(`${baseURL}/catalogues/new`)
  const next = page.getByRole('button', { name: /^Continue/ })
  await page.getByRole('button', { name: new RegExp(`Anand Traders ${tag}`) }).click()
  await next.click()
  await page.getByText('Catalogue Name').locator('..').locator('input').fill(`Variant Catalogue ${tag}`)
  await next.click()
  await page.getByRole('button', { name: new RegExp(`Premium Rayon Kurti ${tag}`) }).first().click()
  await page.getByRole('button', { name: new RegExp(`UI Kurti ${tag}`) }).first().click()
  await next.click() // variants step
  const picker = page.getByTestId('catalogue-variant-picker')
  await expect(picker).toBeVisible()
  const premium = page.getByTestId(`picker-product-PRK-${tag}`)
  const ui = page.getByTestId(`picker-product-UI-${tag}`)
  // nothing is shared by default, and the step cannot be passed
  await expect(premium.getByTestId('picker-count')).toHaveText('0 / 5')
  await expect(ui.getByTestId('picker-count')).toHaveText('0 / 4')
  await expect(next).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Choose at least one variant')
  // the exact subset from the brief
  for (const combo of ['Red-L', 'Red-XL', 'Blue-M']) await premium.getByTestId(`variant-option-PRK-${tag}-${combo}`).click()
  await expect(premium.getByTestId('picker-count')).toHaveText('3 / 5')
  await expect(next).toBeDisabled() // the UI product still has nothing selected
  // Select all / Clear all are visible, explicit shortcuts
  await ui.getByTestId('select-all-variants').click()
  await expect(ui.getByTestId('picker-count')).toHaveText('4 / 4')
  await ui.getByTestId('clear-all-variants').click()
  await expect(ui.getByTestId('picker-count')).toHaveText('0 / 4')
  await ui.getByTestId('select-all-variants').click()
  await expect(next).toBeEnabled()
  // the prices shown are the variants' own prices
  await expect(premium.getByTestId(`variant-option-PRK-${tag}-Red-L`)).toContainText('₹640')
  await expect(premium.getByTestId(`variant-option-PRK-${tag}-Blue-M`)).toContainText('₹630')
  await next.click() // settings
  await page.getByRole('button', { name: 'Percentage' }).click()
  await page.getByRole('button', { name: '+10%' }).click()
  expect(await bodyText(page)).not.toMatch(/stock|availability/i)
  await next.click() // review
  const review = page.getByTestId('catalogue-review')
  await expect(review).toContainText('7 variants across 2 products')
  await expect(review).toContainText('₹704') // 640 + 10%
  await expect(review).toContainText('₹693') // 630 + 10%
  await page.getByRole('button', { name: /Generate Catalogue Link/ }).click()
  await expect(page.getByText('Your private catalogue is ready')).toBeVisible()
  const link = (await page.locator('p.font-mono').innerText()).trim()
  s.token = link.split('/catalogue/')[1]
  expect(s.token!.length).toBeGreaterThanOrEqual(32)
  // persisted server side: exactly the ticked variants
  const list = (await admin.request.get(`${baseURL}/api/v1/catalogues?limit=100`).then((r) => r.json())).data as any[]
  const created = list.find((c) => c.token === s.token)
  s.catalogueId = created.id
  const item = created.items.find((i: any) => i.productId === s.product.id)
  const skus = (await api(admin.request, 'get', `/products/${s.product.id}`)).variants.filter((v: any) => item.variants.some((x: any) => x.variantId === v.id)).map((v: any) => v.sku.replace(`PRK-${tag}-`, '')).sort()
  expect(skus).toEqual(['Blue-M', 'Red-L', 'Red-XL'])
})

test('public catalogue on a phone: only shared variants, variant prices, image switching, exact-variant enquiry', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  await p.goto(`${baseURL}/catalogue/${s.token}`)
  const card = p.locator('a', { hasText: `Premium Rayon Kurti ${tag}` }).first()
  await expect(card).toBeVisible()
  await expect(card.getByTestId('card-price')).toContainText('₹693 – ₹726') // 630..660 + 10%
  await expect(card).toContainText('3 variants')
  expect(await bodyText(p)).not.toMatch(/stock|ready/i)
  await noHorizontalScroll(p)
  await card.click()

  // only the three shared variants are listed (Red/M and Blue/L were never shared)
  const chips = p.getByTestId('shared-variants').locator('button')
  await expect(chips).toHaveCount(3)
  await expect(p.getByTestId(`variant-chip-PRK-${tag}-Red-M`)).toHaveCount(0)
  await expect(p.getByTestId(`variant-chip-PRK-${tag}-Blue-L`)).toHaveCount(0)
  await expect(p.getByTestId('variant-price')).toContainText('₹693 – ₹726')
  await noHorizontalScroll(p)

  // choosing Blue narrows the price and switches the photo set to the Blue photos
  const gallery = p.getByTestId('gallery-main')
  await expect(gallery).toHaveAttribute('data-gallery-context', 'general')
  await p.getByTestId('option-color-Blue').tap()
  await expect(p.getByTestId('variant-price')).toContainText('₹693')
  await expect(gallery).toHaveAttribute('data-gallery-context', 'color:Blue')
  const blueSrc = await gallery.getAttribute('data-gallery-src')
  // a non-image attribute (size) never replaces the photo
  await p.getByTestId('option-size-M').tap()
  await expect(gallery).toHaveAttribute('data-gallery-context', 'color:Blue')
  await expect(p.getByTestId('variant-chip-' + `PRK-${tag}-Blue-M`)).toHaveAttribute('aria-pressed', 'true')
  await expect(p.getByTestId('variant-price')).toHaveText(/₹693/)
  // L is not shared with Blue: the impossible combination cannot form, the earlier pick is released
  await p.getByTestId('option-size-L').tap()
  await expect(p.getByTestId('select-hint')).toContainText('color')
  await expect(p.getByTestId('variant-price')).toContainText('₹704')
  // Red + L = a real shared variant: exact price, photo switches to Red
  await p.getByTestId('option-color-Red').tap()
  await expect(p.getByTestId('variant-price')).toContainText('₹704')
  await expect(gallery).toHaveAttribute('data-gallery-context', 'color:Red')
  expect(await gallery.getAttribute('data-gallery-src')).not.toBe(blueSrc)
  await noHorizontalScroll(p)
  // 24 pieces: no inventory limit
  await p.getByRole('textbox', { name: 'Quantity' }).fill('24')
  await p.getByTestId('add-to-selection').tap()
  // a second variant of the same product can be added too
  await p.getByTestId(`variant-chip-PRK-${tag}-Red-XL`).tap()
  await expect(p.getByTestId('variant-price')).toContainText('₹726')
  await p.getByTestId('add-to-selection').tap()
  await p.getByRole('button', { name: /View Selection/ }).tap()

  const lines = p.getByTestId('selection-line')
  await expect(lines).toHaveCount(2)
  await expect(lines.first().getByTestId('selection-variant')).toContainText('Red / L')
  await expect(lines.nth(1).getByTestId('selection-variant')).toContainText('Red / XL')
  await noHorizontalScroll(p)
  await p.getByText('Contact Name', { exact: true }).locator('..').locator('input').fill('Buyer Phone')
  await p.getByText('Phone', { exact: true }).locator('..').locator('input').fill('+919999900000')
  await p.getByRole('button', { name: 'Send Enquiry' }).tap()
  await expect(p).toHaveURL(/enquiry-success/)
  await ctx.close()

  const enquiries = (await api(admin.request, 'get', '/enquiries?limit=100')) as any[]
  const enquiry = enquiries.find((e) => e.contactName === 'Buyer Phone' && e.catalogueId === s.catalogueId)
  expect(enquiry.items).toHaveLength(2)
  const redL = enquiry.items.find((i: any) => i.skuSnapshot === `PRK-${tag}-Red-L`)
  expect(redL.quantity).toBe(24)
  expect(Number(redL.priceSnapshot)).toBe(704)
  expect(redL.attributesSnapshot).toEqual({ Color: 'Red', Size: 'L' })
  expect(redL.productNameSnapshot).toBe(`Premium Rayon Kurti ${tag}`)
  expect(redL.imageUrl).toContain('/api/v1/media/')
  expect(Number(enquiry.items.find((i: any) => i.skuSnapshot === `PRK-${tag}-Red-XL`).priceSnapshot)).toBe(726)
})

test('catalogue editing shows the shared variants, rejects an empty product, and saves a new selection', async () => {
  await page.goto(`${baseURL}/catalogues/${s.catalogueId}`)
  const entry = page.getByTestId(`catalogue-entry-PRK-${tag}`)
  await expect(entry).toContainText('3 of 5 variants shared')
  await expect(entry.getByTestId('shared-variant-list').locator('li')).toHaveCount(3)
  await page.getByTestId('edit-shared-variants').click()
  const dialog = page.getByTestId(`picker-product-PRK-${tag}`)
  await expect(dialog.getByTestId('picker-count')).toHaveText('3 / 5') // current selection preserved
  await dialog.getByTestId('clear-all-variants').click()
  await expect(page.getByTestId('save-shared-variants')).toBeDisabled()
  await dialog.getByTestId('select-all-variants').click()
  await expect(dialog.getByTestId('picker-count')).toHaveText('5 / 5')
  await page.getByTestId('save-shared-variants').click()
  await expect(page.getByText('Shared variants updated').first()).toBeVisible()
  await expect(entry).toContainText('5 of 5 variants shared')
  // the public page now lists all five
  const pub = await page.request.get(`${baseURL}/api/v1/public/catalogues/${s.token}`)
  const product = (await pub.json()).data.products.find((x: any) => x.code === `PRK-${tag}`)
  expect(product.variants).toHaveLength(5)
})

test('tablet and phone layouts of the builder variant step do not overflow', async ({ browser }) => {
  for (const width of [390, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies(await admin.cookies())
    const p = await ctx.newPage()
    await p.goto(`${baseURL}/catalogues/new`)
    const next = p.getByRole('button', { name: /^Continue/ })
    await p.getByRole('button', { name: new RegExp(`Anand Traders ${tag}`) }).click()
    await next.click()
    await p.getByText('Catalogue Name').locator('..').locator('input').fill('Layout check')
    await next.click()
    await p.getByRole('button', { name: new RegExp(`Premium Rayon Kurti ${tag}`) }).first().click()
    await next.click()
    await expect(p.getByTestId('catalogue-variant-picker')).toBeVisible()
    await noHorizontalScroll(p)
    await ctx.close()
  }
})

test('catalogue editing can add a product; the new product shares nothing until variants are chosen', async () => {
  const variants = (await api(admin.request, 'get', `/products/${s.product.id}`)).variants as any[]
  const created = await api(admin.request, 'post', '/catalogues', { customerId: s.customer!.id, title: `Add product ${tag}`, status: 'ACTIVE', items: [{ productId: s.product.id, variants: [{ variantId: variants[0].id }] }] })
  await page.goto(`${baseURL}/catalogues/${created.id}`)
  await expect(page.getByTestId(`catalogue-entry-PRK-${tag}`)).toContainText('1 of 5 variants shared')
  await page.getByTestId('edit-shared-variants').click()
  await page.getByTestId('add-products').locator('summary').click()
  await page.getByTestId(`add-product-UI-${tag}`).click()
  const added = page.getByTestId(`picker-product-UI-${tag}`)
  await expect(added.getByTestId('picker-count')).toHaveText('0 / 4') // nothing is shared implicitly
  await expect(page.getByTestId('save-shared-variants')).toBeDisabled()
  await added.getByTestId('select-all-variants').click()
  await page.getByTestId('save-shared-variants').click()
  await expect(page.getByText('Shared variants updated').first()).toBeVisible()
  await expect(page.getByTestId(`catalogue-entry-UI-${tag}`)).toContainText('4 of 4 variants shared')
  const after = await api(admin.request, 'get', `/catalogues/${created.id}`)
  expect(after.items).toHaveLength(2)
  expect(after.token).toBe(created.token) // editing never regenerates the public token
})
