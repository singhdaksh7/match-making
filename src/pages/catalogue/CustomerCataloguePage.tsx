import { Lock, PackageSearch, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { CatalogueProductCard } from '@/components/catalogue/CatalogueProductCard'
import { ActiveFilterChips, FilterButton, FilterPanel, FilterSheet } from '@/components/catalogue/CatalogueFilters'
import { SelectionTray } from '@/components/catalogue/SelectionTray'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAppData } from '@/context/AppDataContext'
import { useCatalogueSelection } from '@/hooks/useCatalogueSelection'
import { activeFilterCount, buildFacets, filterProducts, reconcileSelection, toggleValue, type AttributeSelection } from '@/utils/catalogueFilters'
import { catalogueProductVariants, catalogueProducts, customerName, effectiveCatalogueStatus, isCatalogueExpired } from '@/utils/selectors'

export default function CustomerCataloguePage() {
  const { slug } = useParams()
  const { data, recordCatalogueVisit } = useAppData()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [pinInput, setPinInput] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const visitRecorded = useState(() => ({ done: false }))[0]

  const catalogue = data.catalogues.find((c) => c.slug === slug)
  const selection = useCatalogueSelection(slug ?? '')

  useEffect(() => {
    if (catalogue && !visitRecorded.done) {
      visitRecorded.done = true
      recordCatalogueVisit(catalogue.slug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue?.id])

  if (!catalogue) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-6">
        <EmptyState icon={PackageSearch} title="Catalogue not found" description="This link may have expired or been removed." />
      </div>
    )
  }

  const status = effectiveCatalogueStatus(catalogue)
  if (status === 'disabled' || status === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-6">
        <EmptyState icon={Lock} title={status === 'expired' ? 'This catalogue has expired' : 'This catalogue is no longer available'} description={`Please contact ${data.settings.business.name} for an updated link.`} />
      </div>
    )
  }

  if (catalogue.settings.pinProtected && !unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-6">
        <div className="w-full max-w-xs rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <Lock size={22} className="mx-auto mb-3 text-stone-400" />
          <h2 className="font-serif text-lg font-semibold text-stone-900">Protected Catalogue</h2>
          <p className="mt-1 text-sm text-stone-500">Enter the PIN shared with you to continue.</p>
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            maxLength={4}
            className="mt-4 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-center text-lg tracking-widest"
            placeholder="****"
          />
          <button
            onClick={() => setUnlocked(pinInput === catalogue.settings.pin)}
            className="mt-3 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white"
          >
            Unlock
          </button>
        </div>
      </div>
    )
  }

  return <CatalogueContent catalogue={catalogue} slug={slug!} query={query} setQuery={setQuery} category={category} setCategory={setCategory} selectionCount={selection.items.length} />
}

