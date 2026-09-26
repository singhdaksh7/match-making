import { BookOpen, LayoutDashboard, Menu, MessageSquare, Shirt } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useAppData } from '@/context/AppDataContext'

interface Props {
  onOpenMenu: () => void
}

export function MobileBottomNav({ onOpenMenu }: Props) {
  const { data } = useAppData()
  const newEnquiriesCount = data.enquiries.filter((e) => e.status === 'New').length

  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/products', label: 'Products', icon: Shirt },
    { to: '/catalogues', label: 'Catalogues', icon: BookOpen },
    { to: '/enquiries', label: 'Enquiries', icon: MessageSquare, badge: newEnquiriesCount },
  ]

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-stone-200 bg-white/95 px-2 backdrop-blur-md lg:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium transition-colors',
              isActive ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-800',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative flex items-center justify-center">
                <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className="mt-1">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-stone-900" />
              )}
            </>
          )}
        </NavLink>
      ))}

      <button
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium text-stone-500 hover:text-stone-800"
        aria-label="Open menu drawer"
      >
        <Menu size={20} strokeWidth={1.7} />
        <span className="mt-1">Menu</span>
      </button>
    </nav>
  )
}
