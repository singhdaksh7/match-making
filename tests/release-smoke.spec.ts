import { test, expect } from '@playwright/test'

const baseURL = 'http://127.0.0.1:8088'

test('inspect running production-like stack', async ({ page, context }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const apiResponses: string[] = []
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text()) })
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('response', response => { if (response.url().includes('/api/')) apiResponses.push(`${response.status()} ${response.url()}`) })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill('admin@vastraa.demo')
  await page.getByPlaceholder('••••••••').fill('ChangeMe123!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/dashboard/)
  await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible()
  await page.waitForTimeout(1000)
  expect(apiResponses.join('\n')).toContain('200 http://127.0.0.1:8088/api/v1/products?limit=100')

  for (const [path, text] of [['/products', 'K-101'], ['/customers', 'Raj Fashion House'], ['/inventory/collections', 'September New Arrivals']] as const) {
    await page.goto(`${baseURL}${path}`)
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
    await page.reload()
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
  }

  const publicContext = await context.browser()!.newContext({ viewport: { width: 1440, height: 900 } })
  const publicPage = await publicContext.newPage()
  await publicPage.goto(`${baseURL}/catalogue/vastraa-demo-catalogue`)
  await expect(publicPage.getByText('K-101', { exact: true })).toBeVisible()
  await publicPage.getByText('K-101', { exact: true }).click()
  await expect(publicPage.getByText('Floral Rayon Straight Kurti')).toBeVisible()
  await publicPage.getByRole('button', { name: 'Rayon' }).click()
  await publicPage.getByRole('button', { name: 'Black' }).click()
  await publicPage.getByRole('button', { name: 'XL', exact: true }).click()
  await publicPage.getByRole('button', { name: 'Add to Selection' }).click()
  await publicPage.goto(`${baseURL}/catalogue/vastraa-demo-catalogue/product/cmudsiiij000hns610dm1zgky`)
  await publicPage.getByRole('button', { name: 'Rayon' }).click()
  await publicPage.getByRole('button', { name: 'Maroon' }).click()
  await publicPage.getByRole('button', { name: 'L', exact: true }).click()
  await publicPage.getByRole('button', { name: 'Add to Selection' }).click()
  await publicPage.getByRole('button', { name: /2 Products Selected/ }).click()
  // The summary renders count and label in separate elements: assert the Variants tile shows 2,
  // and that both independently selected variants are listed.
  await expect(publicPage.locator('div:has(> p:text-is("Variants"))').locator('p').first()).toHaveText('2')
  await expect(publicPage.getByText('Rayon / Black / XL')).toBeVisible()
  await expect(publicPage.getByText('Rayon / Maroon / L')).toBeVisible()
  // Contact name and phone are required before an enquiry can be sent.
  const sendEnquiry = publicPage.getByRole('button', { name: 'Send Enquiry' })
  await expect(sendEnquiry).toBeDisabled()
  await publicPage.locator('label', { hasText: 'Contact Name' }).locator('xpath=following-sibling::input[1]').fill('Release Smoke Buyer')
  await publicPage.locator('input[type="tel"]').nth(0).fill('9999999999')
  await expect(sendEnquiry).toBeEnabled()
  await sendEnquiry.click()
  await expect(publicPage.getByText('Enquiry Sent Successfully')).toBeVisible()
  await publicPage.screenshot({ path: 'test-results/public-success.png', fullPage: true })
  await publicContext.close()
  expect(errors, `${errors.join('\n')}\n${apiResponses.join('\n')}`).toEqual([])
})
