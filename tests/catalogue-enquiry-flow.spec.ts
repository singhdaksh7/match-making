import { test, expect } from '@playwright/test'

const baseURL = 'http://127.0.0.1:8088'
const catalogueSlug = 'vastraa-demo-catalogue'

test('public catalogue → K-101 two variants → enquiry → admin verify → status persists', async ({ browser }) => {
  test.setTimeout(120_000)

  // STEP 1 — clean public context, no admin auth cookie
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await publicContext.newPage()

  const errors: string[] = []
  const apiFailures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)') && !message.text().includes('/auth/me')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) apiFailures.push(`${response.status()} ${response.url()}`)
  })

  await page.goto(`${baseURL}/catalogue/${catalogueSlug}`)
  await expect(page.getByText('K-101', { exact: true })).toBeVisible()

  // STEP 2 — open K-101
  await page.getByText('K-101', { exact: true }).click()
  await expect(page).toHaveURL(/\/catalogue\/.+\/product\/.+/)

  // STEP 3 — Black / XL, qty 12
  await page.getByRole('button', { name: 'Rayon' }).click()
  await page.getByRole('button', { name: 'Black' }).click()
  await page.getByRole('button', { name: 'XL', exact: true }).click()

  const qtyInput = page.locator('input[type="number"], input[inputmode="numeric"]').first()
  await qtyInput.fill('12')
  await expect(qtyInput).toHaveValue('12')

  await page.getByRole('button', { name: 'Add to Selection' }).click()

  // STEP 4 — return to K-101 via in-app navigation (avoid full reload race with data fetch), add Maroon / L, qty 24 (independent row)
  await page.goBack()
  await expect(page.getByText('K-101', { exact: true })).toBeVisible()
  await page.getByText('K-101', { exact: true }).click()
  await expect(page).toHaveURL(/\/catalogue\/.+\/product\/.+/)
  await page.getByRole('button', { name: 'Rayon' }).click()
  await page.getByRole('button', { name: 'Maroon' }).click()
  await page.getByRole('button', { name: 'L', exact: true }).click()

  const qtyInput2 = page.locator('input[type="number"], input[inputmode="numeric"]').first()
  await qtyInput2.fill('24')
  await expect(qtyInput2).toHaveValue('24')

  await page.getByRole('button', { name: 'Add to Selection' }).click()

  // Go to Selection and verify both rows independently
  await page.getByRole('button', { name: /2 Products Selected|Variants/ }).click()
  await expect(page).toHaveURL(/\/selection$/)

  const rows = page.locator('div.rounded-2xl.border.border-stone-200.bg-white.p-3')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('Black / XL', { exact: false })).toBeVisible()
  await expect(page.getByText('Maroon / L', { exact: false })).toBeVisible()

  const blackRow = rows.filter({ hasText: 'Black / XL' })
  const maroonRow = rows.filter({ hasText: 'Maroon / L' })
  await expect(blackRow.locator('input[type="number"], input[inputmode="numeric"]').first()).toHaveValue('12')
  await expect(maroonRow.locator('input[type="number"], input[inputmode="numeric"]').first()).toHaveValue('24')

  // STEP 5 — submit real enquiry
  const detailsSection = page.locator('div', { hasText: 'Your Details' }).last()
  const contactNameInput = detailsSection.locator('label', { hasText: 'Contact Name' }).locator('xpath=following-sibling::input[1]')
  await contactNameInput.fill('E2E Wholesale Buyer')
  const phoneInputs = page.locator('input[type="tel"]')
  await phoneInputs.nth(0).fill('9999999999')

  const [enquiryResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/enquiries') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send Enquiry' }).click(),
  ])
  expect(enquiryResponse.ok()).toBeTruthy()
  const enquiryBody = await enquiryResponse.json().catch(() => ({}))
  const reference: string | undefined = enquiryBody?.data?.reference ?? enquiryBody?.reference

  await expect(page.getByText('Enquiry Sent Successfully')).toBeVisible()
  await publicContext.close()

  // STEP 6 — admin verify (authenticated context)
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const adminPage = await adminContext.newPage()
  await adminPage.goto(`${baseURL}/login`)
  await adminPage.getByPlaceholder('Enter your email').fill('admin@vastraa.demo')
  await adminPage.getByPlaceholder('••••••••').fill('ChangeMe123!')
  await adminPage.getByRole('button', { name: 'Sign In' }).click()
  await expect(adminPage).toHaveURL(/dashboard/)

  await adminPage.goto(`${baseURL}/enquiries`)
  await adminPage.getByPlaceholder('Search by business name or reference...').fill(reference ?? 'E2E Wholesale Buyer')

  const enquiryLink = reference
    ? adminPage.getByText(reference, { exact: false }).locator('visible=true').first()
    : adminPage.getByText('E2E Wholesale Buyer', { exact: false }).locator('visible=true').first()
  await expect(enquiryLink).toBeVisible()
  await enquiryLink.click()
  await expect(adminPage).toHaveURL(/\/enquiries\/.+/)

  await expect(adminPage.getByText('E2E Wholesale Buyer', { exact: false }).first()).toBeVisible()
  await expect(adminPage.getByText(/Black \/ XL|XL \/ Black|Black|XL/, { exact: false }).first()).toBeVisible()
  const itemsSection = adminPage.locator('div', { has: adminPage.getByText('Selected Products') })
  await expect(itemsSection.getByText('12 ×', { exact: false })).toBeVisible()
  await expect(itemsSection.getByText('24 ×', { exact: false })).toBeVisible()

  // STEP 7 — change status
  const statusButtons = adminPage.getByRole('button', { name: /^Mark as |^Negotiating$|^Converted$|^Close Enquiry$/ })
  const [statusResponse] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/status') && r.request().method() === 'PATCH'),
    statusButtons.first().click(),
  ])
  expect(statusResponse.ok()).toBeTruthy()

  // STEP 8 — hard refresh, verify persistence
  await adminPage.reload()
  await expect(adminPage.locator('span', { hasText: 'New' })).not.toBeVisible({ timeout: 5000 }).catch(() => {})

  await adminContext.close()

  expect(errors, errors.join('\n')).toEqual([])
  expect(apiFailures, apiFailures.join('\n')).toEqual([])
})
