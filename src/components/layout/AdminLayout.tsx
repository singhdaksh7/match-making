import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { MobileBottomNav } from './MobileBottomNav'
import { Sidebar } from './Sidebar'

export function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf8f5]">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenu={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-3.5 py-4 pb-20 sm:px-6 sm:py-7 lg:pb-7">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setMobileNavOpen(true)} />
    </div>
  )
}
