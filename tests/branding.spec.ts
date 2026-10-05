import { test, expect, type Page } from '@playwright/test'

// Branding regression: customers must only ever see "Subh Laxmi Collection" — no Vastraa / demo branding, no demo credentials.
// Needs a running LOCAL stack (web + API + a database containing one owner) — never production. See TESTING.md.
//   E2E_BASE_URL (default http://127.0.0.1:8088), E2E_ADMIN_EMAIL (default admin@vastraa.test), E2E_ADMIN_PASSWORD (default ChangeMe123!)
// The public-catalogue test creates a disposable customer/product/catalogue through the API and removes what it can afterwards.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8088'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@vastraa.test'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!'
const BRAND = 'Subh Laxmi Collection'
const tag = Date.now().toString(36)
const FORBIDDEN = [/vastraa/i, /raj fashion/i, /demo credentials/i, /demo mode/i, /demo guide/i, /ChangeMe123/, /\+91 98200/]

const expectNoOldBranding = async (page: Page) => {
  // the signed-in user's own email (a test fixture here) is account data, not branding
  const text = (await page.locator('body').innerText()).split(adminEmail).join('')
  for (const pattern of FORBIDDEN) expect(text, `page text must not match ${pattern}`).not.toMatch(pattern)
}

async function login(page: Page) {
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test.beforeAll(() => {
  const { hostname } = new URL(baseURL)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Refusing to run on non-local host "${hostname}".`)
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`login page is branded ${BRAND} at ${viewport.width}px and authentication still works`, async ({ browser }) => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto(`${baseURL}/login`)
    await expect(page).toHaveTitle(BRAND)
    await expect(page.getByText(BRAND, { exact: true }).locator('visible=true').first()).toBeVisible()
    await expectNoOldBranding(page)
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain(BRAND)
    expect(await page.locator('meta[property="og:site_name"]').getAttribute('content')).toBe(BRAND)
    const manifest = await (await page.request.get(`${baseURL}/manifest.webmanifest`)).json()
    expect(manifest.name).toBe(BRAND)
    expect(JSON.stringify(manifest)).not.toMatch(/vastraa/i)

    // wrong password is rejected, correct credentials sign in
    await page.getByPlaceholder('Enter your email').fill(adminEmail)
    await page.getByPlaceholder('••••••••').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Invalid email or password.')).toBeVisible()
    await page.getByPlaceholder('••••••••').fill(adminPassword)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await context.close()
  })
}

test('admin shell shows the brand on desktop and in the 390px navigation drawer', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await desktop.newPage()
  await login(page)
  for (const path of ['/dashboard', '/products', '/customers', '/catalogues', '/settings']) {
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('aside').getByText(BRAND, { exact: true })).toBeVisible()
    await expectNoOldBranding(page)
  }
  await expect(page).toHaveTitle(BRAND)
  await desktop.close()

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const m = await mobile.newPage()
  await login(m)
  await m.locator('header button').first().click() // hamburger
  await expect(m.getByRole('dialog', { name: 'Navigation drawer' }).getByText(BRAND, { exact: true })).toBeVisible()
  await expectNoOldBranding(m)
  expect(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await mobile.close()
})

test('public catalogue shows the Business name from the API; token resolves; selection and enquiry work at 390px', async ({ browser }) => {
  test.setTimeout(120_000)
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const adminPage = await admin.newPage()
  await login(adminPage)
  const api = adminPage.request
  const make = async (path: string, data: unknown) => { const r = await api.post(`${baseURL}/api/v1${path}`, { data }); expect(r.status(), path).toBeLessThan(300); return (await r.json()).data }
  const attribute = await make('/attributes', { name: `Fabric ${tag}`, kind: 'SELECT', values: [{ value: 'Rayon' }] })
  const category = await make('/categories', { name: `Kurtis ${tag}`, slug: `kurtis-${tag}`, attributeIds: [attribute.id] })
  const product = await make('/products', { categoryId: category.id, code: `BRD-${tag}`, name: `Brand Kurti ${tag}`, moq: 1, attributeIds: [attribute.id], allowedAttributeValueIds: [attribute.values[0].id],
    variants: [{ sku: `BRD-${tag}-R`, price: 100, attributeValueIds: [attribute.values[0].id] }] })
  const customer = await make('/customers', { businessName: `Brand Buyer ${tag}`, contactPerson: 'Asha', phone: '+919800000010', type: 'WHOLESALER' })
  const catalogue = await make('/catalogues', { customerId: customer.id, title: `Brand catalogue ${tag}`, status: 'ACTIVE', showPrice: true, showMOQ: true, allowSelection: true, allowEnquiry: true, allowImageDownload: false, priceAdjustmentPct: 0, items: [{ productId: product.id, variants: product.variants.map((v: { id: string }) => ({ variantId: v.id })) }] })

  const publicJson = await (await api.get(`${baseURL}/api/v1/public/catalogues/${catalogue.token}`)).json()
  expect(typeof publicJson.data.business.name).toBe('string')
  const businessName: string = publicJson.data.business.name

  const customerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await customerCtx.newPage()
  await page.goto(`${baseURL}/catalogue/${catalogue.token}`)
  await expect(page.getByText(`Brand Kurti ${tag}`).first()).toBeVisible()
  await expect(page.getByText(businessName, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Unknown customer')).toHaveCount(0)
  await expectNoOldBranding(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByText(`Brand Kurti ${tag}`).first().click()
  await page.getByRole('button', { name: 'Add to Selection' }).click()
  await page.getByRole('button', { name: /1 Product Selected/ }).click()
  await expectNoOldBranding(page)
  await page.locator('label', { hasText: 'Contact Name' }).locator('xpath=following-sibling::input[1]').fill('Brand Buyer')
  await page.locator('input[type="tel"]').nth(0).fill('9999999999')
  await page.getByRole('button', { name: 'Send Enquiry' }).click()
  await expect(page.getByText('Enquiry Sent Successfully')).toBeVisible()
  await expect(page.getByText(`shared with ${businessName}.`)).toBeVisible()
  await expectNoOldBranding(page)
  await customerCtx.close()

  // best-effort cleanup (the enquiry is history, so the customer/catalogue may legitimately be protected)
  await api.delete(`${baseURL}/api/v1/catalogues/${catalogue.id}`)
  await admin.close()
})
