import assert from 'node:assert/strict'
import test from 'node:test'
import { activeFilterCount, buildFacets, compareValues, filterProducts, reconcileSelection, toggleValue } from '../src/utils/catalogueFilters.ts'
import { parseQuantity, quantityError } from '../src/components/ui/QuantitySelector.tsx'

const v = (color: string, size: string, extra: Record<string, string> = {}) => ({ attributes: { color, size, ...extra } })
const productA = { id: 'A', name: 'Alpha Shirt', code: 'A1', categoryId: 'shirts', variants: [v('Black', 'M'), v('Blue', 'XL')] }
const productB = { id: 'B', name: 'Beta Shirt', code: 'B1', categoryId: 'shirts', variants: [v('Black', 'XL'), v('White', 'L')] }
const kurti = { id: 'K', name: 'Kurti', code: 'K1', categoryId: 'kurtis', variants: [{ attributes: { size: 'S', fabric: 'Cotton', sleeve: 'Short' } }] }
const all = [productA, productB, kurti]
const ids = (list: { id: string }[]) => list.map((p) => p.id)

test('same-variant matching: Black + XL only matches the product with a Black/XL variant', () => {
  const result = filterProducts(all, { selection: { color: ['Black'], size: ['XL'] } })
  assert.deepEqual(ids(result), ['B']) // A has Black and XL, but on two different variants
})

test('OR within one attribute, AND across attributes', () => {
  assert.deepEqual(ids(filterProducts(all, { selection: { size: ['M', 'L'] } })), ['A', 'B'])
  assert.deepEqual(ids(filterProducts(all, { selection: { size: ['M', 'L'], color: ['White'] } })), ['B'])
})

test('a product lacking a selected attribute is excluded', () => {
  assert.deepEqual(ids(filterProducts(all, { selection: { fabric: ['Cotton'] } })), ['K'])
})

test('category, search and attributes combine', () => {
  assert.deepEqual(ids(filterProducts(all, { categoryId: 'shirts', query: 'beta', selection: { size: ['XL'] } })), ['B'])
  assert.deepEqual(ids(filterProducts(all, { categoryId: 'shirts', query: 'beta', selection: { size: ['M'] } })), [])
  assert.deepEqual(ids(filterProducts(all, { categoryId: 'kurtis' })), ['K'])
})

test('facets are dynamic per category, deduplicated and sensibly ordered', () => {
  const shirts = buildFacets(all.filter((p) => p.categoryId === 'shirts'))
  assert.deepEqual(shirts.map((f) => f.key), ['size', 'color'])
  assert.deepEqual(shirts[0].values, ['M', 'L', 'XL'])
  assert.deepEqual(shirts[1].values, ['Black', 'Blue', 'White'])
  const kurtis = buildFacets(all.filter((p) => p.categoryId === 'kurtis'), { sleeve: 'Sleeve Type' })
  assert.deepEqual(kurtis.map((f) => f.name), ['Size', 'Fabric', 'Sleeve Type'])
})

test('only shared values appear: facets are built from the variants passed in', () => {
  const shared = { ...productA, variants: [v('Black', 'M'), v('Blue', 'M')] } // L / XL not shared
  const sizes = buildFacets([shared]).find((f) => f.key === 'size')!
  assert.deepEqual(sizes.values, ['M'])
})

test('size and numeric ordering', () => {
  assert.deepEqual(['XXL', 'M', 'XS', 'L', 'S', 'XL'].sort(compareValues), ['XS', 'S', 'M', 'L', 'XL', 'XXL'])
  assert.deepEqual(['32', '28', '30'].sort(compareValues), ['28', '30', '32'])
})

test('toggle, count and reconcile on category change', () => {
  let selection = toggleValue({}, 'size', 'XL')
  selection = toggleValue(selection, 'size', 'L')
  selection = toggleValue(selection, 'fabric', 'Cotton')
  assert.equal(activeFilterCount(selection), 3)
  assert.deepEqual(toggleValue(selection, 'fabric', 'Cotton').fabric, undefined)
  const shirtFacets = buildFacets(all.filter((p) => p.categoryId === 'shirts'))
  assert.deepEqual(reconcileSelection(selection, shirtFacets), { size: ['XL', 'L'] }) // fabric no longer applies
})

test('quantity parsing never coerces', () => {
  for (const ok of ['1', '12', '100', '1000', '1000000', ' 7 ']) assert.ok(parseQuantity(ok) !== null, ok)
  assert.equal(parseQuantity('12'), 12)
  for (const bad of ['', '0', '-3', '1.5', '12abc', 'abc', '1000001', '1e3']) assert.equal(parseQuantity(bad), null, bad)
  assert.equal(quantityError('12'), null)
  assert.ok(quantityError('') && quantityError('0') && quantityError('2000000') && quantityError('1.5'))
})
