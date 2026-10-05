// Pure storefront logic: image priority when a variant is chosen, and price math/formatting. No database or browser needed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveGallery, variantThumbnail } from '../src/utils/gallery.ts'
import { effectiveVariantPrice, variantLabel, variantPriceRange } from '../src/utils/selectors.ts'
import { formatINR, formatPriceRange } from '../src/utils/format.ts'
import { commonPriceOf, derivePricingMode, mostCommonPrice, pricesDiffer } from '../src/utils/pricingMode.ts'
import type { Product } from '../src/types/index.ts'

const img = (url: string, sortOrder = 0) => ({ id: url, url, sortOrder })
const product: Product = {
  id: 'p1', code: 'P1', name: 'Kurti', categoryId: '', description: '', moq: 1, status: 'active', views: 0, createdAt: '', updatedAt: '',
  attributeIds: [], allowedAttributeValueIds: [],
  media: [{ id: 'm1', url: '/general-1.png', isPrimary: true }, { id: 'm2', url: '/general-2.png', isPrimary: false }],
  imageAttributeKeys: ['color'], // Size is NOT image-capable
  attributeImages: [
    { attributeKey: 'color', attributeName: 'Color', valueId: 'red', value: 'Red', images: [img('/red-1.png'), img('/red-2.png', 1)] },
    { attributeKey: 'color', attributeName: 'Color', valueId: 'blue', value: 'Blue', images: [img('/blue-1.png')] },
  ],
}
const urls = (g: ReturnType<typeof resolveGallery>) => g.images.map((i) => i.url)

test('no selection: general photos only', () => {
  const g = resolveGallery(product, {}, [])
  assert.equal(g.context, null); assert.deepEqual(urls(g), ['/general-1.png', '/general-2.png'])
})

test('choosing an image-capable value (Color) switches to that value\'s photos first, general photos trail', () => {
  const g = resolveGallery(product, { color: 'Blue' }, ['color'])
  assert.deepEqual(g.context, { attributeKey: 'color', value: 'Blue' })
  assert.deepEqual(urls(g), ['/blue-1.png', '/general-1.png', '/general-2.png'])
  assert.equal(g.images[0].source, 'attribute'); assert.equal(g.images[1].source, 'general')
  assert.ok(!urls(g).includes('/red-1.png'), 'photos of unselected values never appear')
})

test('choosing a non-image attribute (Size) never changes the gallery', () => {
  const before = resolveGallery(product, { color: 'Red' }, ['color'])
  const after = resolveGallery(product, { color: 'Red', size: 'XL' }, ['color', 'size'])
  assert.deepEqual(urls(after), urls(before)); assert.deepEqual(after.context, before.context)
  assert.equal(resolveGallery(product, { size: 'XL' }, ['size']).context, null)
})

test('the most recent image-capable pick wins; a value without photos falls back to the previous one', () => {
  const two = { ...product, imageAttributeKeys: ['color', 'fabric'], attributeImages: [...product.attributeImages!, { attributeKey: 'fabric', attributeName: 'Fabric', valueId: 'cotton', value: 'Cotton', images: [img('/cotton-1.png')] }] }
  assert.deepEqual(resolveGallery(two, { color: 'Red', fabric: 'Cotton' }, ['color', 'fabric']).context, { attributeKey: 'fabric', value: 'Cotton' })
  assert.deepEqual(resolveGallery(two, { color: 'Red', fabric: 'Silk' }, ['color', 'fabric']).context, { attributeKey: 'color', value: 'Red' })
})

