import { BookOpen, Copy, Eye, MessageCircle, MoreVertical, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import type { Catalogue } from '@/types'
import { formatDate } from '@/utils/format'
import { customerName, effectiveCatalogueStatus, waCatalogueLink } from '@/utils/selectors'

export default function CataloguesPage() {
  const { data, duplicateCatalogue, setCatalogueStatus, refreshData } = useAppData()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Catalogue | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return data.catalogues
    const q = query.toLowerCase()
    return data.catalogues.filter((c) => c.name.toLowerCase().includes(q) || customerName(data, c.customerId).toLowerCase().includes(q))
  }, [data, query])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">Catalogues</h1>
          <p className="mt-1 text-sm text-stone-500">{data.catalogues.length} catalogues created</p>
        </div>
        <Link to="/catalogues/new" className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
          <Plus size={16} /> Create Catalogue
        </Link>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search catalogues or customers..." className="max-w-sm" />

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No catalogues yet" action={<Link to="/catalogues/new" className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Create Catalogue</Link>} />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const customer = data.customers.find((x) => x.id === c.customerId)
            const status = effectiveCatalogueStatus(c)
            const link = `${window.location.origin}/catalogue/${c.slug}`
            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/catalogues/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5ede2] text-[#7a5230]"><BookOpen size={18} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-800">{c.name}</p>
                    <p className="text-xs text-stone-400">{customerName(data, c.customerId)} · {c.items.length} products · {formatDate(c.createdAt)}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-center">
                    <p className="text-sm font-bold text-stone-800">{c.views}</p>
                    <p className="text-[10px] text-stone-400">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-stone-800">{data.enquiries.filter((e) => e.catalogueId === c.id).length}</p>
                    <p className="text-[10px] text-stone-400">Enquiries</p>
                  </div>
                  <StatusBadge status={status} />
                  <div className="relative">
                    <button onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100">
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === c.id && (
                      <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl">
                        <MenuItem onClick={() => { navigator.clipboard.writeText(link); showToast('Catalogue link copied'); setMenuOpen(null) }} icon={Copy} label="Copy Link" />
                        <a href={waCatalogueLink(customer?.whatsapp ?? '', `Check out our catalogue: ${link}`)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
                          <MessageCircle size={14} /> WhatsApp
                        </a>
                        <MenuItem onClick={() => { duplicateCatalogue(c.id); showToast('Catalogue duplicated'); setMenuOpen(null) }} icon={Copy} label="Duplicate" />
                        <MenuItem onClick={() => { setCatalogueStatus(c.id, c.status === 'disabled' ? 'active' : 'disabled'); setMenuOpen(null); showToast(c.status === 'disabled' ? 'Catalogue enabled' : 'Catalogue disabled') }} icon={Eye} label={c.status === 'disabled' ? 'Enable' : 'Disable'} />
                        <button onClick={() => { setDeleting(c); setMenuOpen(null) }} data-testid="catalogue-delete" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleting && (
        <DeleteDialog
          open
          onClose={() => setDeleting(null)}
          entityLabel="Catalogue"
          collection="catalogues"
          id={deleting.id}
          deletePath={`/api/v1/catalogues/${deleting.id}`}
          onDeleted={refreshData}
        />
      )}
    </div>
  )
}

function MenuItem({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Copy; label: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
      <Icon size={14} /> {label}
    </button>
  )
}
