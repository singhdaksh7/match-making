import {
  LayoutDashboard, Shirt, FolderTree, Sliders, AlertTriangle,
  Users, BookOpen, MessageSquare, BarChart3, Settings, LogOut, X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/utils/cn'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Shirt },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/attributes', label: 'Attributes', icon: Sliders },
  { to: '/inventory/low-stock', label: 'Low Stock', icon: AlertTriangle },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/catalogues', label: 'Catalogues', icon: BookOpen },
  { to: '/enquiries', label: 'Enquiries', icon: MessageSquare },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 font-serif text-base font-semibold text-white">V</div>
            <p className="font-serif text-base font-semibold text-stone-900">Vastraa</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium',
                  isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
                )
              }
            >
              <item.icon size={18} strokeWidth={1.9} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-stone-100 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5ede2] text-sm font-semibold text-[#7a5230]">
              {user?.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">{user?.name}</p>
              <p className="text-xs text-stone-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>
    </div>
  )
}
