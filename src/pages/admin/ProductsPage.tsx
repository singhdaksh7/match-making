import { LayoutGrid, List, Plus, Shirt as ShirtIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductCard } from '@/components/product/ProductCard'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterButton, FilterDrawer } from '@/components/ui/FilterDrawer'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { useAppData } from '@/context/AppDataContext'
import { ATTRIBUTES } from '@/data/attributes'
import { formatINR } from '@/utils/format'
import { categoryName, primaryImage, totalStockForProduct, variantsForProduct } from '@/utils/selectors'
import type { Product } from '@/types'

type SortKey = 'newest' | 'oldest' | 'price-asc' | 'price-desc' | 'stock' | 'views'

export default function ProductsPage() {
  const { data } = useAppData()
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [filterOpen, setFilterOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [fabric, setFabric] = useState('')
  const [color, setColor] = useState('')
  const [availability, setAvailability] = useState('')
  const [quickProduct, setQuickProduct] = useState<Product | null>(null)

  const fabricValues = ATTRIBUTES.find((a) => a.id === 'attr-fabric')?.values ?? []
  const colorValues = ATTRIBUTES.find((a) => a.id === 'attr-color')?.values ?? []

  const filtered = useMemo(() => {
    let list = data.products.filter((p) => p.status !== 'archived')
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    }
    if (category) list = list.filter((p) => p.categoryId === category)
    if (fabric) {
      list = list.filter((p) => variantsForProduct(data, p.id).some((v) => v.attributes.fabric === fabric))
    }
    if (color) {
      list = list.filter((p) => variantsForProduct(data, p.id).some((v) => v.attributes.color === color))
    }
    if (availability) {
      list = list.filter((p) => {
        const stock = totalStockForProduct(data, p.id)
        if (availability === 'in-stock') return stock > 20
        if (availability === 'low') return stock > 0 && stock <= 20
        return stock === 0
      })
    }

    const sorted = [...list]
    switch (sort) {
      case 'newest': sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)); break
      case 'oldest': sorted.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); break
      case 'price-asc': sorted.sort((a, b) => a.wholesalePrice - b.wholesalePrice); break
      case 'price-desc': sorted.sort((a, b) => b.wholesalePrice - a.wholesalePrice); break
      case 'stock': sorted.sort((a, b) => totalStockForProduct(data, b.id) - totalStockForProduct(data, a.id)); break
      case 'views': sorted.sort((a, b) => b.views - a.views); break
    }
    return sorted
  }, [data, query, sort, category, fabric, color, availability])

  const activeFilterCount = [category, fabric, color, availability].filter(Boolean).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">Products</h1>
          <p className="mt-1 text-sm text-stone-500">{filtered.length} products in your catalogue</p>
        </div>
        <div className="flex gap-2">
          <Link to="/products/new" className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
            <Plus size={16} /> Add Product
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, code, SKU..." className="flex-1" />
        <div className="flex gap-2">
          <FilterButton active={activeFilterCount > 0} onClick={() => setFilterOpen(true)} />
          {activeFilterCount > 0 && (
            <span className="flex items-center rounded-xl bg-stone-100 px-3 text-xs font-semibold text-stone-600">{activeFilterCount} active</span>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-600 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="stock">Stock</option>
            <option value="views">Most Viewed</option>
          </select>
          <div className="flex rounded-xl border border-stone-200 bg-white p-1">
            <button onClick={() => setView('grid')} className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-stone-900 text-white' : 'text-stone-400'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setView('table')} className={`rounded-lg p-1.5 ${view === 'table' ? 'bg-stone-900 text-white' : 'text-stone-400'}`}>
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShirtIcon}
          title="No products found"
          description="Try adjusting your search or filters, or add a new product to your catalogue."
          action={<Link to="/products/new" className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Add Product</Link>}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => <ProductCard key={p.id} product={p} onQuickView={setQuickProduct} />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Variants</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                      <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-stone-800">{p.name}</p>
                        <p className="text-xs text-stone-400">{p.code}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{categoryName(data, p.categoryId)}</td>
                  <td className="px-4 py-3 font-semibold text-stone-800">{formatINR(p.wholesalePrice)}</td>
                  <td className="px-4 py-3 text-stone-600">{variantsForProduct(data, p.id).length}</td>
                  <td className="px-4 py-3 text-stone-600">{totalStockForProduct(data, p.id)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={() => {}}
        onClear={() => { setCategory(''); setFabric(''); setColor(''); setAvailability('') }}
      >
        <FilterGroup label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Fabric">
          <select value={fabric} onChange={(e) => setFabric(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            <option value="">All fabrics</option>
            {fabricValues.map((v) => <option key={v.id} value={v.value}>{v.value}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Color">
          <select value={color} onChange={(e) => setColor(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            <option value="">All colors</option>
            {colorValues.map((v) => <option key={v.id} value={v.value}>{v.value}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Availability">
          <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            <option value="">All</option>
            <option value="in-stock">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </FilterGroup>
      </FilterDrawer>
      <Modal open={!!quickProduct} onClose={() => setQuickProduct(null)} title="Product Quick View" size="lg" footer={quickProduct && <div className="flex gap-2"><Link to={`/products/${quickProduct.id}`} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-center text-sm font-semibold text-stone-700">View Full Product</Link><Link to={`/catalogues/new`} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-center text-sm font-semibold text-white">Create Catalogue</Link></div>}>
        {quickProduct && <div className="grid gap-5 sm:grid-cols-2"><ImageWithFallback src={primaryImage(quickProduct)} alt={quickProduct.name} className="aspect-[3/4] w-full rounded-2xl object-cover" /><div><p className="font-mono text-xs font-semibold text-stone-400">{quickProduct.code}</p><h2 className="mt-1 font-serif text-xl font-semibold text-stone-900">{quickProduct.name}</h2><p className="mt-1 text-sm text-stone-500">{categoryName(data, quickProduct.categoryId)}</p><p className="mt-4 text-xl font-bold text-stone-900">{formatINR(quickProduct.wholesalePrice)} <span className="text-sm font-normal text-stone-400">Wholesale Price</span></p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-stone-50 p-3 text-stone-600">MOQ<br/><b className="text-stone-900">{quickProduct.moq} pcs</b></p><p className="rounded-xl bg-stone-50 p-3 text-stone-600">Stock<br/><b className="text-stone-900">{totalStockForProduct(data, quickProduct.id)} pcs</b></p><p className="rounded-xl bg-stone-50 p-3 text-stone-600">Variants<br/><b className="text-stone-900">{variantsForProduct(data, quickProduct.id).length}</b></p><p className="rounded-xl bg-stone-50 p-3 text-stone-600">Fabrics<br/><b className="text-stone-900">{[...new Set(variantsForProduct(data, quickProduct.id).map(v => v.attributes.fabric).filter(Boolean))].join(', ')}</b></p></div></div></div>}
      </Modal>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-stone-600">{label}</p>
      {children}
    </div>
  )
}
