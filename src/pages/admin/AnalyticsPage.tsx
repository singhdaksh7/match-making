import { BarChart3, Eye, MessageSquare, TrendingUp, Users } from 'lucide-react'
import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatCard } from '@/components/ui/StatCard'
import { useAppData } from '@/context/AppDataContext'
import { formatNumber } from '@/utils/format'
import { categoryName, customerName, primaryImage } from '@/utils/selectors'

export default function AnalyticsPage() {
  const { data } = useAppData()

  const totalViews = data.catalogues.reduce((s, c) => s + c.views, 0)
  const uniqueCustomers = new Set(data.catalogues.map((c) => c.customerId)).size
  const totalProductViews = data.products.reduce((s, p) => s + p.views, 0)
  const totalEnquiries = data.enquiries.length
  const converted = data.enquiries.filter((e) => e.status === 'Converted').length
  const conversionRate = totalEnquiries ? Math.round((converted / totalEnquiries) * 100) : 0

  const categoryInterest = useMemo(() => {
    const map: Record<string, number> = {}
    data.products.forEach((p) => {
      map[p.categoryId] = (map[p.categoryId] ?? 0) + p.views
    })
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1
    return Object.entries(map)
      .map(([catId, views]) => ({ name: categoryName(data, catId), views, pct: Math.round((views / total) * 100) }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6)
  }, [data])

  const viewsOverTime = useMemo(() => {
    const days = 14
    const out: { day: string; views: number; enquiries: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push({
        day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        views: 15 + Math.round(Math.abs(Math.sin(i)) * 25) + (days - i),
        enquiries: 1 + Math.round(Math.abs(Math.cos(i)) * 3),
      })
    }
    return out
  }, [])

  const mostViewedProducts = [...data.products].sort((a, b) => b.views - a.views).slice(0, 6)

  const mostSelected = useMemo(() => {
    const map: Record<string, number> = {}
    data.enquiries.forEach((e) => e.items.forEach((i) => { map[i.productId] = (map[i.productId] ?? 0) + 1 }))
    return Object.entries(map)
      .map(([productId, count]) => ({ product: data.products.find((p) => p.id === productId), count }))
      .filter((x) => x.product)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [data])

  const topCustomers = useMemo(() => {
    const map: Record<string, { catalogues: number; enquiries: number }> = {}
    data.catalogues.forEach((c) => {
      map[c.customerId] = map[c.customerId] ?? { catalogues: 0, enquiries: 0 }
      map[c.customerId].catalogues++
    })
    data.enquiries.forEach((e) => {
      map[e.customerId] = map[e.customerId] ?? { catalogues: 0, enquiries: 0 }
      map[e.customerId].enquiries++
    })
    return Object.entries(map)
      .map(([customerId, s]) => ({ customerId, ...s }))
      .sort((a, b) => b.enquiries - a.enquiries)
      .slice(0, 6)
  }, [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Analytics</h1>
        <p className="mt-1 text-sm text-stone-500">Insight into catalogue engagement and customer interest</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Catalogue Views" value={formatNumber(totalViews)} icon={Eye} />
        <StatCard label="Unique Customers" value={formatNumber(uniqueCustomers)} icon={Users} />
        <StatCard label="Product Views" value={formatNumber(totalProductViews)} icon={BarChart3} />
        <StatCard label="Enquiries" value={formatNumber(totalEnquiries)} icon={MessageSquare} />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} icon={TrendingUp} />
        <StatCard label="Top Category" value={categoryInterest[0]?.name ?? '—'} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-stone-800">Views & Enquiries Over Time</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={viewsOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 12, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
              <Line type="monotone" dataKey="views" stroke="#7a5230" strokeWidth={2} dot={false} name="Views" />
              <Line type="monotone" dataKey="enquiries" stroke="#8a9a6b" strokeWidth={2} dot={false} name="Enquiries" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold text-stone-800">Category Interest</h3>
          <div className="space-y-3">
            {categoryInterest.map((c) => (
              <div key={c.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-stone-700">{c.name}</span>
                  <span className="text-stone-400">{c.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-100">
                  <div className="h-1.5 rounded-full bg-[#7a5230]" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedList title="Most Viewed Products">
          {mostViewedProducts.map((p, i) => (
            <RankRow key={p.id} rank={i + 1} image={primaryImage(p)} title={p.name} subtitle={`${p.views} views`} />
          ))}
        </RankedList>
        <RankedList title="Most Selected Products">
          {mostSelected.map((x, i) => x.product && (
            <RankRow key={x.product.id} rank={i + 1} image={primaryImage(x.product)} title={x.product.name} subtitle={`${x.count} selections`} />
          ))}
        </RankedList>
      </div>

      <RankedList title="Top Customers">
        {topCustomers.map((c, i) => (
          <div key={c.customerId} className="flex items-center justify-between border-b border-stone-50 px-4 py-3 last:border-0">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-500">{i + 1}</span>
              <p className="text-sm font-medium text-stone-800">{customerName(data, c.customerId)}</p>
            </div>
            <p className="text-xs text-stone-500">{c.catalogues} catalogues · {c.enquiries} enquiries</p>
          </div>
        ))}
      </RankedList>
    </div>
  )
}

function RankedList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  )
}

function RankRow({ rank, image, title, subtitle }: { rank: number; image: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-stone-50 px-4 py-3 last:border-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-500">{rank}</span>
      <ImageWithFallback src={image} alt={title} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-800">{title}</p>
        <p className="text-xs text-stone-400">{subtitle}</p>
      </div>
    </div>
  )
}
