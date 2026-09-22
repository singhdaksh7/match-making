import { Building2, MapPin, Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import type { CustomerType } from '@/types'
import { timeAgo } from '@/utils/format'

const TYPES: CustomerType[] = ['Wholesaler', 'Retailer', 'Distributor', 'Reseller']

export default function CustomersPage() {
  const { data } = useAppData()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')

  const filtered = useMemo(() => {
    let list = data.customers
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((c) => c.businessName.toLowerCase().includes(q) || c.contactPerson.toLowerCase().includes(q) || c.city.toLowerCase().includes(q))
    }
    if (type) list = list.filter((c) => c.type === type)
    return list
  }, [data, query, type])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">Customers</h1>
          <p className="mt-1 text-sm text-stone-500">{data.customers.length} wholesale customers</p>
        </div>
        <Link to="/customers/new" className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
          <Plus size={16} /> Add Customer
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={query} onChange={setQuery} placeholder="Search customers..." className="flex-1" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-600">
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" action={<Link to="/customers/new" className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Add Customer</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} to={`/customers/${c.id}`} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5ede2] text-[#7a5230]">
                  <Building2 size={18} />
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">{c.businessName}</p>
                <p className="text-xs text-stone-500">{c.contactPerson}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-stone-400">
                <MapPin size={12} /> {c.city}, {c.state}
              </div>
              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">{c.type}</span>
                <span className="text-[11px] text-stone-400">Active {timeAgo(c.lastActivityAt ?? c.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