function CatalogueContent({ catalogue, slug, query, setQuery, category, setCategory, selectionCount }: any) {
  const { data } = useAppData()
  const customer = data.customers.find((c) => c.id === catalogue.customerId)
  const customerLabel = customer?.businessName ?? ''
  const products = useMemo(() => catalogueProducts(data, catalogue), [data, catalogue])

  const categories = useMemo(() => {
    const ids = [...new Set(products.map((p: any) => p.categoryId))]
    return ids.map((id) => data.categories.find((c) => c.id === id)).filter(Boolean)
  }, [products, data])

  // Only the variants this catalogue shares ever reach the filters.
  const filterable = useMemo(() => products.map((p: any) => ({ id: p.id, name: p.name, code: p.code, categoryId: p.categoryId, variants: catalogueProductVariants(data, catalogue, p) })), [products, data, catalogue])
  const attributeNames = useMemo(() => Object.fromEntries(products.flatMap((p: any) => (p.publicAttributes ?? []).map((a: any) => [a.key, a.name]))), [products])
  const [selection, setSelection] = useState<AttributeSelection>({})
  const [sheetOpen, setSheetOpen] = useState(false)

  // Facets describe the current category only, so switching category can never leave a filter that no longer applies.
  const facets = useMemo(() => buildFacets(filterable.filter((p: any) => category === 'all' || p.categoryId === category), attributeNames), [filterable, category, attributeNames])

  const filteredIds = useMemo(() => new Set(filterProducts(filterable, { categoryId: category, query, selection }).map((p: any) => p.id)), [filterable, category, query, selection])
  const filtered = useMemo(() => products.filter((p: any) => filteredIds.has(p.id)), [products, filteredIds])
  const filterCount = activeFilterCount(selection)

  const chooseCategory = (id: string) => {
    setCategory(id)
    const next = buildFacets(filterable.filter((p: any) => id === 'all' || p.categoryId === id), attributeNames)
    setSelection((current) => reconcileSelection(current, next))
  }
  const toggle = (key: string, value: string) => setSelection((current) => toggleValue(current, key, value))
  const clearFilters = () => setSelection({})
  const categoryOptions = categories.map((c: any) => ({ id: c.id, name: c.name }))

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-24">
      <div className="sticky top-0 z-30 bg-stone-900 text-white">
        <div className="mx-auto max-w-5xl px-5 py-6 text-center">
          <p className="font-serif text-base font-semibold">{data.settings.business.name}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-stone-300">Private Wholesale Collection{customerLabel ? ' · Prepared for' : ''}</p>
          {customerLabel && <p className="text-lg font-semibold">{customerLabel}</p>}
          <p className="mt-1 text-sm text-stone-300">{catalogue.name}</p>
          {catalogue.message && <p className="mx-auto mt-3 max-w-md text-sm text-stone-200">{catalogue.message}</p>}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-stone-300">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium">{products.length} Designs</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium">{products.reduce((count: number, p: any) => count + catalogueProductVariants(data, catalogue, p).length, 0)} Variants</span>
          </div>
        </div>
        <div className="border-t border-white/10 bg-stone-900/95 px-4 py-3">
          <div className="relative mx-auto max-w-5xl">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designs..."
              className="w-full rounded-xl border border-white/10 bg-white/10 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-stone-400 focus:outline-none"
            />
          </div>
          <div className="mx-auto mt-3 flex max-w-5xl gap-2 overflow-x-auto no-scrollbar">
            <FilterButton count={filterCount} onClick={() => setSheetOpen(true)} />
            <Chip active={category === 'all'} onClick={() => chooseCategory('all')}>All</Chip>
            {categories.map((c: any) => (
              <Chip key={c.id} active={category === c.id} onClick={() => chooseCategory(c.id)}>{c.name}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 py-5 sm:px-6">
        {facets.length > 0 && (
          <aside className="hidden w-60 shrink-0 lg:block" aria-label="Filters" data-testid="filter-sidebar">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-900">Filters</p>
              {filterCount > 0 && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-stone-600 underline underline-offset-2">Clear all</button>}
            </div>
            <FilterPanel facets={facets} selection={selection} onToggle={toggle} />
          </aside>
        )}
        <div className="min-w-0 flex-1">
          <ActiveFilterChips facets={facets} selection={selection} onToggle={toggle} onClear={clearFilters} />
          <p data-testid="result-count" className="mb-3 text-xs font-medium text-stone-500">{filtered.length} {filtered.length === 1 ? 'design' : 'designs'}</p>
          {filtered.length === 0 ? (
            <div data-testid="no-results">
              <EmptyState icon={PackageSearch} title="No designs found" description={filterCount > 0 ? 'No design has a variant matching all of these filters. Try removing a filter.' : 'Try a different search or category.'} />
              {filterCount > 0 && <button type="button" onClick={clearFilters} className="mx-auto mt-3 block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">Clear all filters</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              {filtered.map((p: any) => {
                const variants = catalogueProductVariants(data, catalogue, p)
                return <CatalogueProductCard key={p.id} product={p} variants={variants} catalogue={catalogue} slug={slug} />
              })}
            </div>
          )}
        </div>
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onClear={clearFilters} resultCount={filtered.length} facets={facets} selection={selection} onToggle={toggle} categories={categoryOptions} category={category} onCategory={chooseCategory} />

      {catalogue.settings.allowProductSelection && <SelectionTray slug={slug} count={selectionCount} />}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-white text-stone-900' : 'bg-white/10 text-stone-200 hover:bg-white/20'}`}
    >
      {children}
    </button>
  )
}
