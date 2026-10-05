import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

// Delete management through the real admin UI. Needs a running LOCAL stack (web + API + database with one OWNER) — never production:
//   E2E_BASE_URL (default http://127.0.0.1:8088), E2E_ADMIN_EMAIL (default admin@vastraa.test), E2E_ADMIN_PASSWORD (default ChangeMe123!)
// Each test creates its own uniquely named data through the API and removes what it leaves behind.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8088'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@vastraa.test'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!'

test.beforeAll(() => {
  const { hostname } = new URL(baseURL)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Refusing to run destructive tests on non-local host "${hostname}".`)
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

async function login(page: Page) {
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder('Enter your email').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

const post = async (api: APIRequestContext, path: string, data: unknown) => {
  const r = await api.post(`${baseURL}/api/v1${path}`, { data })
  expect(r.status(), `${path} -> ${await r.text()}`).toBeLessThan(300)
  return (await r.json()).data
}
const status = async (api: APIRequestContext, path: string) => (await api.get(`${baseURL}/api/v1${path}`)).status()
const uploadImage = async (api: APIRequestContext) => {
  const r = await api.post(`${baseURL}/api/v1/media`, { multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: PNG } } })
  expect(r.status()).toBe(201); return (await r.json()).data as { objectKey: string; sizeBytes: number }
}

/** category + attribute (2 values) + product with 2 variants + 2 uploaded images */
async function seedProduct(api: APIRequestContext, tag: string) {
  const attribute = await post(api, '/attributes', { name: `E2E Fabric ${tag}`, kind: 'SELECT', supportsImages: false, values: [{ value: 'Rayon' }, { value: 'Cotton' }] })
  const [rayon, cotton] = [attribute.values[0].id, attribute.values[1].id]
  const category = await post(api, '/categories', { name: `E2E Category ${tag}`, slug: `e2e-cat-${tag}`, attributeIds: [attribute.id] })
  const images = [await uploadImage(api), await uploadImage(api)]
  const product = await post(api, '/products', {
    categoryId: category.id, code: `E2E-${tag}`, name: `E2E Kurti ${tag}`, moq: 1, attributeIds: [attribute.id], allowedAttributeValueIds: [rayon, cotton],
    media: images.map((m, i) => ({ objectKey: m.objectKey, mimeType: 'image/png', sizeBytes: m.sizeBytes, primary: i === 0, sortOrder: i })),
    variants: [{ sku: `E2E-${tag}-R`, price: 100, attributeValueIds: [rayon] }, { sku: `E2E-${tag}-C`, price: 100, attributeValueIds: [cotton] }],
  })
  return { attribute, category, product, rayon, cotton }
}
const seedCustomer = (api: APIRequestContext, tag: string) => post(api, '/customers', { businessName: `E2E Buyer ${tag}`, contactPerson: 'Asha', phone: '+919800000009', type: 'WHOLESALER' })
const seedCatalogue = (api: APIRequestContext, tag: string, product: { id: string; variants: { id: string }[] }, customerId?: string) =>
  post(api, '/catalogues', { customerId, title: `E2E Catalogue ${tag}`, status: 'ACTIVE', showPrice: true, items: [{ productId: product.id, variants: product.variants.map((v) => ({ variantId: v.id })) }] })

const dialog = (page: Page) => page.getByTestId('delete-dialog')
/** the Attributes page auto-expands the first attribute: only toggle the header when the panel is not already open */
async function openAttribute(page: Page, name: string) {
  const panelDelete = page.getByTestId('attr-delete')
  await expect(page.getByTestId(`attr-header-${name}`)).toBeVisible()
  if (!(await panelDelete.isVisible())) await page.getByTestId(`attr-header-${name}`).click()
  await expect(panelDelete).toBeVisible()
}
/** VariantTable renders a card list (mobile) and a table (desktop); only one is visible at a time */
const visibleVariantDeletes = (page: Page) => page.locator('[data-testid="variant-delete"]:visible')

test('desktop: product delete asks for confirmation, Cancel keeps it, Delete removes product + variants + images', async ({ page }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  await login(page)
  const { product } = await seedProduct(page.request, tag)
  await page.goto(`${baseURL}/products/${product.id}`)
  await expect(page.getByRole('heading', { name: `E2E Kurti ${tag}` })).toBeVisible()
  await expect(page.getByTestId('product-delete')).toBeVisible()

  await page.getByTestId('product-delete').click()
  await expect(page.getByTestId('delete-title')).toHaveText('Delete Product?')
  await expect(dialog(page)).toContainText(`E2E Kurti ${tag}`)
  await expect(dialog(page)).toContainText('This action cannot be undone')
  await expect(page.getByTestId('delete-removes')).toContainText('2 variants')
  await expect(page.getByTestId('delete-removes')).toContainText('2 images')
  expect(await status(page.request, `/products/${product.id}`)).toBe(200) // nothing deleted by merely opening the dialog

  await page.getByTestId('delete-cancel').click()
  await expect(dialog(page)).toHaveCount(0)
  expect(await status(page.request, `/products/${product.id}`)).toBe(200)
  await expect(page.getByRole('heading', { name: `E2E Kurti ${tag}` })).toBeVisible() // page still usable

  await page.getByTestId('product-delete').click()
  await page.getByTestId('delete-confirm').click()
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByText(`E2E Kurti ${tag}`)).toHaveCount(0)
  expect(await status(page.request, `/products/${product.id}`)).toBe(404)
  await page.goto(`${baseURL}/products`); await expect(page.getByText(`E2E Kurti ${tag}`)).toHaveCount(0)
})

test('desktop: attribute and category in use are blocked with a clear dependency message; page stays usable', async ({ page }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  await login(page)
  const { attribute, category, product } = await seedProduct(page.request, tag)

  await page.goto(`${baseURL}/attributes`)
  await openAttribute(page, `E2E Fabric ${tag}`)
  await page.getByTestId('attr-delete').click()
  await expect(page.getByTestId('delete-blocked-title')).toContainText(`Cannot delete “E2E Fabric ${tag}”`)
  await expect(page.getByTestId('delete-blocked')).toContainText('1 category')
  await expect(page.getByTestId('delete-blocked')).toContainText('1 product')
  await expect(page.getByTestId('delete-blocked')).toContainText('2 variants')
  await expect(page.getByTestId('delete-confirm')).toHaveCount(0)
  await page.getByTestId('delete-cancel').click()
  await expect(page.getByTestId(`attr-header-E2E Fabric ${tag}`)).toBeVisible()

  // a used attribute VALUE is blocked too
  await page.getByRole('button', { name: 'Delete value Rayon' }).first().click()
  await expect(page.getByTestId('delete-blocked')).toContainText('1 variant')
  await page.getByTestId('delete-cancel').click()

  await page.goto(`${baseURL}/categories`)
  await page.getByRole('button', { name: `Delete E2E Category ${tag}` }).click()
  await expect(page.getByTestId('delete-blocked')).toContainText('1 product')
  await page.getByTestId('delete-cancel').click()
  expect(await status(page.request, `/products/${product.id}`)).toBe(200)

  // remove the dependency, then the category and attribute can be deleted from the UI
  expect((await page.request.delete(`${baseURL}/api/v1/products/${product.id}`)).status()).toBe(200)
  await page.reload()
  await page.getByRole('button', { name: `Delete E2E Category ${tag}` }).click()
  await page.getByTestId('delete-confirm').click()
  await expect(page.getByText(`E2E Category ${tag}`)).toHaveCount(0)
  expect(category.id).toBeTruthy(); expect(attribute.id).toBeTruthy()
  await page.goto(`${baseURL}/attributes`)
  await openAttribute(page, `E2E Fabric ${tag}`)
  await page.getByTestId('attr-delete').click()
  await page.getByTestId('delete-confirm').click()
  await expect(page.getByTestId(`attr-header-E2E Fabric ${tag}`)).toHaveCount(0)
})

test('desktop: delete catalogue makes its public link unavailable; the customer is protected while a catalogue exists', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  await login(page)
  const { product } = await seedProduct(page.request, tag)
  const customer = await seedCustomer(page.request, tag)
  const catalogue = await seedCatalogue(page.request, tag, product, customer.id)

  // customer with a catalogue: blocked
  await page.goto(`${baseURL}/customers/${customer.id}`)
  await page.getByTestId('customer-delete').click()
  await expect(page.getByTestId('delete-blocked')).toContainText('1 catalogue')
  await expect(page.getByTestId('delete-hint')).toBeVisible()
  await page.getByTestId('delete-cancel').click()

  // anonymous customer opens the link: works
  const visitor = await browser.newContext(); const vp = await visitor.newPage()
  await vp.goto(`${baseURL}/catalogue/${catalogue.token}`); await expect(vp.getByText(`E2E Kurti ${tag}`).first()).toBeVisible()

  await page.goto(`${baseURL}/catalogues/${catalogue.id}`)
  await page.getByTestId('catalogue-delete').click()
  await expect(page.getByTestId('delete-title')).toHaveText('Delete Catalogue?')
  await page.getByTestId('delete-confirm').click()
  await expect(page).toHaveURL(/\/catalogues$/)
  expect(await status(page.request, `/products/${product.id}`)).toBe(200) // product kept
  await vp.goto(`${baseURL}/catalogue/${catalogue.token}`); await expect(vp.getByText('Catalogue not found')).toBeVisible()
  await visitor.close()

  // now the customer has no catalogue: delete works
  await page.goto(`${baseURL}/customers/${customer.id}`)
  await page.getByTestId('customer-delete').click()
  await page.getByTestId('delete-confirm').click()
  await expect(page).toHaveURL(/\/customers$/)
  expect(await status(page.request, `/customers/${customer.id}`)).toBe(404)
  await page.request.delete(`${baseURL}/api/v1/products/${product.id}`)
})

test('desktop: delete a general product image from the edit form (persists after reload); remove a product from a catalogue', async ({ page }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  await login(page)
  const { product } = await seedProduct(page.request, tag)
  await page.goto(`${baseURL}/products/${product.id}/edit`)
  // media lives on the "Images" step of the form; step through until the image grid shows
  const grid = page.getByTestId('media-delete')
  for (let i = 0; i < 6 && (await grid.count()) === 0; i++) await page.getByRole('button', { name: /^Continue/ }).click()
  await expect(grid).toHaveCount(2)
  await grid.first().click()
  await expect(page.getByTestId('delete-title')).toHaveText('Delete Image?')
  await page.getByTestId('delete-cancel').click()
  await expect(grid).toHaveCount(2)
  await grid.first().click(); await page.getByTestId('delete-confirm').click()
  await expect(grid).toHaveCount(1)
  const detail = await (await page.request.get(`${baseURL}/api/v1/products/${product.id}`)).json()
  expect(detail.data.media).toHaveLength(1); expect(detail.data.media[0].primary).toBe(true) // next image promoted

  // catalogue: remove one product but never the last one
  const second = await seedProduct(page.request, `${tag}b`)
  const catalogue = await post(page.request, '/catalogues', { title: `E2E Multi ${tag}`, status: 'ACTIVE', items: [product, second.product].map((p) => ({ productId: p.id, variants: p.variants.map((v: { id: string }) => ({ variantId: v.id })) })) })
  await page.goto(`${baseURL}/catalogues/${catalogue.id}`)
  await expect(page.getByTestId('catalogue-item-remove')).toHaveCount(2)
  await page.getByTestId('catalogue-item-remove').first().click()
  await expect(page.getByTestId('delete-title')).toHaveText('Remove from catalogue?')
  await page.getByTestId('delete-confirm').click()
  await expect(page.getByTestId('catalogue-item-remove')).toHaveCount(1)
  await page.getByTestId('catalogue-item-remove').first().click()
  await expect(page.getByTestId('delete-blocked')).toContainText('only product')
  await page.getByTestId('delete-cancel').click()
  await page.request.delete(`${baseURL}/api/v1/catalogues/${catalogue.id}`)
  for (const id of [product.id, second.product.id]) await page.request.delete(`${baseURL}/api/v1/products/${id}`)
})

test('desktop: enquiries are history — open ones are protected, a CLOSED one can be deleted', async ({ page }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  await login(page)
  const { product } = await seedProduct(page.request, tag)
  const catalogue = await seedCatalogue(page.request, tag, product)
  const full = await (await page.request.get(`${baseURL}/api/v1/products/${product.id}`)).json()
  const enquiry = await page.request.post(`${baseURL}/api/v1/public/catalogues/${catalogue.token}/enquiries`, { data: { contactName: 'Buyer E2E', phone: '+919811111111', items: [{ productId: product.id, variantId: full.data.variants[0].id, quantity: 3 }] } })
  expect(enquiry.status()).toBeLessThan(300)
  const list = await (await page.request.get(`${baseURL}/api/v1/enquiries?limit=100`)).json()
  const enq = list.data.find((e: { contactName: string }) => e.contactName === 'Buyer E2E')

  // the product is now referenced by an enquiry: delete is blocked and archive is offered
  await page.goto(`${baseURL}/products/${product.id}`)
  await page.getByTestId('product-delete').click()
  await expect(page.getByTestId('delete-blocked')).toContainText('1 customer enquiry')
  await expect(page.getByTestId('delete-archive')).toBeVisible()
  await page.getByTestId('delete-cancel').click()

  await page.goto(`${baseURL}/enquiries/${enq.id}`)
  await page.getByTestId('enquiry-delete').click()
  await expect(page.getByTestId('delete-blocked')).toContainText('only CLOSED enquiries can be deleted')
  await page.getByTestId('delete-cancel').click()
  expect((await page.request.patch(`${baseURL}/api/v1/enquiries/${enq.id}/status`, { data: { status: 'CLOSED' } })).status()).toBe(204)
  await page.reload()
  await page.getByTestId('enquiry-delete').click()
  await page.getByTestId('delete-confirm').click()
  await expect(page).toHaveURL(/\/enquiries$/)
  expect(await status(page.request, `/enquiries`)).toBe(200)
  await page.request.delete(`${baseURL}/api/v1/catalogues/${catalogue.id}`)
  await page.request.delete(`${baseURL}/api/v1/products/${product.id}`)
})

test('mobile 390px: delete buttons are reachable, the dialog fits the viewport, confirm and cancel work, no horizontal scroll', async ({ browser }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await login(page)
  const { product } = await seedProduct(page.request, tag)
  await page.goto(`${baseURL}/products/${product.id}`)
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await noOverflow()

  // variant delete (card layout on mobile)
  await expect(visibleVariantDeletes(page).first()).toBeVisible()
  await visibleVariantDeletes(page).first().click()
  const box = await dialog(page).boundingBox(); expect(box && box.width <= 390 && box.x >= 0).toBeTruthy()
  await expect(page.getByTestId('delete-title')).toHaveText('Delete Variant?')
  await page.getByTestId('delete-cancel').click()
  await expect(visibleVariantDeletes(page)).toHaveCount(2)
  await visibleVariantDeletes(page).first().click(); await page.getByTestId('delete-confirm').click()
  await expect(visibleVariantDeletes(page)).toHaveCount(1)

  // product delete
  await page.getByTestId('product-delete').scrollIntoViewIfNeeded()
  await page.getByTestId('product-delete').click()
  const confirm = page.getByTestId('delete-confirm'); await expect(confirm).toBeVisible()
  const cb = await confirm.boundingBox(); expect(cb && cb.x >= 0 && cb.x + cb.width <= 390).toBeTruthy()
  await confirm.click()
  await expect(page).toHaveURL(/\/products$/)
  await noOverflow()
  expect(await status(page.request, `/products/${product.id}`)).toBe(404)
  await context.close()
})