test('an exact variant\'s own photos (VariantMedia) take precedence over attribute and general photos', () => {
  const g = resolveGallery(product, { color: 'Blue' }, ['color'], {}, { id: 'v-blue-m', images: [{ url: '/blue-m-exact.png' }] })
  assert.deepEqual(urls(g), ['/blue-m-exact.png', '/blue-1.png', '/general-1.png', '/general-2.png'])
  assert.equal(g.images[0].source, 'variant'); assert.deepEqual(g.context, { attributeKey: 'variant', value: 'v-blue-m' })
  // a variant without photos of its own leaves the attribute rule in charge
  assert.deepEqual(urls(resolveGallery(product, { color: 'Blue' }, ['color'], {}, { id: 'v2', images: [] })), ['/blue-1.png', '/general-1.png', '/general-2.png'])
})

test('single-valued image attributes count as selected by default, below an explicit pick', () => {
  assert.deepEqual(resolveGallery(product, {}, [], { color: 'Red' }).context, { attributeKey: 'color', value: 'Red' })
  assert.deepEqual(resolveGallery(product, { color: 'Blue' }, ['color'], { color: 'Red' }).context, { attributeKey: 'color', value: 'Blue' })
})

test('variantThumbnail follows the same priority (variant photo > attribute photo > main photo)', () => {
  assert.equal(variantThumbnail(product, { attributes: { color: 'Blue', size: 'M' }, images: [{ url: '/own.png' }] }), '/own.png')
  assert.equal(variantThumbnail(product, { attributes: { color: 'Blue', size: 'M' } }), '/blue-1.png')
  assert.equal(variantThumbnail(product, { attributes: { color: 'Green', size: 'M' } }), '/general-1.png')
})

test('catalogue percentage is exact: 600 + 10% = 660, no float artefacts, custom price overrides', () => {
  assert.equal(effectiveVariantPrice(600, 10), 660)
  assert.equal(effectiveVariantPrice(100, 10), 110)
  assert.equal(effectiveVariantPrice(0.1, 10), 0.11)
  assert.equal(effectiveVariantPrice(33.33, 10), 36.66)
  assert.equal(effectiveVariantPrice(640, -10), 576)
  assert.equal(effectiveVariantPrice(640, 0), 640)
  assert.equal(effectiveVariantPrice(640, 10, 700), 700)
  assert.equal(effectiveVariantPrice(640, 10, null), 704)
})

test('price range and formatting', () => {
  assert.deepEqual(variantPriceRange([{ price: 650 }, { price: 620 }, { price: 660 }]), { min: 620, max: 660 })
  assert.equal(variantPriceRange([]), undefined)
  assert.equal(formatINR(620), '₹620'); assert.equal(formatINR(679.5), '₹679.50'); assert.equal(formatINR(1234567), '₹12,34,567')
  assert.equal(formatPriceRange({ min: 620, max: 680 }), '₹620 – ₹680'); assert.equal(formatPriceRange({ min: 620, max: 620 }), '₹620'); assert.equal(formatPriceRange(undefined), '')
  assert.equal(variantLabel({ attributes: { size: 'M', color: 'Red' }, sku: 'X' }), 'Red / M'); assert.equal(variantLabel({ attributes: {}, sku: 'SKU-1' }), 'SKU-1')
})

test('pricing mode is derived from variant prices, never stored', () => {
  assert.equal(derivePricingMode([650, 650, 650]), 'same'); assert.equal(derivePricingMode([650]), 'same'); assert.equal(derivePricingMode([]), 'same')
  assert.equal(derivePricingMode([600, 600, 650]), 'different')
  assert.equal(commonPriceOf([650, 650]), '650'); assert.equal(commonPriceOf([600, 650]), ''); assert.equal(commonPriceOf([]), '')
})

test('switching helpers: differing prices need confirmation, new variants get the most used price', () => {
  assert.equal(pricesDiffer(['600', '600', '650']), true); assert.equal(pricesDiffer(['650', '650', '']), false); assert.equal(pricesDiffer(['650', 'x', '0']), false)
  assert.equal(mostCommonPrice(['600', '600', '650']), '600'); assert.equal(mostCommonPrice(['600', '650']), '600'); assert.equal(mostCommonPrice(['', '0']), '')
})
