import { SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  onApply: () => void
  onClear: () => void
  children: ReactNode
}

export function FilterDrawer({ open, onClose, onApply, onClear, children }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <button onClick={onClear} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Clear all
          </button>
          <button onClick={() => { onApply(); onClose() }} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
            Apply filters
          </button>
        </div>
      }
    >
      <div className="space-y-5">{children}</div>
    </Modal>
  )
}

export function FilterButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all active:scale-[0.98] ${
        active ? 'border-stone-900 bg-stone-900 text-white shadow-xs' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      <SlidersHorizontal size={16} /> Filters
    </button>
  )
}
