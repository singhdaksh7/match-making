import { Minus, Plus } from 'lucide-react'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
}

export function QuantitySelector({ value, onChange, min = 1, step = 1 }: Props) {
  return (
    <div className="flex items-center rounded-full border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
      >
        <Minus size={14} />
      </button>
      <input
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
          onChange(Number.isNaN(n) ? min : Math.max(min, n))
        }}
        className="w-10 border-none bg-transparent text-center text-sm font-semibold text-stone-900 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
