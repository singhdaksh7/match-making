import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// Customer-side quantity entry and dynamic attribute filters on a shared catalogue, through the real UI.
// Needs a running LOCAL stack (web + API + a database with one OWNER); refuses non-local hosts. Env:
//   E2E_BASE_URL (default http://127.0.0.1:5173), E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@vastraa.test'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!!'
const tag = Date.now().toString(36)

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  const { hostname } = new URL(baseURL)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Refusing to run against non-local host "${hostname}".`)
})

let admin: BrowserContext
let token = ''
const ids: Record<string, string> = {}
let alphaVariant = ''

async function api(method: 'get' | 'post', path: string, data?: unknown) {
  const r = await admin.request[method](`${baseURL}/api/v1${path}`, data === undefined ? {} : { data })
  expect(r.status(), `${method} ${path}: ${await r.text()}`).toBeLessThan(300)
  return (await r.json()).data
}

test.beforeAll(async ({ browser }) => {
  admin = await browser.newContext()
  const page = await admin.newPage()
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  const attr = (name: string, kind: string, values: string[]) => api('post', '/attributes', { name: `${name}`, kind, supportsImages: false, values: values.map((value) => ({ value })) })
  const list = (await api('get', '/attributes')) as any[]
  const ensure = async (name: string, kind: string, values: string[]) => list.find((a) => a.name === name) ?? attr(name, kind, values)
  const color = await ensure('Color', 'COLOR', ['Black', 'Blue', 'White'])
  const size = await ensure('Size', 'SIZE', ['M', 'L', 'XL', 'XXL'])
  const fabric = await ensure('Fabric', 'TEXT', ['Cotton', 'Denim'])
  const val = (a: any, v: string) => a.values.find((x: any) => x.value === v).id

  const shorts = await api('post', '/categories', { name: `Shorts ${tag}`, slug: `shorts-${tag}`, attributeIds: [color.id, size.id] })
  const kurtis = await api('post', '/categories', { name: `Kurtis ${tag}`, slug: `kurtis-${tag}`, attributeIds: [size.id, fabric.id] })
  const customer = await api('post', '/customers', { businessName: `Filter Buyer ${tag}`, contactPerson: 'Raj', phone: '+919820011223', type: 'WHOLESALER' })

  const make = async (category: any, code: string, name: string, attrs: any[], combos: Record<string, string>[], price: number) => {
    const allowed = attrs.flatMap((a) => [...new Set(combos.map((c) => c[a.name]))].map((v) => val(a, v)))
    const p = await api('post', '/products', {
      categoryId: category.id, code, name, moq: 1, attributeIds: attrs.map((a) => a.id), allowedAttributeValueIds: allowed,
      variants: combos.map((c, i) => ({ sku: `${code}-${i}`, price: price + i * 50, attributeValueIds: attrs.map((a) => val(a, c[a.name])) })),
    })
    ids[name] = p.id
    return p
  }
  // Alpha has Black/M, Blue/XL and (NOT shared) Black/XXL. Beta has Black/XL and White/L: only Beta has a Black AND XL variant.
  const alpha = await make(shorts, `AL-${tag}`, 'Alpha Shorts', [color, size], [{ Color: 'Black', Size: 'M' }, { Color: 'Blue', Size: 'XL' }, { Color: 'Black', Size: 'XXL' }], 500)
  const beta = await make(shorts, `BE-${tag}`, 'Beta Shorts', [color, size], [{ Color: 'Black', Size: 'XL' }, { Color: 'White', Size: 'L' }], 600)
  const kurti = await make(kurtis, `KU-${tag}`, 'Gamma Kurti', [size, fabric], [{ Size: 'M', Fabric: 'Cotton' }, { Size: 'L', Fabric: 'Denim' }], 700)
  const vs = async (p: any) => ((await api('get', `/products/${p.id}`)) as any).variants as any[]
  const [aV, bV, kV] = [await vs(alpha), await vs(beta), await vs(kurti)]
  alphaVariant = aV[0].id
  const cat = await api('post', '/catalogues', {
    customerId: customer.id, title: `Filters ${tag}`, status: 'ACTIVE', showPrice: true,
    items: [
      { productId: alpha.id, variants: [{ variantId: aV[0].id }, { variantId: aV[1].id }] }, // Black/XXL not shared
      { productId: beta.id, variants: bV.map((v) => ({ variantId: v.id })) },
      { productId: kurti.id, variants: kV.map((v) => ({ variantId: v.id })) },
    ],
  })
  token = cat.token
})

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
const cards = (page: Page) => page.getByRole('link').filter({ hasText: /Shorts|Kurti/ })
const results = (page: Page) => page.getByTestId('result-count')

test.describe('mobile 390px: filters', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('same-variant matching, OR/AND, search, clear, unshared values hidden', async ({ page }) => {
    await page.goto(`${baseURL}/catalogue/${token}`)
    await expect(results(page)).toHaveText('3 designs')
    await page.getByTestId('open-filters').click()
    const sheet = page.getByTestId('filter-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('facet-size')).toBeVisible()
    await expect(sheet.getByTestId('facet-fabric')).toBeVisible()
    await expect(sheet.getByTestId('filter-size-XXL')).toHaveCount(0) // only on the unshared variant

    await sheet.getByTestId('filter-color-Black').click()
    await sheet.getByTestId('filter-size-XL').click()
    await expect(sheet.getByTestId('filter-apply')).toHaveText('Show 1 design') // Alpha has Black and XL on DIFFERENT variants
    await expect(sheet.getByTestId('filter-count')).toHaveText('2')
    await sheet.getByTestId('filter-apply').click()
    await expect(sheet).toHaveCount(0)
    await expect(results(page)).toHaveText('1 design')
    await expect(page.getByText('Beta Shorts')).toBeVisible()
    await expect(page.getByText('Alpha Shorts')).toHaveCount(0)
    await expect(page.getByTestId('active-filters')).toBeVisible() // chips survive closing the sheet
    await noOverflow(page)

    // OR within one attribute: XL or M
    await page.getByTestId('chip-color-Black').click()
    await page.getByTestId('open-filters').click()
    await sheet.getByTestId('filter-size-M').click()
    await sheet.getByTestId('filter-apply').click()
    await expect(results(page)).toHaveText('3 designs') // size XL or M: Beta (XL), Alpha (M), Gamma Kurti (M)

    // search + filters together, then empty state, then clear
    await page.getByPlaceholder('Search designs...').fill('zzz')
    await expect(page.getByTestId('no-results')).toBeVisible()
    await page.getByTestId('chips-clear-all').click()
    await expect(page.getByTestId('active-filters')).toHaveCount(0)
    await page.getByPlaceholder('Search designs...').fill('alpha')
    await expect(results(page)).toHaveText('1 design')
    await page.getByPlaceholder('Search designs...').fill('')
    await noOverflow(page)
  })

  test('category switching reconciles filters; kurtis show their own attributes', async ({ page }) => {
    await page.goto(`${baseURL}/catalogue/${token}`)
    await page.getByTestId('open-filters').click()
    const sheet = page.getByTestId('filter-sheet')
    await sheet.getByRole('button', { name: new RegExp(`^Shorts ${tag}$`) }).click()
    await expect(sheet.getByTestId('facet-color')).toBeVisible()
    await expect(sheet.getByTestId('facet-fabric')).toHaveCount(0)
    await sheet.getByTestId('filter-color-Black').click()
    await sheet.getByRole('button', { name: new RegExp(`^Kurtis ${tag}$`) }).click()
    await expect(sheet.getByTestId('facet-fabric')).toBeVisible()
    await expect(sheet.getByTestId('facet-color')).toHaveCount(0)
    await expect(sheet.getByTestId('filter-count')).toHaveCount(0) // Black no longer applies and was dropped
    await sheet.getByTestId('filter-fabric-Denim').click()
    await sheet.getByTestId('filter-apply').click()
    await expect(results(page)).toHaveText('1 design')
    await expect(page.getByText('Gamma Kurti')).toBeVisible()
  })

  test('public API never exposes an unshared variant or its values', async ({ request }) => {
    const body = JSON.stringify((await (await request.get(`${baseURL}/api/v1/public/catalogues/${token}`)).json()).data)
    expect(body).not.toContain('XXL')
  })
})

for (const [width, height] of [[768, 1024], [1440, 900]] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height } })
    test(`layout has no horizontal overflow and ${width >= 1024 ? 'shows the sidebar' : 'uses the sheet'}`, async ({ page }) => {
      await page.goto(`${baseURL}/catalogue/${token}`)
      await expect(results(page)).toHaveText('3 designs')
      if (width >= 1024) {
        await expect(page.getByTestId('filter-sidebar')).toBeVisible()
        await expect(page.getByTestId('open-filters')).toBeHidden()
        await page.getByTestId('filter-sidebar').getByTestId('filter-color-White').click()
        await expect(results(page)).toHaveText('1 design')
      } else {
        await expect(page.getByTestId('filter-sidebar')).toBeHidden()
        await expect(page.getByTestId('open-filters')).toBeVisible()
      }
      await noOverflow(page)
    })
  })
}

test.describe('mobile 390px: quantity input', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('type, clear, select-all replace, paste, +/-, per-variant quantities, validation, exact quantity reaches the backend', async ({ page }) => {
    await page.goto(`${baseURL}/catalogue/${token}/product/${ids['Alpha Shorts']}`)
    await page.getByTestId('variant-chip-' + `AL-${tag}-0`).click()
    const qty = page.getByTestId('quantity-input')
    await expect(page.getByTestId('estimated-total')).toContainText('₹') // default 12 x 500

    await qty.click()
    await page.keyboard.press('Control+A'); await page.keyboard.type('12')
    await expect(qty).toHaveValue('12'); await expect(qty).toBeFocused()
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace')
    await expect(qty).toHaveValue('') // no forced reset to 1 / minimum
    await expect(qty).toBeFocused()
    await page.keyboard.type('100')
    await expect(qty).toHaveValue('100')
    await expect(page.getByTestId('estimated-total')).toContainText('50,000')
    await page.keyboard.type('0'); await expect(qty).toHaveValue('1000')
    await page.keyboard.press('Control+A'); await page.keyboard.type('12')
    await expect(page.getByTestId('estimated-total')).toContainText('6,000')

    // invalid values are kept as typed, flagged, and cannot be added
    for (const bad of ['0', '1.5', 'abc', '1000001']) {
      await qty.fill(bad)
      await expect(page.getByTestId('quantity-error')).toBeVisible()
      await expect(qty).toHaveValue(bad)
      await page.getByTestId('add-to-selection').click()
      await expect(page.getByText(/Added/)).toHaveCount(0)
    }
    await qty.fill(''); await qty.blur()
    await expect(page.getByTestId('quantity-error')).toContainText('Enter')

    // plus/minus recover from an invalid draft and respect the minimum
    await page.getByLabel('Increase quantity').click()
    await expect(qty).toHaveValue('13')
    await page.getByLabel('Decrease quantity').click()
    await expect(qty).toHaveValue('12')
    await qty.fill('1'); await expect(page.getByLabel('Decrease quantity')).toBeDisabled()

    // paste
    await qty.fill('')
    await qty.evaluate((el: HTMLInputElement) => { el.focus(); document.execCommand('insertText', false, '250') })
    await expect(qty).toHaveValue('250')

    // two variants of the same product keep their own quantities
    await page.getByTestId('add-to-selection').click()
    await page.getByTestId('variant-chip-' + `AL-${tag}-1`).click()
    await qty.fill('40')
    await page.getByTestId('add-to-selection').click()
    await page.goto(`${baseURL}/catalogue/${token}/selection`)
    const lines = page.getByTestId('selection-line')
    await expect(lines).toHaveCount(2)
    await expect(lines.nth(0).getByTestId('quantity-input')).toHaveValue('250')
    await expect(lines.nth(1).getByTestId('quantity-input')).toHaveValue('40')

    // editing in the selection page, with a reload in between (persisted)
    await lines.nth(1).getByTestId('quantity-input').fill('75')
    await page.reload()
    await expect(page.getByTestId('selection-line').nth(1).getByTestId('quantity-input')).toHaveValue('75')

    // an invalid line blocks submission
    const q1 = page.getByTestId('selection-line').nth(1).getByTestId('quantity-input')
    await q1.fill('0')
    await page.locator('input[type=text]:not([data-testid])').first().fill('Quantity Buyer')
    await page.locator('input[type=tel]').first().fill('+919999999999')
    await expect(page.getByRole('button', { name: 'Send Enquiry' })).toBeDisabled()
    await q1.fill('75')
    await expect(page.getByRole('button', { name: 'Send Enquiry' })).toBeEnabled()
    await noOverflow(page)
    await page.getByRole('button', { name: 'Send Enquiry' }).click()
    await expect(page).toHaveURL(/enquiry-success/)

    const enquiries = (await api('get', '/enquiries?limit=100')) as any[]
    const mine = enquiries.find((e) => e.contactName === 'Quantity Buyer')
    expect(mine, 'enquiry stored').toBeTruthy()
    expect(Object.fromEntries(mine.items.map((i: any) => [i.skuSnapshot, i.quantity]))).toEqual({ [`AL-${tag}-0`]: 250, [`AL-${tag}-1`]: 75 })
    expect(alphaVariant).toBeTruthy()
  })
})
