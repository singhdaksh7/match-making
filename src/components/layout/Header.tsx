import { Bell, Menu, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppData } from '@/context/AppDataContext'
import { primaryImage } from '@/utils/selectors'
import { timeAgo } from '@/utils/format'
import { cn } from '@/utils/cn'
import { NotificationIcon } from './NotificationIcon'
import { useAuth } from '@/context/AuthContext'

export function Header({ onMenu }: { onMenu: () => void }) {
  const { data } = useAppData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const results = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    const products = data.products.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 4)
    const customers = data.customers.filter((c) => c.businessName.toLowerCase().includes(q)).slice(0, 3)
    const catalogues = data.catalogues.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 3)
    return { products, customers, catalogues }
  }, [query, data])

  const unread = data.notifications.filter((n) => !n.read).length

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden">
        <Menu size={20} />
      </button>

      <div className="relative hidden flex-1 max-w-md sm:block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          placeholder="Search products, customers, catalogues..."
          className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-sm placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:outline-none"
        />
        {searchOpen && results && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
            {results.products.length === 0 && results.customers.length === 0 && results.catalogues.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-stone-400">No results for "{query}"</p>
            )}
            {results.products.length > 0 && (
              <div className="mb-1">
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">Products</p>
                {results.products.map((p) => (
                  <button key={p.id} onMouseDown={() => navigate(`/products/${p.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-stone-50">
                    <img src={primaryImage(p)} className="h-8 w-8 rounded-md object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800">{p.name}</p>
                      <p className="text-xs text-stone-400">{p.code}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results.customers.length > 0 && (
              <div className="mb-1">
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">Customers</p>
                {results.customers.map((c) => (
                  <button key={c.id} onMouseDown={() => navigate(`/customers/${c.id}`)} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-stone-800 hover:bg-stone-50">
                    {c.businessName}
                  </button>
                ))}
              </div>
            )}
            {results.catalogues.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">Catalogues</p>
                {results.catalogues.map((c) => (
                  <button key={c.id} onMouseDown={() => navigate(`/catalogues/${c.id}`)} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-stone-800 hover:bg-stone-50">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="relative">
          <button
            onClick={() => setQuickAddOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Quick Add</span>
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-48 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl">
              {[
                { label: 'Add Product', to: '/products/new' },
                { label: 'Add Customer', to: '/customers/new' },
                { label: 'Create Catalogue', to: '/catalogues/new' },
              ].map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setQuickAddOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setNotifOpen((o) => !o)} className="relative rounded-xl p-2.5 text-stone-500 hover:bg-stone-100">
            <Bell size={19} />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
              <div className="border-b border-stone-100 px-4 py-3">
                <p className="text-sm font-semibold text-stone-800">Notifications</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {data.notifications.slice(0, 8).map((n) => (
                  <div key={n.id} className={cn('flex gap-3 border-b border-stone-50 px-4 py-3', !n.read && 'bg-[#faf5ec]')}>
                    <NotificationIcon type={n.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800">{n.title}</p>
                      <p className="mt-0.5 text-xs text-stone-500">{n.message}</p>
                      <p className="mt-1 text-[11px] text-stone-400">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#f5ede2] text-sm font-semibold text-[#7a5230] sm:flex">
          {user?.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
