import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { useAppData } from '@/context/AppDataContext'
import { useCatalogueSelection } from '@/hooks/useCatalogueSelection'
import type { Enquiry } from '@/types'
import { formatINR } from '@/utils/format'
import { primaryImage } from '@/utils/selectors'

export default function CatalogueSelectionPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data, submitEnquiry } = useAppData()
  const selection = useCatalogueSelection(slug ?? '')

  const catalogue = data.catalogues.find((c) => c.slug === slug)
  const customer = catalogue ? data.customers.find((c) => c.id === catalogue.customerId) : undefined

  const [contactName, setContactName] = useState(customer?.contactPerson ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp ?? '')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!catalogue) return <Navigate to="/" replace />

  const rows = selection.items
    .map((item) => {
      const product = data.products.find((p) => p.id === item.productId)
      const variant = data.variants.find((v) => v.id === item.variantId)
      return product && variant ? { item, product, variant } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)

  const estimatedValue = rows.reduce((sum, r) => sum + r.item.quantity * r.variant.price, 0)
  const totalPieces = rows.reduce((sum, r) => sum + r.item.quantity, 0)
  const designCount = new Set(rows.map((r) => r.product.id)).size

  function handleSubmit() {
    if (!contactName.trim() || !phone.trim()) return
    setSubmitting(true)
    const enquiry: Enquiry = {
      id: `enq-${Date.now()}`,
      refNumber: `ENQ-${new Date().getFullYear()}-${String(data.enquiries.length + 1).padStart(4, '0')}`,
      catalogueId: catalogue!.id,
      customerId: catalogue!.customerId,
      businessName: customer?.businessName ?? contactName,
      contactName,
      phone,
      whatsapp: whatsapp || phone,
      message: message || undefined,
      items: rows.map((r) => ({ productId: r.product.id, variantId: r.variant.id, quantity: r.item.quantity, priceAtEnquiry: r.variant.price })),
      estimatedValue,
      status: 'New',
      createdAt: new Date().toISOString(),
      timeline: [{ status: 'New', at: new Date().toISOString() }],
    }
    setTimeout(() => {
      submitEnquiry(enquiry)
      selection.clear()
      navigate(`/catalogue/${slug}/enquiry-success`, { state: { refNumber: enquiry.refNumber, designs: designCount, variants: rows.length, pieces: totalPieces, estimatedValue } })
    }, 500)
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-6">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-stone-100">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-stone-800">Wholesale Selection</p>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No products selected yet" description="Browse the catalogue and add designs to your selection." />
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-stone-900 p-4 text-white"><p className="text-xs text-stone-300">Raj Fashion House</p><div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-bold">{designCount}</p><p className="text-[10px] text-stone-300">Designs</p></div><div><p className="text-lg font-bold">{rows.length}</p><p className="text-[10px] text-stone-300">Variants</p></div><div><p className="text-lg font-bold">{totalPieces}</p><p className="text-[10px] text-stone-300">Total Pieces</p></div></div>{catalogue.settings.showWholesalePrice && <p className="mt-3 border-t border-white/15 pt-3 text-center text-sm font-semibold">Estimated Value: {formatINR(estimatedValue)}</p>}</div>
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.variant.id} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3">
                  <ImageWithFallback src={primaryImage(r.product)} alt={r.product.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800">{r.product.code} · {r.product.name}</p>
                    <p className="text-xs text-stone-400">{r.variant.attributes.fabric ?? 'Fabric'} / {r.variant.attributes.color} / {r.variant.attributes.size}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <QuantitySelector value={r.item.quantity} onChange={(q) => selection.updateQuantity(r.variant.id, q)} min={1} />
                      {catalogue.settings.showWholesalePrice && <p className="text-right text-xs font-semibold text-stone-700">{formatINR(r.variant.price)} · {formatINR(r.variant.price * r.item.quantity)}</p>}
                      <button onClick={() => selection.removeItem(r.variant.id)} className="rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {catalogue.settings.showWholesalePrice && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-100 px-4 py-3">
                <p className="text-sm font-semibold text-stone-700">Estimated Value</p>
                <p className="text-base font-bold text-stone-900">{formatINR(estimatedValue)}</p>
              </div>
            )}

            <div className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-stone-800">Your Details</h3>
              <Field label="Business">
                <input value={customer?.businessName ?? ''} disabled className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-500" />
              </Field>
              <Field label="Contact Name">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              </Field>
              <Field label="Phone">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              </Field>
              <Field label="WhatsApp">
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              </Field>
              <Field label="Message (optional)">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              </Field>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !contactName.trim() || !phone.trim()}
              className="mt-4 w-full rounded-xl bg-stone-900 py-3.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Enquiry'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-500">{label}</label>
      {children}
    </div>
  )
}
