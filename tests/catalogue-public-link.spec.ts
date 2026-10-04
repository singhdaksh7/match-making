import { test, expect, type Page } from '@playwright/test'

// Regression: "fresh production catalogue created through the normal admin flow can be opened through its generated public
// customer URL". Original bug: the Create-Catalogue wizard showed a link built from a slug the browser invented
// (<customer-first-word>-<5 random chars>) while the API stores a different, server-generated token, so every shared link
// said "Catalogue not found". This drives the real admin wizard and then opens the generated link as an anonymous customer.
//
// Needs a running LOCAL stack (web + API + a database containing one owner, one customer and one product) — never production:
//   E2E_BASE_URL         default http://127.0.0.1:8088
//   E2E_ADMIN_EMAIL      default admin@vastraa.test
//   E2E_ADMIN_PASSWORD   default ChangeMe123!   (the integration-test fixture owner)
//   E2E_CUSTOMER_NAME    default "Raj Fashion House"
//   E2E_PRODUCT_NAME     default "Floral Rayon Straight Kurti"
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8088'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@vastraa.test'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!'
const customerName = process.env.E2E_CUSTOMER_NAME ?? 'Raj Fashion House'
const productName = process.env.E2E_PRODUCT_NAME ?? 'Floral Rayon Straight Kurti'

test.beforeAll(() => {
  const { hostname } = new URL(baseURL)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Refusing to create test catalogues on non-local host "${hostname}".`)
})

async function createCatalogueThroughWizard(page: Page, title: string) {
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('admin@vastraa.demo').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto(`${baseURL}/catalogues/new`)
  const next = page.getByRole('button', { name: /^Continue/ })
  await page.getByRole('button', { name: new RegExp(customerName) }).click()
  await next.click()
  await page.getByText('Catalogue Name').locator('..').locator('input').fill(title)
  await next.click()
  await page.getByRole('button', { name: new RegExp(productName) }).first().click()
  await next.click() // variants
  await next.click() // settings
  await next.click() // preview
  await page.getByRole('button', { name: /Generate Catalogue Link/ }).click()
  await expect(page.getByText('Your private catalogue is ready')).toBeVisible()
  const link = (await page.locator('p.font-mono').innerText()).trim()
  return link
}

test('wizard-generated link opens the real customer catalogue for an anonymous visitor (desktop + mobile, direct load and refresh)', async ({ browser }) => {
  test.setTimeout(120_000)
  const title = `E2E link ${Date.now()}`
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const adminPage = await admin.newPage()
  const link = await createCatalogueThroughWizard(adminPage, title)

  // The link is on this origin and carries the server token, not a client-invented "<word>-<5 chars>" slug.
  expect(link.startsWith(`${baseURL}/catalogue/`)).toBe(true)
  const identifier = link.slice(`${baseURL}/catalogue/`.length)
  expect(identifier).not.toMatch(/^[a-z0-9]+-[a-z0-9]{5}$/)
  expect(identifier.length).toBeGreaterThanOrEqual(32)
  expect(link).not.toContain('/catalogue/catalogue/')

  // That identifier is exactly what the API issued for the catalogue we just created.
  const listed = await (await adminPage.request.get(`${baseURL}/api/v1/catalogues?limit=100`)).json()
  const created = listed.data.find((c: { title: string }) => c.title === title)
  expect(created?.token).toBe(identifier)

  // The wizard's success screen shows the real customer/catalogue, not demo placeholders.
  await expect(adminPage.getByText('Raj Fashion House').first()).toBeVisible()
  await expect(adminPage.getByText('September New Arrivals', { exact: true })).toHaveCount(0)

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    // fresh, unauthenticated browser context = the customer opening the shared link
    const customer = await browser.newContext({ viewport })
    const page = await customer.newPage()
    const publicApi: number[] = []
    page.on('response', (r) => { if (r.url().includes('/api/v1/public/catalogues/')) publicApi.push(r.status()) })
    await page.goto(link) // direct navigation (SPA fallback)
    await expect(page.getByText(productName).first()).toBeVisible()
    await expect(page.getByText('Catalogue not found')).toHaveCount(0)
    await page.reload() // refresh must keep working
    await expect(page.getByText(productName).first()).toBeVisible()
    expect(publicApi.length).toBeGreaterThan(0)
    expect(publicApi.every((s) => s === 200)).toBe(true)
    await customer.close()
  }

  // Control: the old client-style identifier is a precise "not found" for the customer.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`${baseURL}/catalogue/raj-a0brd`)
  await expect(strangerPage.getByText('Catalogue not found')).toBeVisible()
  await stranger.close()

  // Cleanup the disposable catalogue created by this test.
  await adminPage.request.delete(`${baseURL}/api/v1/catalogues/${created.id}`)
  await admin.close()
})
