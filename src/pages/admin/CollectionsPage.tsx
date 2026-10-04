import { ArrowRight, Layers, Package, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { useAppData } from '@/context/AppDataContext'
import { formatDate } from '@/utils/format'

export default function CollectionsPage() {
  const { data, refreshData } = useAppData()
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  return <div className="space-y-5">
    <div><h1 className="font-serif text-2xl font-semibold text-stone-900">Collections</h1><p className="mt-1 text-sm text-stone-500">Group designs into ready-to-share wholesale stories.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.collections.map((collection) => {
        const products = collection.productIds.map((id) => data.products.find((p) => p.id === id)).filter(Boolean)
        const categories = [...new Set(products.map((p) => data.categories.find((c) => c.id === p!.categoryId)?.name).filter(Boolean))]
        return <div key={collection.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/5">
          <div className="relative aspect-[16/8] bg-stone-100"><ImageWithFallback src={collection.coverImage} alt={collection.name} className="h-full w-full object-cover" /><span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">READY TO SHARE</span></div>
          <div className="p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-lg font-semibold text-stone-900">{collection.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-500">{collection.description}</p></div><Layers size={18} className="shrink-0 text-[#7a5230]" /></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{categories.slice(0, 3).map((category) => <span key={category} className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600">{category}</span>)}</div>
            <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500"><span className="flex items-center gap-1"><Package size={13} /> {products.length} designs</span><span>Created {formatDate(collection.createdAt)}</span></div>
            <Link to={`/catalogues/new?collection=${collection.id}`} className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">Create Catalogue <ArrowRight size={15} /></Link>
            <button onClick={() => setDeleting({ id: collection.id, name: collection.name })} data-testid="collection-delete" className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete collection</button>
          </div>
        </div>
      })}
    </div>
    {deleting && <DeleteDialog open onClose={() => setDeleting(null)} entityLabel="Collection" collection="collections" id={deleting.id} deletePath={`/api/v1/collections/${deleting.id}`} onDeleted={refreshData} />}
  </div>
}
