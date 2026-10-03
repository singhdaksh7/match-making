import { test, expect, type Page } from '@playwright/test'

const baseURL = 'http://127.0.0.1:8088'

async function assertNoOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth - clientWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(1)
}

test('add product attribute flow on desktop and mobile', async ({ browser }) => {
  test.setTimeout(180_000)

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto(`${baseURL}/login`)
    await page.getByPlaceholder('admin@vastraa.demo').fill('admin@vastraa.demo')
    await page.getByPlaceholder('••••••••').fill('ChangeMe123!')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL(/dashboard/)

    await page.goto(`${baseURL}/products/new`)
    await expect(page.getByText('Basic Information')).toBeVisible()
    await page.getByPlaceholder('e.g. Floral Rayon Straight Kurti').fill('Attribute Flow Kurti')
    await page.getByPlaceholder('e.g. K-101').fill(`AF-${viewport.width}`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Step 2 of 7')).toBeVisible()
    await page.locator('select').selectOption({ label: 'Kurti' }).catch(async () => {
      await page.locator('select').selectOption({ index: 1 })
    })
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Step 3 of 7')).toBeVisible()
    await expect(page.getByText(/No attributes are configured/).or(page.getByText('Color').first()).or(page.getByText('Fabric').first()).first()).toBeVisible()
    await assertNoOverflow(page, `add-product attributes ${viewport.width}`)
    await context.close()
  }
})
