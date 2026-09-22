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
      className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium ${
        active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
      }`}
    >
      <SlidersHorizontal size={15} /> Filters
    </button>
  )
}
