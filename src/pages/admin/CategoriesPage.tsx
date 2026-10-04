import { FolderTree, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { imagesForCategory } from '@/data/images'
import type { Category } from '@/types'
import { slugify } from '@/utils/format'
import { totalStockForProduct, variantsForProduct } from '@/utils/selectors'

export default function CategoriesPage() {
  const { data, addCategory, updateCategory, refreshData } = useAppData()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [attrIds, setAttrIds] = useState<string[]>([])

  const filtered = data.categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  const stats = useMemo(() => {
    const map: Record<string, { products: number; variants: number; stock: number }> = {}
    for (const cat of data.categories) {
      const products = data.products.filter((p) => p.categoryId === cat.id)
      const variants = products.flatMap((p) => variantsForProduct(data, p.id))
      const stock = products.reduce((sum, p) => sum + totalStockForProduct(data, p.id), 0)
      map[cat.id] = { products: products.length, variants: variants.length, stock }
    }
    return map
  }, [data])

  function openCreate() {
    setEditing(null)
    setName('')
    setAttrIds([])
    setModalOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setName(cat.name)
    setAttrIds(cat.attributeIds)
    setModalOpen(true)
  }

  function handleSave() {
    if (!name.trim()) return
    if (editing) {
      updateCategory(editing.id, { name, attributeIds: attrIds })
      showToast('Category updated successfully')
    } else {
      addCategory({
        id: `cat-${Date.now()}`,
        name,
        slug: slugify(name),
        imageUrl: imagesForCategory(slugify(name), 1)[0],
        attributeIds: attrIds,
        status: 'active',
        createdAt: new Date().toISOString(),
      })
      showToast('Category created successfully')
    }
    setModalOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">Categories</h1>
          <p className="mt-1 text-sm text-stone-500">{data.categories.length} categories</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
          <Plus size={16} /> Add Category
        </button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search categories..." className="max-w-sm" />

      {filtered.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories found" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cat) => {
            const s = stats[cat.id] ?? { products: 0, variants: 0, stock: 0 }
            return (
              <div key={cat.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="relative h-32">
                  <ImageWithFallback src={cat.imageUrl} alt={cat.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <h3 className="font-serif text-lg font-semibold text-white">{cat.name}</h3>
                    <StatusBadge status={cat.status} />
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100 text-center">
                  <div className="py-3"><p className="text-sm font-bold text-stone-800">{s.products}</p><p className="text-[11px] text-stone-400">Products</p></div>
                  <div className="py-3"><p className="text-sm font-bold text-stone-800">{s.variants}</p><p className="text-[11px] text-stone-400">Variants</p></div>
                  <div className="py-3"><p className="text-sm font-bold text-stone-800">{s.stock}</p><p className="text-[11px] text-stone-400">Pieces</p></div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <button onClick={() => openEdit(cat)} className="text-xs font-semibold text-[#7a5230] hover:underline">Edit</button>
                  <button onClick={() => setDeleting(cat)} aria-label={`Delete ${cat.name}`} data-testid="category-delete" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'Add Category'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Category Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" placeholder="e.g. Dresses" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Applicable Attributes</label>
            <div className="flex flex-wrap gap-2">
              {data.attributes.map((attr) => (
                <button
                  key={attr.id}
                  onClick={() => setAttrIds((prev) => prev.includes(attr.id) ? prev.filter((a) => a !== attr.id) : [...prev, attr.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${attrIds.includes(attr.id) ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}
                >
                  {attr.name}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSave} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800">
            {editing ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </Modal>

      {deleting && (
        <DeleteDialog
          open
          onClose={() => setDeleting(null)}
          entityLabel="Category"
          collection="categories"
          id={deleting.id}
          deletePath={`/api/v1/categories/${deleting.id}`}
          onDeleted={refreshData}
        />
      )}
    </div>
  )
}
