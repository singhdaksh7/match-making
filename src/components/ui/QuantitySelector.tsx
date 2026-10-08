import { Minus, Plus } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

export const MIN_QUANTITY = 1
export const MAX_QUANTITY = 1_000_000

/** A positive whole number within range, or null. Nothing is ever coerced: "", "0", "1.5", "12abc" are all invalid. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= MIN_QUANTITY && n <= MAX_QUANTITY ? n : null
}

export function quantityError(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'Enter the number of pieces'
  if (!/^\d+$/.test(trimmed)) return 'Use whole numbers only'
  const n = Number(trimmed)
  if (n < MIN_QUANTITY) return 'Minimum quantity is 1'
  if (n > MAX_QUANTITY) return `Maximum quantity is ${MAX_QUANTITY.toLocaleString('en-IN')}`
  return null
}

interface Props {
  /** The last valid quantity (the committed value). */
  value: number
  /** Called only with valid quantities, as the customer types or taps +/-. */
  onChange: (value: number) => void
  /** Reports whether what is currently typed is a valid quantity, so a parent can block submitting an invalid draft. */
  onValidityChange?: (valid: boolean) => void
  label?: string
}

/**
 * Quantity entry. The text the customer types is local state and is never rewritten while they type: an empty box,
 * a half-typed number and an out-of-range number are all left exactly as typed (with a message) instead of being clamped
 * back to a minimum on every keystroke. Valid values are pushed to the parent immediately so totals stay live.
 */
export function QuantitySelector({ value, onChange, onValidityChange, label = 'Quantity' }: Props) {
  const [text, setText] = useState(String(value))
  const [touched, setTouched] = useState(false)
  const errorId = useId()

  // Follow external changes (e.g. switching variant) but never overwrite a draft that already parses to the same value.
  useEffect(() => {
    setText((current) => (parseQuantity(current) === value ? current : String(value)))
  }, [value])

  const error = quantityError(text)
  const shownError = error && (touched || text.trim() !== '') ? error : null

  useEffect(() => {
    onValidityChange?.(error === null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  // An unmounted input can no longer be invalid (e.g. the line was removed).
  useEffect(() => () => onValidityChange?.(true), [])

  function step(delta: number) {
    const base = parseQuantity(text) ?? value
    const next = Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, base + delta))
    setText(String(next))
    setTouched(false)
    onChange(next)
  }

  return (
    <div>
      <div className={`flex h-11 w-fit items-center rounded-full border bg-white ${shownError ? 'border-red-400' : 'border-stone-200'}`}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={(parseQuantity(text) ?? value) <= MIN_QUANTITY}
          aria-label="Decrease quantity"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-40"
        >
          <Minus size={15} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          aria-label={label}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          data-testid="quantity-input"
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            const parsed = parseQuantity(next)
            if (parsed !== null) onChange(parsed)
          }}
          onBlur={() => setTouched(true)}
          className="w-20 min-w-0 border-none bg-transparent text-center text-base font-bold text-stone-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={(parseQuantity(text) ?? value) >= MAX_QUANTITY}
          aria-label="Increase quantity"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
      </div>
      {shownError && <p id={errorId} role="alert" data-testid="quantity-error" className="mt-1 text-xs font-medium text-red-600">{shownError}</p>}
    </div>
  )
}
