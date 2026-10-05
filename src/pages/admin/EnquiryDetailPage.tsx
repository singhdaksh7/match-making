import { ArrowLeft, Check, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import type { EnquiryStatus } from '@/types'
import { formatDateTime, formatINR } from '@/utils/format'
import { primaryImage, variantLabel, waCatalogueLink } from '@/utils/selectors'

const FLOW: EnquiryStatus[] = ['New', 'Contacted', 'Negotiating', 'Converted', 'Closed']

export default function EnquiryDetailPage() {
  const { id } = useParams()
  const { data, updateEnquiryStatus, refreshData } = useAppData()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const enquiry = data.enquiries.find((e) => e.id === id)
  if (!enquiry) return <Navigate to="/enquiries" replace />

  const currentIdx = FLOW.indexOf(enquiry.status)
  const totalPieces = enquiry.items.reduce((sum, item) => sum + item.quantity, 0)
  const designs = new Set(enquiry.items.map((item) => item.productId)).size

  function nextAction() {
    if (currentIdx >= FLOW.length - 1) return null
    return FLOW[currentIdx + 1]
  }

  return (
    <div className="space-y-6">
      <Link to="/enquiries" className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft size={16} /> Back to Enquiries
      </Link>
      <div className="flex justify-end">
        <button onClick={() => setDeleting(true)} data-testid="enquiry-delete" className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
          <Trash2 size={14} /> Delete enquiry
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-stone-400">{enquiry.refNumber}</p>
                <h1 className="font-serif text-xl font-semibold text-stone-900">{enquiry.businessName}</h1>
                <p className="mt-1 text-sm text-stone-500">{enquiry.contactName}</p>
              </div>
              <StatusBadge status={enquiry.status} />
            </div>
            {enquiry.message && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm italic text-stone-600">"{enquiry.message}"</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Designs', designs], ['Variants', enquiry.items.length], ['Total Pieces', totalPieces], ['Estimated Value', formatINR(enquiry.estimatedValue)]].map(([label, value]) => <div key={label} className="rounded-xl border border-stone-200 bg-white p-3"><p className="text-[11px] font-semibold uppercase text-stone-400">{label}</p><p className="mt-1 text-lg font-bold text-stone-800">{value}</p></div>)}
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-stone-900">Selected Products</h2>
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {enquiry.items.map((item, i) => {
                // The enquiry's own snapshots win: they stay correct after the product or variant is edited or deleted.
                const product = data.products.find((p) => p.id === item.productId)
                const name = item.productName ?? product?.name ?? 'Product'
                const attributes = item.attributes ?? data.variants.find((v) => v.id === item.variantId)?.attributes ?? {}
                const label = variantLabel({ attributes, sku: item.sku ?? '' })
                return (
                  <div key={i} data-testid="enquiry-line" className="flex items-center gap-3 border-b border-stone-50 p-3.5 last:border-0">
                    <ImageWithFallback src={item.imageUrl ?? (product ? primaryImage(product) : '')} alt={name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800">{name}</p>
                      <p className="text-xs text-stone-500">{label}{item.sku ? <span className="font-mono text-stone-400"> · {item.sku}</span> : null}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="text-stone-500">{item.quantity} × {formatINR(item.priceAtEnquiry)}</p>
                      <p className="font-semibold text-stone-800">{formatINR(item.quantity * item.priceAtEnquiry)}</p>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between bg-stone-50 px-4 py-3">
                <p className="text-sm font-semibold text-stone-700">Total Estimate</p>
                <p className="text-base font-bold text-stone-900">{formatINR(enquiry.estimatedValue)}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-stone-900">Timeline</h2>
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
              {enquiry.timeline.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={12} /></span>
                  <div>
                    <p className="text-sm font-medium text-stone-700">{t.status}</p>
                    <p className="text-xs text-stone-400">{formatDateTime(t.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-stone-800">Customer</h3>
            <p className="text-sm font-medium text-stone-800">{enquiry.contactName}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500"><Phone size={12} /> {enquiry.phone}</p>
            <a href={waCatalogueLink(enquiry.whatsapp, `Hi ${enquiry.contactName}, thank you for your enquiry ${enquiry.refNumber}.`)} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              <MessageCircle size={14} /> WhatsApp Customer
            </a>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-stone-800">Update Status</h3>
            <div className="space-y-2">
              {nextAction() && (
                <button
                  onClick={() => { updateEnquiryStatus(enquiry.id, nextAction()!); showToast(`Marked as ${nextAction()}`) }}
                  className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  Mark as {nextAction()}
                </button>
              )}
              {enquiry.status === 'New' && <button onClick={() => { updateEnquiryStatus(enquiry.id, 'Contacted'); showToast('Marked as Contacted') }} className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">Mark Contacted</button>}
              {enquiry.status !== 'Negotiating' && enquiry.status !== 'Converted' && enquiry.status !== 'Closed' && <button onClick={() => { updateEnquiryStatus(enquiry.id, 'Negotiating'); showToast('Marked as Negotiating') }} className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">Negotiating</button>}
              {enquiry.status !== 'Converted' && enquiry.status !== 'Closed' && <button onClick={() => { updateEnquiryStatus(enquiry.id, 'Converted'); showToast('Marked as Converted') }} className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">Converted</button>}
              {enquiry.status !== 'Closed' && (
                <button
                  onClick={() => { updateEnquiryStatus(enquiry.id, 'Closed'); showToast('Enquiry closed') }}
                  className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Close Enquiry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {deleting && (
        <DeleteDialog open onClose={() => setDeleting(false)} entityLabel="Enquiry" collection="enquiries" id={enquiry.id}
          deletePath={`/api/v1/enquiries/${enquiry.id}`} onDeleted={async () => { await refreshData(); navigate('/enquiries') }} />
      )}
    </div>
  )
}
