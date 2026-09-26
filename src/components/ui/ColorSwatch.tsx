import { cn } from '@/utils/cn'

interface Props {
  hex?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  showLabel?: boolean
  onClick?: () => void
}

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }

export function ColorSwatch({ hex, name, size = 'md', selected, showLabel, onClick }: Props) {
  const swatch = (
    <span
      className={cn(
        'inline-block shrink-0 rounded-full border border-black/10 ring-offset-2',
        SIZES[size],
        selected && 'ring-2 ring-stone-900',
      )}
      style={{ backgroundColor: hex ?? '#ccc' }}
      title={name}
    />
  )

  if (!showLabel && !onClick) return swatch

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
        selected ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
        !onClick && 'cursor-default',
      )}
    >
      {swatch}
      {showLabel && name}
    </button>
  )
}
