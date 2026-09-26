import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import type { Customer, CustomerType } from '@/types'

const TYPES: CustomerType[] = ['Wholesaler', 'Retailer', 'Distributor', 'Reseller']

export default function CustomerFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { data, addCustomer, updateCustomer } = useAppData()
  const { showToast } = useToast()

  const existing = isEdit ? data.customers.find((c) => c.id === id) : undefined
  if (isEdit && !existing) return <Navigate to="/customers" replace />

  const [form, setForm] = useState<Omit<Customer, 'id' | 'status' | 'createdAt'>>({
    businessName: existing?.businessName ?? '',
    contactPerson: existing?.contactPerson ?? '',
    phone: existing?.phone ?? '',
    whatsapp: existing?.whatsapp ?? '',
    email: existing?.email ?? '',
    city: existing?.city ?? '',
    state: existing?.state ?? '',
    type: existing?.type ?? 'Wholesaler',
    gstNumber: existing?.gstNumber ?? '',
    notes: existing?.notes ?? '',
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit() {
    if (!form.businessName.trim() || !form.contactPerson.trim() || !form.phone.trim()) {
      showToast('Please fill in required fields', 'error')
      return
    }
    if (isEdit && existing) {
      updateCustomer(existing.id, form)
      showToast('Customer updated successfully')
      navigate(`/customers/${existing.id}`)
    } else {
      const id = `cust-${Date.now()}`
      addCustomer({ id, ...form, status: 'active', createdAt: new Date().toISOString() })
      showToast('Customer created successfully')
      navigate(`/customers/${id}`)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">{isEdit ? 'Edit Customer' : 'Add New Customer'}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Business Name *" full>
          <input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Contact Person *">
          <input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Customer Type">
          <select value={form.type} onChange={(e) => set('type', e.target.value as CustomerType)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Phone *">
          <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
        </Field>
        <Field label="WhatsApp">
          <input type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+91 98765 43210" className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
        </Field>
        <Field label="Email">
          <input type="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@example.com" className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm" />
        </Field>
        <Field label="GST Number">
          <input value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={(e) => set('city', e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
        <Field label="State">
          <input value={form.state} onChange={(e) => set('state', e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Notes" full>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
        </Field>
      </div>

      <button onClick={handleSubmit} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800 sm:w-auto sm:px-8">
        {isEdit ? 'Save Changes' : 'Add Customer'}
      </button>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="mb-1.5 block text-xs font-semibold text-stone-600">{label}</label>
      {children}
    </div>
  )
}
