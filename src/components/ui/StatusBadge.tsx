import { cn } from '@/utils/cn'

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand'

const TONE_STYLES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-stone-100 text-stone-600 border-stone-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  brand: 'bg-[#f5ede2] text-[#7a5230] border-[#e6d5bd]',
}

const STATUS_MAP: Record<string, Tone> = {
  active: 'success', 'in stock': 'success', converted: 'success', paid: 'success',
  low: 'warning', 'low stock': 'warning', negotiating: 'warning', contacted: 'info', new: 'brand',
  archived: 'neutral', inactive: 'neutral', draft: 'neutral', closed: 'neutral',
  'out of stock': 'danger', disabled: 'danger', expired: 'danger', damage: 'danger',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_MAP[status.toLowerCase()] ?? 'neutral'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize', TONE_STYLES[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? status}
    </span>
  )
}
