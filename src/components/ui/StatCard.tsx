import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

interface Props {
  label: string
  value: string
  icon: LucideIcon
  change?: { value: string; positive: boolean }
  to?: string
  tone?: 'default' | 'warning'
}

export function StatCard({ label, value, icon: Icon, change, to, tone = 'default' }: Props) {
  const content = (
    <div className={cn(
      'group flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-stone-900/5 sm:p-5',
      tone === 'warning' && 'border-amber-200 bg-amber-50/40',
    )}>
      <div className="flex items-center justify-between">
        <span className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          tone === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-[#f5ede2] text-[#7a5230]',
        )}>
          <Icon size={18} strokeWidth={1.75} />
        </span>
        {change && (
          <span className={cn('flex items-center gap-0.5 text-xs font-semibold', change.positive ? 'text-emerald-600' : 'text-red-500')}>
            {change.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {change.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-stone-500 sm:text-sm">{label}</p>
      </div>
    </div>
  )

  if (to) return <Link to={to}>{content}</Link>
  return content
}
