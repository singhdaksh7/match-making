import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect } from 'react'
import { activeFilterCount, type AttributeSelection, type Facet } from '@/utils/catalogueFilters'

interface CategoryOption { id: string; name: string }

interface PanelProps {
  facets: Facet[]
  selection: AttributeSelection
  onToggle: (key: string, value: string) => void
  categories?: CategoryOption[]
  category?: string
  onCategory?: (id: string) => void
}

const pill = (active: boolean) =>
  `min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'}`

/** The filter controls themselves: used inside the mobile sheet and as the desktop sidebar. */
export function FilterPanel({ facets, selection, onToggle, categories, category, onCategory }: PanelProps) {
  return (
    <div className="space-y-6">
      {categories && onCategory && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Category</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={category === 'all'} onClick={() => onCategory('all')} className={pill(category === 'all')}>All</button>
            {categories.map((c) => (
              <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => onCategory(c.id)} className={pill(category === c.id)}>{c.name}</button>
            ))}
          </div>
        </section>
      )}
      {facets.map((facet) => (
        <section key={facet.key} data-testid={`facet-${facet.key}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{facet.name}</h3>
          <div className="flex flex-wrap gap-2">
            {facet.values.map((value) => {
              const active = (selection[facet.key] ?? []).includes(value)
              return (
                <button key={value} type="button" aria-pressed={active} data-testid={`filter-${facet.key}-${value}`} onClick={() => onToggle(facet.key, value)} className={pill(active)}>
                  {value}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {facets.length === 0 && <p className="text-sm text-stone-500">No attribute filters for these designs.</p>}
    </div>
  )
}

interface SheetProps extends PanelProps {
  open: boolean
  onClose: () => void
  onClear: () => void
  resultCount: number
}

/** Mobile bottom sheet. Changes apply instantly; the footer button just closes it and shows the live result count. */
export function FilterSheet({ open, onClose, onClear, resultCount, ...panel }: SheetProps) {
  const count = activeFilterCount(panel.selection)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:hidden" role="dialog" aria-modal="true" aria-label="Filters" data-testid="filter-sheet">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <p className="text-base font-semibold text-stone-900">Filters{count > 0 && <span data-testid="filter-count" className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs text-white">{count}</span>}</p>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-stone-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"><FilterPanel {...panel} /></div>
        <div className="flex gap-3 border-t border-stone-100 px-5 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClear} disabled={count === 0} data-testid="filter-clear-all" className="h-12 shrink-0 rounded-2xl border border-stone-200 px-5 text-sm font-semibold text-stone-700 disabled:opacity-40">Clear All</button>
          <button type="button" onClick={onClose} data-testid="filter-apply" className="h-12 flex-1 rounded-2xl bg-stone-900 text-sm font-semibold text-white">
            Show {resultCount} {resultCount === 1 ? 'design' : 'designs'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-testid="open-filters" className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 text-xs font-semibold text-stone-100 hover:bg-white/20 lg:hidden">
      <SlidersHorizontal size={14} /> Filters
      {count > 0 && <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-stone-900">{count}</span>}
    </button>
  )
}

/** The selected filters, each removable, plus Clear All. Stays visible after the sheet is closed. */
export function ActiveFilterChips({ facets, selection, onToggle, onClear }: { facets: Facet[]; selection: AttributeSelection; onToggle: (key: string, value: string) => void; onClear: () => void }) {
  const chips = Object.entries(selection).flatMap(([key, values]) => values.map((value) => ({ key, value, name: facets.find((f) => f.key === key)?.name ?? key })))
  if (chips.length === 0) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="active-filters">
      {chips.map((chip) => (
        <button key={`${chip.key}:${chip.value}`} type="button" onClick={() => onToggle(chip.key, chip.value)} aria-label={`Remove filter ${chip.name}: ${chip.value}`} data-testid={`chip-${chip.key}-${chip.value}`} className="flex min-h-9 items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white">
          <span className="text-stone-300">{chip.name}:</span> {chip.value} <X size={12} />
        </button>
      ))}
      <button type="button" onClick={onClear} data-testid="chips-clear-all" className="min-h-9 px-2 text-xs font-semibold text-stone-600 underline underline-offset-2">Clear all filters</button>
    </div>
  )
}
