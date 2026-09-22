import { ArrowLeft, Copy, ExternalLink, Eye, MessageCircle, Users, Printer, MousePointerClick } from 'lucide-react'
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/utils/format'
import { customerName, effectiveCatalogueStatus, primaryImage, waCatalogueLink } from '@/utils/selectors'

export default function CatalogueDetailPage() {
  const { id } = useParams()
  const { data } = useAppData()
  const { showToast } = useToast()

  const catalogue = data.catalogues.find((c) => c.id === id)
  const customer = catalogue ? data.customers.find((c) => c.id === catalogue.customerId) : undefined
  const enquiries = useMemo(() => data.enquiries.filter((e) => e.catalogueId === id), [data, id])
  const products = useMemo(
    () => catalogue?.items.map((i) => data.products.find((p) => p.id === i.productId)).filter(Boolean) ?? [],
    [catalogue, data],
  )

  if (!catalogue) return <Navigate to="/catalogues" replace />

  const link = `${window.location.origin}/catalogue/${catalogue.slug}`

  return (
    <div className="space-y-6">
      <Link to="/catalogues" className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft size={16} /> Back to Catalogues
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">{catalogue.name}</h1>
            <StatusBadge status={effectiveCatalogueStatus(catalogue)} />
          </div>
          <p className="mt-1 text-sm text-stone-500">For {customerName(data, catalogue.customerId)} · Created {formatDate(catalogue.createdAt)}</p>
          {catalogue.message && <p className="mt-2 max-w-lg text-sm italic text-stone-500">"{catalogue.message}"</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(link); showToast('Catalogue link copied') }} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <Copy size={14} /> Copy Link
          </button>
          <a href={waCatalogueLink(customer?.whatsapp ?? '', `Check out our catalogue: ${link}`)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            <MessageCircle size={14} /> WhatsApp
          </a>
          <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
            <ExternalLink size={14} /> Open
          </a>
          <button onClick={() => { const win = window.open(link, '_blank'); win?.addEventListener('load', () => win.print()) }} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Printer size={14} /> Export PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatBox icon={Eye} label="Views" value={catalogue.views} />
        <StatBox icon={Users} label="Unique Visitors" value={catalogue.uniqueVisitors} />
        <StatBox icon={MousePointerClick} label="Products Viewed" value={Math.max(catalogue.items.length, Math.round(catalogue.views * .7))} />
        <StatBox icon={Users} label="Products Selected" value={enquiries.reduce((n, e) => n + e.items.length, 0)} />
        <StatBox icon={MessageCircle} label="Enquiries" value={enquiries.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="mb-3 text-base font-semibold text-stone-900">Most Viewed Products</h2>{products.slice().sort((a, b) => (b?.views ?? 0) - (a?.views ?? 0)).slice(0, 3).map((p) => p && <div key={p.id} className="flex justify-between border-t border-stone-100 py-2.5 text-sm"><span className="font-medium text-stone-700">{p.code} · {p.name}</span><span className="text-stone-400">{p.views} views</span></div>)}</div><div className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="mb-3 text-base font-semibold text-stone-900">Customer Activity</h2>{data.customerActivities.filter((a) => a.customerId === catalogue.customerId).slice(0, 3).map((a) => <div key={a.id} className="border-t border-stone-100 py-2.5"><p className="text-sm font-medium text-stone-700">{a.title}</p><p className="text-xs text-stone-400">{a.detail}</p></div>)}</div></div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-stone-900">Products in this Catalogue ({products.length})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => p && (
            <Link key={p.id} to={`/products/${p.id}`} className="overflow-hidden rounded-xl border border-stone-200 bg-white hover:shadow-md">
              <div className="aspect-[3/4] bg-stone-100"><ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-full w-full object-cover" /></div>
              <div className="p-2">
                <p className="truncate text-xs font-semibold text-stone-800">{p.name}</p>
                <p className="text-[11px] text-stone-400">{p.code}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {enquiries.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-stone-900">Enquiries from this Catalogue</h2>
          <div className="space-y-2">
            {enquiries.map((e) => (
              <Link key={e.id} to={`/enquiries/${e.id}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3.5 hover:bg-stone-50">
                <div>
                  <p className="text-sm font-semibold text-stone-800">{e.refNumber}</p>
                  <p className="text-xs text-stone-400">{formatDate(e.createdAt)}</p>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center">
      <Icon size={16} className="mx-auto mb-1.5 text-stone-400" />
      <p className="text-lg font-bold text-stone-900">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  )
}
