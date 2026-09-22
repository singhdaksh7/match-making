import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel} size="sm">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
          <AlertTriangle size={22} />
        </div>
        <h3 className="text-base font-semibold text-stone-900">{title}</h3>
        <p className="text-sm text-stone-500">{description}</p>
        <div className="mt-3 flex w-full gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-800'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
