import { test, expect, type Page } from '@playwright/test'

const baseURL = 'http://127.0.0.1:8088'
const catalogueSlug = 'vastraa-demo-catalogue'
const VIEWPORT = { width: 390, height: 844 }

async function assertNoOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth - clientWidth, `${label}: horizontal overflow (scrollWidth=${scrollWidth} clientWidth=${clientWidth})`).toBeLessThanOrEqual(1)
}

test('mobile 390x844 release gate — admin + public catalogue', async ({ browser }) => {
  test.setTimeout(180_000)

  const errors: string[] = []
  const apiFailures: string[] = []

  // ===== 1. ADMIN LOGIN =====
  const adminContext = await browser.newContext({ viewport: VIEWPORT })
  const admin = await adminContext.newPage()
  admin.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401 (Unauthorized)') && !m.text().includes('/auth/me')) errors.push(`[admin] ${m.text()}`) })
  admin.on('pageerror', (e) => errors.push(`[admin] pageerror: ${e.message}`))
  admin.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) apiFailures.push(`[admin] ${r.status()} ${r.url()}`) })

  await admin.goto(`${baseURL}/login`)
  await assertNoOverflow(admin, 'login')
  await expect(admin.getByPlaceholder('admin@vastraa.demo')).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Sign In' })).toBeVisible()

  await admin.getByPlaceholder('admin@vastraa.demo').fill('admin@vastraa.demo')
  await admin.getByPlaceholder('••••••••').fill('ChangeMe123!')
  await admin.getByRole('button', { name: 'Sign In' }).click()
  await expect(admin).toHaveURL(/dashboard/)
  await assertNoOverflow(admin, 'dashboard')
  await admin.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true })

  // ===== 2. MOBILE BOTTOM NAV =====
  const bottomNav = admin.getByRole('navigation', { name: 'Mobile Bottom Navigation' })
  await expect(bottomNav).toBeVisible()
  const navBox = await bottomNav.boundingBox()
  expect(navBox).not.toBeNull()
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(VIEWPORT.height + 1)

  await bottomNav.getByRole('link', { name: /Products/ }).click()
  await expect(admin).toHaveURL(/\/products/)
  await assertNoOverflow(admin, 'products (via bottom nav)')

  await bottomNav.getByRole('link', { name: /Catalogues/ }).click()
  await expect(admin).toHaveURL(/\/catalogues/)

  await bottomNav.getByRole('link', { name: /Enquiries/ }).click()
  await expect(admin).toHaveURL(/\/enquiries/)

  await bottomNav.getByRole('link', { name: /Dashboard/ }).click()
  await expect(admin).toHaveURL(/dashboard/)

  // ===== 3. PRODUCTS =====
  await admin.goto(`${baseURL}/products`)
  await assertNoOverflow(admin, 'products')
  await admin.screenshot({ path: 'test-results/mobile-products.png', fullPage: true })
  // switch to table view to verify mobile-card fallback (desktop table must be hidden)
  await admin.getByRole('button').filter({ has: admin.locator('svg.lucide-list') }).click().catch(() => {})
  const desktopTable = admin.locator('table').first()
  if (await desktopTable.count()) await expect(desktopTable).toBeHidden()
  await assertNoOverflow(admin, 'products (table view, mobile cards)')

  const k101Link = admin.getByText('K-101', { exact: false }).first()
  await expect(k101Link).toBeVisible()
  await k101Link.click()
  await expect(admin).toHaveURL(/\/products\/.+/)
  await assertNoOverflow(admin, 'K-101 admin detail')
  await admin.screenshot({ path: 'test-results/mobile-product-detail.png', fullPage: true })

  // ===== 4. VARIANT UI =====
  const variantDesktopTable = admin.locator('table').first()
  if (await variantDesktopTable.count()) await expect(variantDesktopTable).toBeHidden()
  await assertNoOverflow(admin, 'K-101 variant table (mobile cards)')

  // ===== 5. CUSTOMERS =====
  await admin.goto(`${baseURL}/customers`)
  await assertNoOverflow(admin, 'customers')
  const rajCard = admin.getByText('Raj Fashion House', { exact: false }).first()
  await expect(rajCard).toBeVisible()
  const callLink = admin.getByRole('link', { name: /Call Raj/ }).first()
  const waLink = admin.getByRole('link', { name: /WhatsApp Raj/ }).first()
  if (await callLink.count()) await expect(callLink).toBeVisible()
  if (await waLink.count()) await expect(waLink).toBeVisible()
  await assertNoOverflow(admin, 'customers (after action check)')

  // ===== 6. COLLECTIONS =====
  await admin.goto(`${baseURL}/inventory/collections`)
  await assertNoOverflow(admin, 'collections')
  const sepCollection = admin.getByText('September New Arrivals', { exact: false }).first()
  await expect(sepCollection).toBeVisible()
  await sepCollection.click()
  await assertNoOverflow(admin, 'collection detail')

  // ===== 7. CATALOGUE BUILDER =====
  await admin.goto(`${baseURL}/catalogues/new`)
  await assertNoOverflow(admin, 'catalogue builder step 0')
  await admin.screenshot({ path: 'test-results/mobile-catalogue-builder.png', fullPage: true })

  const stickyBar = admin.locator('div.sticky.bottom-16, div.sticky.bottom-0').filter({ has: admin.getByRole('button', { name: /Continue|Generate/ }) })
  await expect(stickyBar.first()).toBeVisible()
  const stickyBox = await stickyBar.first().boundingBox()
  const navBox2 = await bottomNav.boundingBox()
  if (stickyBox && navBox2) {
    // sticky builder action bar must sit above (not overlap) the bottom nav
    expect(stickyBox.y + stickyBox.height).toBeLessThanOrEqual(navBox2.y + 1)
  }

  // step 0: pick customer
  await admin.getByText('Raj Fashion House', { exact: false }).first().click()
  await admin.getByRole('button', { name: 'Continue' }).click()
  // step 1: catalogue name
  const catalogueNameInput = admin.locator('label', { hasText: 'Catalogue Name' }).locator('xpath=following-sibling::input[1]')
  await catalogueNameInput.fill('Mobile QA Catalogue')
  await admin.getByRole('button', { name: 'Continue' }).click()
  // step 2: select products
  await assertNoOverflow(admin, 'catalogue builder step 2 (select products)')
  const firstProductTile = admin.getByRole('button', { name: /Floral Rayon Straight Kurti/ }).first()
  await expect(firstProductTile).toBeVisible()
  await firstProductTile.click()
  await expect(admin.getByRole('button', { name: 'Continue' })).toBeEnabled()

  // scroll to bottom, verify sticky action still reachable and not covering last content
  await admin.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(admin.getByRole('button', { name: 'Continue' })).toBeVisible()
  await assertNoOverflow(admin, 'catalogue builder step 2 (scrolled)')

  // ===== 14. MODAL (product quick view) =====
  await admin.goto(`${baseURL}/products`)
  await admin.getByRole('button').filter({ has: admin.locator('svg.lucide-list') }).click().catch(() => {})
  const quickViewBtn = admin.getByRole('button', { name: 'Quick View' }).first()
  if (await quickViewBtn.count()) {
    await quickViewBtn.click()
    const modal = admin.getByRole('dialog')
    await expect(modal).toBeVisible()
    const modalBox = await modal.boundingBox()
    expect(modalBox).not.toBeNull()
    expect(modalBox!.width).toBeLessThanOrEqual(VIEWPORT.width + 1)
    await admin.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await assertNoOverflow(admin, 'after modal close')
  }

  await adminContext.close()

  // ===== 8-13. PUBLIC CATALOGUE (fresh unauthenticated context) =====
  const publicContext = await browser.newContext({ viewport: VIEWPORT })
  const pub = await publicContext.newPage()
  pub.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401 (Unauthorized)') && !m.text().includes('/auth/me')) errors.push(`[public] ${m.text()}`) })
  pub.on('pageerror', (e) => errors.push(`[public] pageerror: ${e.message}`))
  pub.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) apiFailures.push(`[public] ${r.status()} ${r.url()}`) })

  await pub.goto(`${baseURL}/catalogue/${catalogueSlug}`)
  await assertNoOverflow(pub, 'public catalogue')
  await expect(pub.getByPlaceholder('Search designs...')).toBeVisible()
  await expect(pub.getByText('K-101', { exact: true })).toBeVisible()
  await pub.screenshot({ path: 'test-results/mobile-public-catalogue.png', fullPage: true })

  // ===== 9. PRODUCT DETAIL (multi-variant) =====
  await pub.getByText('K-101', { exact: true }).click()
  await expect(pub).toHaveURL(/\/catalogue\/.+\/product\/.+/)
  await assertNoOverflow(pub, 'public K-101 detail')
  await pub.screenshot({ path: 'test-results/mobile-public-k101.png', fullPage: true })

  await pub.getByRole('button', { name: 'Rayon' }).click()
  await pub.getByRole('button', { name: 'Black' }).click()
  await pub.getByRole('button', { name: 'XL', exact: true }).click()
  const qty1 = pub.locator('input[type="number"], input[inputmode="numeric"]').first()
  await qty1.fill('12')
  const addBtn = pub.getByRole('button', { name: 'Add to Selection' })
  await expect(addBtn).toBeVisible()
  const addBtnBox = await addBtn.boundingBox()
  expect(addBtnBox).not.toBeNull()
  expect(addBtnBox!.y + addBtnBox!.height).toBeLessThanOrEqual(VIEWPORT.height + 1)
  await addBtn.click()

  await pub.goBack()
  await pub.getByText('K-101', { exact: true }).click()
  await pub.getByRole('button', { name: 'Rayon' }).click()
  await pub.getByRole('button', { name: 'Maroon' }).click()
  await pub.getByRole('button', { name: 'L', exact: true }).click()
  const qty2 = pub.locator('input[type="number"], input[inputmode="numeric"]').first()
  await qty2.fill('24')
  await pub.getByRole('button', { name: 'Add to Selection' }).click()

  // ===== 10. SELECTION =====
  await pub.getByRole('button', { name: /2 Products Selected/ }).click()
  await expect(pub).toHaveURL(/\/selection$/)
  await assertNoOverflow(pub, 'selection')
  await pub.screenshot({ path: 'test-results/mobile-selection.png', fullPage: true })

  const rows = pub.locator('div.rounded-2xl.border.border-stone-200.bg-white.p-3')
  await expect(rows).toHaveCount(2)

  const phoneInputs = pub.locator('input[type="tel"]')
  await expect(phoneInputs.first()).toBeVisible()
  const detailsSection = pub.locator('div', { hasText: 'Your Details' }).last()
  const contactNameInput = detailsSection.locator('label', { hasText: 'Contact Name' }).locator('xpath=following-sibling::input[1]')
  await contactNameInput.fill('Mobile E2E Buyer')
  await phoneInputs.nth(0).fill('9999999998')

  const sendBtn = pub.getByRole('button', { name: 'Send Enquiry' })
  await expect(sendBtn).toBeVisible()
  const sendBtnBox = await sendBtn.boundingBox()
  expect(sendBtnBox).not.toBeNull()
  expect(sendBtnBox!.x).toBeGreaterThanOrEqual(0)
  expect(sendBtnBox!.x + sendBtnBox!.width).toBeLessThanOrEqual(VIEWPORT.width + 1)

  // ===== 11. ENQUIRY =====
  const [enquiryResponse] = await Promise.all([
    pub.waitForResponse((r) => r.url().includes('/enquiries') && r.request().method() === 'POST'),
    sendBtn.click(),
  ])
  expect(enquiryResponse.ok()).toBeTruthy()

  // ===== 12. SUCCESS SCREEN =====
  await expect(pub.getByText('Enquiry Sent Successfully')).toBeVisible()
  await assertNoOverflow(pub, 'success screen')
  await pub.screenshot({ path: 'test-results/mobile-success.png', fullPage: true })

  await publicContext.close()

  expect(errors, errors.join('\n')).toEqual([])
  expect(apiFailures, apiFailures.join('\n')).toEqual([])
})
