import { Minus, Plus } from 'lucide-react'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
}

export function QuantitySelector({ value, onChange, min = 1, step = 1 }: Props) {
  return (
    <div className="flex h-11 items-center rounded-full border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label="Decrease quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 active:bg-stone-200"
      >
        <Minus size={15} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Quantity"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
          onChange(Number.isNaN(n) ? min : Math.max(min, n))
        }}
        className="w-12 border-none bg-transparent text-center text-sm font-bold text-stone-900 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        aria-label="Increase quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 active:bg-stone-200"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}
