import {
  LayoutDashboard, Shirt, FolderTree, Sliders, AlertTriangle,
  Users, BookOpen, MessageSquare, BarChart3, Settings, LogOut, Layers,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/utils/cn'

const NAV = [
  { section: null, items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    section: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: Shirt },
      { to: '/categories', label: 'Categories', icon: FolderTree },
      { to: '/attributes', label: 'Attributes', icon: Sliders },
      { to: '/inventory/low-stock', label: 'Low Stock', icon: AlertTriangle },
      { to: '/inventory/collections', label: 'Collections', icon: Layers },
    ],
  },
  {
    section: 'Sales',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/catalogues', label: 'Catalogues', icon: BookOpen },
      { to: '/enquiries', label: 'Enquiries', icon: MessageSquare },
    ],
  },
  { section: 'Insights', items: [{ to: '/analytics', label: 'Analytics', icon: BarChart3 }] },
  { section: 'System', items: [{ to: '/settings', label: 'Settings', icon: Settings }] },
]

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 font-serif text-base font-semibold text-white">
          V
        </div>
        <div>
          <p className="font-serif text-base font-semibold leading-none text-stone-900">Vastraa</p>
          <p className="text-[11px] font-medium tracking-wide text-stone-400">WHOLESALE</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.section && (
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">{group.section}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                    )
                  }
                >
                  <item.icon size={17} strokeWidth={1.9} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-stone-100 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5ede2] text-sm font-semibold text-[#7a5230]">
            {user?.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-stone-800">{user?.name}</p>
            <p className="truncate text-xs text-stone-400">{user?.email}</p>
          </div>
          <button onClick={logout} title="Logout" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
