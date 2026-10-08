/**
 * Dynamic attribute filters for a shared catalogue.
 *
 * Everything here is derived from the variants the catalogue actually shares (Attribute -> value -> Product -> Variant);
 * no attribute name or category is hardcoded. The caller must pass only shared variants.
 */

export interface FilterVariant {
  attributes: Record<string, string>
}

export interface FilterProduct<V extends FilterVariant = FilterVariant> {
  id: string
  name: string
  code: string
  categoryId: string
  variants: V[]
}

/** attribute key -> chosen values (OR within one attribute, AND across attributes). */
export type AttributeSelection = Record<string, string[]>

export interface Facet {
  key: string
  name: string
  values: string[]
}

const SIZE_ORDER = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', 'xxxl', '3xl', '4xl', '5xl', '6xl', '7xl']

/** XS < S < M < L < XL < XXL, numbers numerically (28 < 30 < 32), anything else alphabetically. */
export function compareValues(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a.trim().toLowerCase())
  const ib = SIZE_ORDER.indexOf(b.trim().toLowerCase())
  if (ia >= 0 && ib >= 0) return ia - ib
  if (ia >= 0) return -1
  if (ib >= 0) return 1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const PRIORITY = ['size', 'color', 'colour']
const rank = (key: string) => {
  const i = PRIORITY.indexOf(key.toLowerCase())
  return i < 0 ? PRIORITY.length : i
}

/** Human label for an attribute key (names are keyed lowercase; a name map wins when available). */
const titleCase = (key: string) => key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function buildFacets<V extends FilterVariant>(products: FilterProduct<V>[], names: Record<string, string> = {}): Facet[] {
  const byKey = new Map<string, Set<string>>()
  for (const product of products) {
    for (const variant of product.variants) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        if (!value) continue
        const set = byKey.get(key) ?? new Set<string>()
        set.add(value) // a Set: a value can never be listed twice
        byKey.set(key, set)
      }
    }
  }
  return [...byKey.entries()]
    .map(([key, values]) => ({ key, name: names[key] ?? titleCase(key), values: [...values].sort(compareValues) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name))
}

export function activeFilterCount(selection: AttributeSelection): number {
  return Object.values(selection).reduce((sum, values) => sum + values.length, 0)
}

/** Drops every selected key/value that the given facets do not offer (used when the category changes). */
export function reconcileSelection(selection: AttributeSelection, facets: Facet[]): AttributeSelection {
  const next: AttributeSelection = {}
  for (const facet of facets) {
    const kept = (selection[facet.key] ?? []).filter((value) => facet.values.includes(value))
    if (kept.length) next[facet.key] = kept
  }
  return next
}

export function toggleValue(selection: AttributeSelection, key: string, value: string): AttributeSelection {
  const current = selection[key] ?? []
  const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  const next = { ...selection }
  if (values.length) next[key] = values
  else delete next[key]
  return next
}

/** True when ONE variant satisfies every selected attribute (any chosen value within each attribute). */
export function variantMatches(variant: FilterVariant, selection: AttributeSelection): boolean {
  return Object.entries(selection).every(([key, values]) => values.length === 0 || values.includes(variant.attributes[key]))
}

export function filterProducts<V extends FilterVariant, P extends FilterProduct<V>>(
  products: P[],
  { categoryId = 'all', query = '', selection = {} }: { categoryId?: string; query?: string; selection?: AttributeSelection },
): P[] {
  const q = query.trim().toLowerCase()
  return products.filter((product) => {
    if (categoryId !== 'all' && product.categoryId !== categoryId) return false
    if (q && !product.name.toLowerCase().includes(q) && !product.code.toLowerCase().includes(q)) return false
    return activeFilterCount(selection) === 0 || product.variants.some((variant) => variantMatches(variant, selection))
  })
}
