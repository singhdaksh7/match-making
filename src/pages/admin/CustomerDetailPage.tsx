import {
  ArrowLeft, BookOpen, Building2, Edit3, Mail, MapPin, MessageSquare,
  Phone, Plus, Clock, Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { formatDate, formatINR, timeAgo } from '@/utils/format'

type Tab = 'overview' | 'catalogues' | 'enquiries' | 'activity'

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { data, archiveCustomer, refreshData } = useAppData()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  const customer = data.customers.find((c) => c.id === id)
  const catalogues = useMemo(() => data.catalogues.filter((c) => c.customerId === id), [data, id])
  const enquiries = useMemo(() => data.enquiries.filter((e) => e.customerId === id), [data, id])
  const activities = useMemo(() => data.customerActivities.filter((a) => a.customerId === id), [data, id])

  if (!customer) return <Navigate to="/customers" replace />

  const totalViews = catalogues.reduce((sum, c) => sum + c.views, 0)

  return (
    <div className="space-y-6">
      <Link to="/customers" className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft size={16} /> Back to Customers
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5ede2] text-[#7a5230]">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">{customer.businessName}</h1>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-stone-500">{customer.contactPerson} · {customer.type}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/customers/${customer.id}/edit`} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <Edit3 size={14} /> Edit
          </Link>
          <button onClick={() => setDeleting(true)} data-testid="customer-delete" className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
            <Trash2 size={14} /> Delete
          </button>
          <Link to={`/catalogues/new?customer=${customer.id}`} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
            <Plus size={14} /> Create Catalogue
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Catalogues Sent" value={catalogues.length} />
        <Stat label="Catalogue Views" value={totalViews} />
        <Stat label="Enquiries" value={enquiries.length} />
        <Stat label="Orders" value={enquiries.filter((e) => e.status === 'Converted').length} />
        <Stat label="Last Activity" value={timeAgo(customer.lastActivityAt ?? customer.createdAt)} small />
      </div>

      <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
        {(['overview', 'catalogues', 'enquiries', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
          <InfoRow icon={Phone} label="Phone" value={customer.phone} />
          <InfoRow icon={MessageSquare} label="WhatsApp" value={customer.whatsapp} />
          <InfoRow icon={Mail} label="Email" value={customer.email} />
          <InfoRow icon={MapPin} label="Location" value={`${customer.city}, ${customer.state}`} />
          <InfoRow icon={Building2} label="GST Number" value={customer.gstNumber || 'Not provided'} />
          {customer.notes && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Notes</p>
              <p className="text-sm text-stone-600">{customer.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'catalogues' && (
        <div className="space-y-3">
          {catalogues.length === 0 && <EmptyCard text="No catalogues created yet for this customer." />}
          {catalogues.map((c) => (
            <Link key={c.id} to={`/catalogues/${c.id}`} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 hover:bg-stone-50">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5ede2] text-[#7a5230]"><BookOpen size={16} /></span>
                <div>
                  <p className="text-sm font-semibold text-stone-800">{c.name}</p>
                  <p className="text-xs text-stone-400">{c.items.length} products · {c.views} views · {formatDate(c.createdAt)}</p>
                </div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}

      {tab === 'enquiries' && (
        <div className="space-y-3">
          {enquiries.length === 0 && <EmptyCard text="No enquiries from this customer yet." />}
          {enquiries.map((e) => (
            <Link key={e.id} to={`/enquiries/${e.id}`} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 hover:bg-stone-50">
              <div>
                <p className="text-sm font-semibold text-stone-800">{e.refNumber}</p>
                <p className="text-xs text-stone-400">{e.items.length} items · {formatINR(e.estimatedValue)} · {formatDate(e.createdAt)}</p>
              </div>
              <StatusBadge status={e.status} />
            </Link>
          ))}
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-3">
          {[...activities.map((a) => ({ at: a.createdAt, text: a.title, detail: a.detail })), ...catalogues.map((c) => ({ at: c.createdAt, text: `Catalogue "${c.name}" created`, detail: undefined as string | undefined })), ...enquiries.map((e) => ({ at: e.createdAt, text: `Enquiry ${e.refNumber} submitted`, detail: undefined as string | undefined }))]
            .sort((a, b) => +new Date(b.at) - +new Date(a.at))
            .map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-stone-100 bg-white p-3.5">
                <Clock size={14} className="mt-0.5 text-stone-400" />
                <div>
                  <p className="text-sm text-stone-700">{item.text}</p>
                  {item.detail && <p className="text-xs text-stone-500">{item.detail}</p>}
                  <p className="text-xs text-stone-400">{timeAgo(item.at)}</p>
                </div>
              </div>
            ))}
        </div>
      )}
      {deleting && (
        <DeleteDialog
          open
          onClose={() => setDeleting(false)}
          entityLabel="Customer"
          collection="customers"
          id={customer.id}
          deletePath={`/api/v1/customers/${customer.id}`}
          onDeleted={async () => { await refreshData(); navigate('/customers') }}
          archive={customer.status === 'inactive' ? undefined : { label: 'Archive instead', onArchive: async () => { await archiveCustomer(customer.id); showToast('Customer archived'); navigate('/customers') } }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-center">
      <p className={`font-bold text-stone-900 ${small ? 'text-sm' : 'text-lg'}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-400">{label}</p>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><Icon size={14} /></span>
      <div>
        <p className="text-xs text-stone-400">{label}</p>
        <p className="text-sm font-medium text-stone-800">{value}</p>
      </div>
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-400">{text}</div>
}
