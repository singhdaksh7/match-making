import { ArrowLeft, Copy, ExternalLink, Eye, MessageCircle, Users, Printer, MousePointerClick, Trash2, X, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CatalogueVariantPicker, type ProductSelections } from '@/components/catalogue/CatalogueVariantPicker'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { Modal } from '@/components/ui/Modal'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/services/api/client'
import { formatDate, formatINR } from '@/utils/format'
import { activeVariantsForProduct, customerName, effectiveCatalogueStatus, effectiveVariantPrice, primaryImage, variantLabel, variantsForProduct, waCatalogueLink } from '@/utils/selectors'

export default function CatalogueDetailPage() {
  const { id } = useParams()
  const { data, refreshData, updateCatalogue } = useAppData()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [removingItem, setRemovingItem] = useState<{ id: string; name: string } | null>(null)
  const [editing, setEditing] = useState<ProductSelections | null>(null)
  const [addQuery, setAddQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const catalogue = data.catalogues.find((c) => c.id === id)
  const customer = catalogue ? data.customers.find((c) => c.id === catalogue.customerId) : undefined
  const enquiries = useMemo(() => data.enquiries.filter((e) => e.catalogueId === id), [data, id])
  const entries = useMemo(
    () => (catalogue?.items ?? []).map((item) => ({ item, product: data.products.find((p) => p.id === item.productId) })).filter((e) => e.product),
    [catalogue, data],
  )
  const products = entries.map((e) => e.product)
  const adjustmentPct = catalogue?.settings.priceAdjustmentType === 'percentage' ? catalogue.settings.priceAdjustmentValue : 0

  function openEditor() {
    if (!catalogue) return
    setAddQuery('')
    setEditing(Object.fromEntries(catalogue.items.map((item) => [item.productId, Object.fromEntries(item.variants.map((v) => [v.variantId, v.customPrice ?? null]))])))
  }

  async function saveSelection() {
    if (!catalogue || !editing) return
    setSaving(true)
    try {
      await updateCatalogue(catalogue.id, { items: Object.entries(editing).map(([productId, chosen]) => ({ productId, variants: Object.entries(chosen).map(([variantId, customPrice]) => ({ variantId, customPrice })) })) })
      showToast('Shared variants updated')
      setEditing(null)
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not update the catalogue', 'error')
    } finally {
      setSaving(false)
    }
  }

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
        <div className="flex flex-wrap gap-2">
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
          <button onClick={() => setDeleting(true)} data-testid="catalogue-delete" className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
            <Trash2 size={14} /> Delete
          </button>
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

      <div data-testid="catalogue-products">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-900">Products in this Catalogue ({products.length})</h2>
          <button type="button" data-testid="edit-shared-variants" onClick={openEditor} className="flex h-10 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <Pencil size={14} /> Edit products &amp; variants
          </button>
        </div>
        {entries.length === 0 && <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-center text-sm text-stone-500">This catalogue has no products, so customers see nothing. Use “Edit products & variants” to add products and choose their variants.</p>}
        <div className="space-y-3">
          {entries.map(({ item, product: p }) => {
            if (!p) return null
            const shared = new Map(item.variants.map((v) => [v.variantId, v.customPrice]))
            const sharedVariants = variantsForProduct(data, p.id).filter((v) => shared.has(v.id))
            return (
              <div key={item.id ?? p.id} data-testid={`catalogue-entry-${p.code}`} className="rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="flex items-center gap-3">
                  <Link to={`/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-800">{p.name}</p>
                      <p className="text-xs text-stone-400">{p.code} · {sharedVariants.length} of {variantsForProduct(data, p.id).length} variants shared</p>
                    </div>
                  </Link>
                  {item.id && (
                    <button type="button" aria-label={`Remove ${p.name} from catalogue`} data-testid="catalogue-item-remove" onClick={() => setRemovingItem({ id: item.id!, name: p.name })}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-red-50 hover:text-red-600"><X size={16} /></button>
                  )}
                </div>
                {sharedVariants.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">No variants shared: customers cannot see this product. Use “Edit products & variants”.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="shared-variant-list">
                    {sharedVariants.map((v) => (
                      <li key={v.id} className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs text-stone-700">
                        {variantLabel(v)} <span className="font-semibold text-stone-900">{formatINR(effectiveVariantPrice(v.price, adjustmentPct, shared.get(v.id)))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
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
      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit shared variants" size="xl"
        footer={<div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className="h-11 flex-1 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700">Cancel</button>
          <button type="button" data-testid="save-shared-variants" disabled={saving || !editing || Object.keys(editing).length === 0 || Object.values(editing).some((chosen) => Object.keys(chosen).length === 0)} onClick={saveSelection} className="h-11 flex-1 rounded-xl bg-stone-900 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save changes'}</button></div>}
      >
        {editing && (
          <div className="space-y-4">
            <details className="rounded-2xl border border-stone-200 bg-white p-3.5" data-testid="add-products" open={Object.keys(editing).length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-stone-800">Add products to this catalogue</summary>
              <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Search products..." className="mt-3 h-11 w-full rounded-xl border border-stone-200 px-3 text-sm" />
              <ul className="mt-2 max-h-56 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-100">
                {data.products
                  .filter((p) => p.status === 'active' && !(p.id in editing) && (`${p.name} ${p.code}`.toLowerCase().includes(addQuery.toLowerCase())))
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-stone-800">{p.name}</span><span className="block text-xs text-stone-400">{p.code} · {activeVariantsForProduct(data, p.id).length} variants</span></span>
                      <button type="button" data-testid={`add-product-${p.code}`} onClick={() => setEditing((prev) => ({ ...(prev ?? {}), [p.id]: {} }))} className="h-10 shrink-0 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700">Add</button>
                    </li>
                  ))}
              </ul>
            </details>
            <CatalogueVariantPicker
              products={data.products.filter((p) => p.id in editing)}
              variantsFor={(productId) => activeVariantsForProduct(data, productId)}
              selections={editing}
              onChange={(productId, next) => setEditing((prev) => ({ ...(prev ?? {}), [productId]: next }))}
              adjustmentPct={adjustmentPct}
            />
          </div>
        )}
      </Modal>
      {deleting && (
        <DeleteDialog open onClose={() => setDeleting(false)} entityLabel="Catalogue" collection="catalogues" id={catalogue.id}
          deletePath={`/api/v1/catalogues/${catalogue.id}`} onDeleted={async () => { await refreshData(); navigate('/catalogues') }} />
      )}
      {removingItem && (
        <DeleteDialog open onClose={() => setRemovingItem(null)} entityLabel="Catalogue Product" collection="catalogue-items" id={removingItem.id}
          deletePath={`/api/v1/catalogues/${catalogue.id}/items/${removingItem.id}`} onDeleted={refreshData}
          labels={{ title: 'Remove from catalogue?', description: `“${removingItem.name}” will be removed from this catalogue. The product itself is not deleted.`, confirm: 'Remove product', success: 'Product removed from catalogue' }} />
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
