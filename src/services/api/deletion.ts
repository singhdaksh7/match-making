import { apiClient } from './client'

export type DeletionBlocker = { label: string; count?: number }
/** What the server says about deleting one record (storage keys are never included). */
export type DeletionImpact = {
  entity: string
  id: string
  name: string
  canDelete: boolean
  blockers: DeletionBlocker[]
  removes: DeletionBlocker[]
  keeps: string[]
  hint?: string
  imageCount: number
}

export const fetchDeletionImpact = (collection: string, id: string) =>
  apiClient.get<DeletionImpact>(`/api/v1/deletion-impact/${collection}/${encodeURIComponent(id)}`)

export const deleteRecord = (path: string) => apiClient.delete<{ cleanup?: { attempted: number; failed: number } }>(path)

export const formatBlockers = (items: DeletionBlocker[]) => items.map((b) => (b.count === undefined ? b.label : `${b.count} ${b.label}`))
