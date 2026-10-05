import { Eye, MessageSquare, TrendingUp } from 'lucide-react'
import type { NotificationType } from '@/types'

const MAP: Record<NotificationType, { icon: typeof Eye; className: string }> = {
  enquiry: { icon: MessageSquare, className: 'bg-[#f5ede2] text-[#7a5230]' },
  catalogue_view: { icon: Eye, className: 'bg-sky-50 text-sky-600' },
  catalogue_milestone: { icon: TrendingUp, className: 'bg-emerald-50 text-emerald-600' },
}

export function NotificationIcon({ type }: { type: NotificationType }) {
  const { icon: Icon, className } = MAP[type]
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
      <Icon size={14} />
    </span>
  )
}
