import {
  AlertTriangle, BookOpen, Eye, MessageSquare, Package, Plus, Shirt,
  TrendingUp, Users, Boxes,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { useAppData } from '@/context/AppDataContext'
import { useAuth } from '@/context/AuthContext'
import { formatINR, formatNumber, timeAgo } from '@/utils/format'
import { customerName, lowStockVariants, primaryImage, totalStockForProduct } from '@/utils/selectors'

const PALETTE = ['#7a5230', '#b98a54', '#d9b98a', '#e8dcc8', '#8a9a6b', '#6b8a9a', '#9a6b6b', '#8a6b9a', '#5c5a2e']

export default function DashboardPage() {
  const { data } = useAppData()
  const { user } = useAuth()

  const stats = useMemo(() => {
    const activeProducts = data.products.filter((p) => p.status === 'active')
    const activeCatalogues = data.catalogues.filter((c) => c.status === 'active')
    const newEnquiries = data.enquiries.filter((e) => e.status === 'New')
    const lowStock = lowStockVariants(data)
    return {
      products: activeProducts.length,
      variants: data.variants.length,
      customers: data.customers.filter((c) => c.status === 'active').length,
      catalogues: activeCatalogues.length,
      enquiries: newEnquiries.length,
      lowStock: lowStock.length,
    }
  }, [data])

  const inventoryTrend = useMemo(() => {
    const days = 7
    const out: { day: string; stock: number; sold: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push({
        day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        stock: 4200 + Math.round(Math.sin(i) * 300) + i * 40,
        sold: 60 + Math.round(Math.cos(i) * 20) + i * 3,
      })
    }
    return out
  }, [])

  const categoryDistribution = useMemo(() => {
    return data.categories
      .map((cat) => ({
        name: cat.name,
        value: data.products.filter((p) => p.categoryId === cat.id && p.status === 'active').length,
      }))
      .filter((c) => c.value > 0)
  }, [data])

  const recentEnquiries = useMemo(
    () => [...data.enquiries].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5),
    [data.enquiries],
  )

  const recentProducts = useMemo(
    () => [...data.products].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5),
    [data.products],
  )

  const topViewed = useMemo(
    () => [...data.products].sort((a, b) => b.views - a.views).slice(0, 5),
    [data.products],
  )

  const lowStock = useMemo(() => lowStockVariants(data).slice(0, 5), [data])

  const recentCatalogueActivity = useMemo(
    () => [...data.catalogues].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5),
    [data.catalogues],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">
            Good {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-stone-500">Here's what's happening with your wholesale business.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/products/new" className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
            <Plus size={15} /> Add Product
          </Link>
          <Link to="/catalogues/new" className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <BookOpen size={15} /> Create Catalogue
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Products" value={formatNumber(stats.products)} icon={Shirt} change={{ value: '+8%', positive: true }} to="/products" />
        <StatCard label="Total Variants" value={formatNumber(stats.variants)} icon={Boxes} change={{ value: '+4%', positive: true }} to="/products" />
        <StatCard label="Total Customers" value={formatNumber(stats.customers)} icon={Users} change={{ value: '+2', positive: true }} to="/customers" />
        <StatCard label="Active Catalogues" value={formatNumber(stats.catalogues)} icon={BookOpen} to="/catalogues" />
        <StatCard label="New Enquiries" value={formatNumber(stats.enquiries)} icon={MessageSquare} change={{ value: 'New', positive: true }} to="/enquiries" />
        <StatCard label="Low Stock" value={formatNumber(stats.lowStock)} icon={AlertTriangle} tone="warning" to="/inventory/low-stock" />
      </div>

      <div className="rounded-2xl border border-[#e8dcc8] bg-[#fffaf3] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-lg font-semibold text-stone-900">Today</h2><p className="text-sm text-stone-500">Your wholesale desk is active and ready to follow up.</p></div><div className="grid grid-cols-2 gap-2 text-sm sm:flex"><Link to="/catalogues" className="rounded-xl bg-white px-3 py-2 font-semibold text-stone-700 shadow-sm">3 catalogue views</Link><Link to="/enquiries" className="rounded-xl bg-white px-3 py-2 font-semibold text-stone-700 shadow-sm">2 new enquiries</Link><Link to="/inventory/low-stock" className="rounded-xl bg-white px-3 py-2 font-semibold text-stone-700 shadow-sm">{stats.lowStock} low stock</Link><Link to="/customers" className="rounded-xl bg-white px-3 py-2 font-semibold text-stone-700 shadow-sm">1 new customer</Link></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Link to="/products/new" className="rounded-xl bg-stone-900 px-3 py-2.5 text-center text-sm font-semibold text-white">Add Product</Link><Link to="/inventory/low-stock" className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-stone-700">Add Stock</Link><Link to="/customers/new" className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-stone-700">Add Customer</Link><Link to="/catalogues/new" className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-stone-700">Create Catalogue</Link></div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-800">Inventory Overview</h3>
              <p className="text-xs text-stone-400">Stock levels & pieces sold, last 7 days</p>
            </div>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={inventoryTrend}>
              <defs>
                <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7a5230" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#7a5230" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
              <Area type="monotone" dataKey="stock" stroke="#7a5230" fill="url(#stockGrad)" strokeWidth={2} name="Total stock" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <h3 className="mb-1 text-sm font-semibold text-stone-800">Category Distribution</h3>
          <p className="mb-2 text-xs text-stone-400">Active products by category</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {categoryDistribution.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {categoryDistribution.slice(0, 6).map((c, i) => (
              <div key={c.name} className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Recent Enquiries" to="/enquiries">
          {recentEnquiries.map((e) => (
            <Link key={e.id} to={`/enquiries/${e.id}`} className="flex items-center justify-between gap-3 border-b border-stone-50 px-4 py-3 last:border-0 hover:bg-stone-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-800">{e.businessName}</p>
                <p className="text-xs text-stone-400">{e.items.length} items · {formatINR(e.estimatedValue)}</p>
              </div>
              <StatusBadge status={e.status} />
            </Link>
          ))}
        </Panel>

        <Panel title="Low Stock Alerts" to="/inventory/low-stock">
          {lowStock.map(({ variant, product }) => (
            <div key={variant.id} className="flex items-center justify-between gap-3 border-b border-stone-50 px-4 py-3 last:border-0">
              <div className="flex min-w-0 items-center gap-3">
                <ImageWithFallback src={primaryImage(product)} alt={product.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{product.code} · {Object.values(variant.attributes).join(' / ')}</p>
                  <p className="text-xs text-stone-400">{variant.stock} pieces remaining</p>
                </div>
              </div>
              <Link to={`/products/${product.id}`} className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50">
                Update
              </Link>
            </div>
          ))}
        </Panel>

        <Panel title="Recently Added Products" to="/products">
          {recentProducts.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="flex items-center justify-between gap-3 border-b border-stone-50 px-4 py-3 last:border-0 hover:bg-stone-50">
              <div className="flex min-w-0 items-center gap-3">
                <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{p.name}</p>
                  <p className="text-xs text-stone-400">{p.code} · {timeAgo(p.createdAt)}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-stone-500">{formatINR(p.wholesalePrice)}</span>
            </Link>
          ))}
        </Panel>

        <Panel title="Top Viewed Products" to="/analytics">
          {topViewed.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="flex items-center justify-between gap-3 border-b border-stone-50 px-4 py-3 last:border-0 hover:bg-stone-50">
              <div className="flex min-w-0 items-center gap-3">
                <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <p className="truncate text-sm font-medium text-stone-800">{p.name}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-stone-500">
                <Eye size={12} /> {p.views}
              </span>
            </Link>
          ))}
        </Panel>
      </div>

      <Panel title="Recent Catalogue Activity" to="/catalogues">
        {recentCatalogueActivity.map((c) => (
          <Link key={c.id} to={`/catalogues/${c.id}`} className="flex items-center justify-between gap-3 border-b border-stone-50 px-4 py-3 last:border-0 hover:bg-stone-50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-800">{c.name}</p>
              <p className="text-xs text-stone-400">{customerName(data, c.customerId)} · {timeAgo(c.createdAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-stone-500"><Eye size={12} /> {c.views}</span>
              <StatusBadge status={c.status} />
            </div>
          </Link>
        ))}
      </Panel>
    </div>
  )
}

function Panel({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
        <Link to={to} className="text-xs font-semibold text-[#7a5230] hover:underline">View all</Link>
      </div>
      <div>{children}</div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
