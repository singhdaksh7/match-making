import { AlertTriangle, Ban, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/services/api/client'
import { deleteRecord, fetchDeletionImpact, formatBlockers, type DeletionImpact } from '@/services/api/deletion'

interface Props {
  open: boolean
  onClose: () => void
  /** Singular label used in the title and button, e.g. "Product". */
  entityLabel: string
  /** Impact-preview collection, e.g. "products" (see GET /deletion-impact/:collection/:id). */
  collection: string
  id: string
  /** DELETE endpoint for the record. */
  deletePath: string
  /** Runs after a successful delete (refresh data, navigate...). */
  onDeleted: () => void | Promise<void>
  /** Optional safe alternative offered when the server blocks the delete because of history. */
  archive?: { label: string; onArchive: () => void | Promise<void> }
  /** Optional wording overrides (e.g. "Remove from catalogue" where the record itself is not deleted). */
  labels?: { title?: string; description?: string; confirm?: string; success?: string }
}

const friendly = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')

/**
 * Non-accidental delete: loads the server's impact preview first, shows what will be removed or what blocks the delete,
 * and only deletes after an explicit second click. Raw database errors are never shown (the API returns plain messages).
 */
export function DeleteDialog({ open, onClose, entityLabel, collection, id, deletePath, onDeleted, archive, labels }: Props) {
  const { showToast } = useToast()
  const [impact, setImpact] = useState<DeletionImpact | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setImpact(await fetchDeletionImpact(collection, id)) } catch (error) { setLoadError(friendly(error)) }
  }, [collection, id])

  // Callers mount the dialog only while it is open, so state starts fresh; just load the impact preview.
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function confirm() {
    setBusy(true); setActionError(null)
    try {
      await deleteRecord(deletePath)
      showToast(labels?.success ?? `${entityLabel} deleted`)
      await onDeleted()
      onClose()
    } catch (error) {
      setActionError(friendly(error))
      if (error instanceof ApiError && error.status === 409) await load() // show the up-to-date blockers
    } finally { setBusy(false) }
  }

  async function archiveInstead() {
    if (!archive) return
    setBusy(true); setActionError(null)
    try { await archive.onArchive(); onClose() } catch (error) { setActionError(friendly(error)) } finally { setBusy(false) }
  }

  const blocked = impact && !impact.canDelete
  const removes = impact ? formatBlockers(impact.removes) : []

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} size="sm">
      <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="delete-dialog">
        {!impact && !loadError && (
          <div className="flex flex-col items-center gap-3 py-6 text-stone-500" data-testid="delete-loading"><Loader2 className="animate-spin" size={22} /><p className="text-sm">Checking what this affects…</p></div>
        )}

        {loadError && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle size={22} /></div>
            <h3 className="text-base font-semibold text-stone-900">Couldn’t check this {entityLabel.toLowerCase()}</h3>
            <p className="text-sm text-stone-500" data-testid="delete-error">{loadError}</p>
            <button onClick={onClose} className="mt-2 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Close</button>
          </>
        )}

        {impact && blocked && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Ban size={22} /></div>
            <h3 className="text-base font-semibold text-stone-900" data-testid="delete-blocked-title">Cannot delete “{impact.name}”</h3>
            <div className="w-full rounded-xl bg-stone-50 p-3 text-left text-sm text-stone-700" data-testid="delete-blocked">
              <p className="mb-1 font-semibold">{impact.blockers.every((b) => b.count === undefined) ? 'Why:' : 'Used by:'}</p>
              <ul className="list-disc space-y-0.5 pl-5">{formatBlockers(impact.blockers).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            {impact.hint && <p className="text-sm text-stone-500" data-testid="delete-hint">{impact.hint}</p>}
            {actionError && <p role="alert" className="text-sm font-medium text-red-600" data-testid="delete-error">{actionError}</p>}
            <div className="mt-2 flex w-full flex-col-reverse gap-2.5 sm:flex-row">
              <button onClick={onClose} disabled={busy} data-testid="delete-cancel" className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Close</button>
              {archive && <button onClick={archiveInstead} disabled={busy} data-testid="delete-archive" className="flex-1 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">{archive.label}</button>}
            </div>
          </>
        )}

        {impact && !blocked && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle size={22} /></div>
            <h3 className="text-base font-semibold text-stone-900" data-testid="delete-title">{labels?.title ?? `Delete ${entityLabel}?`}</h3>
            <p className="text-sm text-stone-500">{labels?.description ?? `“${impact.name}” will be permanently deleted. This action cannot be undone.`}</p>
            {removes.length > 0 && (
              <div className="w-full rounded-xl bg-red-50/60 p-3 text-left text-sm text-stone-700" data-testid="delete-removes">
                <p className="mb-1 font-semibold">This will also remove:</p>
                <ul className="list-disc space-y-0.5 pl-5">{removes.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            )}
            {impact.keeps.length > 0 && <ul className="w-full space-y-0.5 text-left text-xs text-stone-400">{impact.keeps.map((line) => <li key={line}>• {line}</li>)}</ul>}
            {actionError && <p role="alert" className="text-sm font-medium text-red-600" data-testid="delete-error">{actionError}</p>}
            <div className="mt-2 flex w-full flex-col-reverse gap-2.5 sm:flex-row">
              <button onClick={onClose} disabled={busy} data-testid="delete-cancel" className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirm} disabled={busy} data-testid="delete-confirm" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {busy && <Loader2 className="animate-spin" size={14} />}{labels?.confirm ?? `Delete ${entityLabel}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
