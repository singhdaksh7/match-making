import { MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppData } from '@/context/AppDataContext'
import type { EnquiryStatus } from '@/types'
import { formatDate, formatINR } from '@/utils/format'

const STATUSES: EnquiryStatus[] = ['New', 'Contacted', 'Negotiating', 'Converted', 'Closed']

export default function EnquiriesPage() {
  const { data } = useAppData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  const filtered = useMemo(() => {
    let list = [...data.enquiries].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((e) => e.businessName.toLowerCase().includes(q) || e.refNumber.toLowerCase().includes(q))
    }
    if (status) list = list.filter((e) => e.status === status)
    return list
  }, [data, query, status])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Enquiries</h1>
        <p className="mt-1 text-sm text-stone-500">{data.enquiries.length} enquiries received</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatus('')} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${!status ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>All</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${status === s ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{s}</button>
        ))}
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search by business name or reference..." className="max-w-sm" />

      {filtered.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No enquiries found" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/60 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Enquiry</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Estimated Value</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <Link to={`/enquiries/${e.id}`} className="font-mono text-xs font-semibold text-stone-700">{e.refNumber}</Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-stone-800">{e.businessName}</td>
                  <td className="px-4 py-3 text-stone-600">{e.items.length} items</td>
                  <td className="px-4 py-3 font-semibold text-stone-800">{formatINR(e.estimatedValue)}</td>
                  <td className="px-4 py-3 text-stone-500">{formatDate(e.createdAt)}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
