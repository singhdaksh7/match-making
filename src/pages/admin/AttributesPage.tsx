import { Plus, Sliders, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import type { Attribute, AttributeType } from '@/types'

export default function AttributesPage() {
  const { data, addAttribute, updateAttribute, addAttributeValue, deleteAttributeValue, updateCategory } = useAppData()
  const { showToast } = useToast()
  const [expanded, setExpanded] = useState<string | null>(data.attributes[0]?.id ?? null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AttributeType>('text')
  const [assignOpen, setAssignOpen] = useState<Attribute | null>(null)
  const [newValueInput, setNewValueInput] = useState<Record<string, string>>({})

  function handleCreateAttribute() {
    if (!newName.trim()) return
    addAttribute({ id: `attr-${Date.now()}`, name: newName, type: newType, values: [] })
    showToast('Attribute created successfully')
    setNewName('')
    setCreateOpen(false)
  }

  function handleAddValue(attr: Attribute) {
    const val = newValueInput[attr.id]?.trim()
    if (!val) return
    addAttributeValue(attr.id, {
      id: `av-${Date.now()}`,
      value: val,
      hex: attr.type === 'color' ? '#a8a29e' : undefined,
    })
    setNewValueInput((prev) => ({ ...prev, [attr.id]: '' }))
  }

  function toggleCategoryAssignment(categoryId: string, attrId: string) {
    const cat = data.categories.find((c) => c.id === categoryId)
    if (!cat) return
    const next = cat.attributeIds.includes(attrId) ? cat.attributeIds.filter((a) => a !== attrId) : [...cat.attributeIds, attrId]
    updateCategory(categoryId, { attributeIds: next })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">Attributes</h1>
          <p className="mt-1 text-sm text-stone-500">Build a dynamic attribute system that fits any clothing type — fabric, size, print, fit, work and beyond.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
          <Plus size={16} /> New Attribute
        </button>
      </div>

      {data.attributes.length === 0 ? (
        <EmptyState icon={Sliders} title="No attributes yet" />
      ) : (
        <div className="space-y-3">
          {data.attributes.map((attr) => (
            <div key={attr.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <button
                onClick={() => setExpanded(expanded === attr.id ? null : attr.id)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5ede2] text-[#7a5230]"><Sliders size={16} /></span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-stone-800">{attr.name}</p>
                    <p className="text-xs text-stone-400">{attr.values.length} values · {attr.type}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setAssignOpen(attr) }}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Assign to Categories
                </button>
              </button>

              {expanded === attr.id && (
                <div className="border-t border-stone-100 px-5 py-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attr.values.map((v) => (
                      <span key={v.id} className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-stone-700">
                        {attr.type === 'color' && <ColorSwatch hex={v.hex} name={v.value} size="sm" />}
                        {v.value}
                        <button onClick={() => deleteAttributeValue(attr.id, v.id)} className="rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newValueInput[attr.id] ?? ''}
                      onChange={(e) => setNewValueInput((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddValue(attr)}
                      placeholder="Add a new value..."
                      className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    />
                    <button onClick={() => handleAddValue(attr)} className="rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white">Add</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Attribute" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Attribute Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sleeve Length" className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['text', 'color', 'size'] as AttributeType[]).map((t) => (
                <button key={t} onClick={() => setNewType(t)} className={`rounded-xl border py-2 text-sm font-medium capitalize ${newType === t ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreateAttribute} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white">Create Attribute</button>
        </div>
      </Modal>

      <Modal open={!!assignOpen} onClose={() => setAssignOpen(null)} title={`Assign "${assignOpen?.name}" to Categories`} size="sm">
        <div className="space-y-1.5">
          {data.categories.map((cat) => (
            <label key={cat.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-50">
              <input
                type="checkbox"
                checked={assignOpen ? cat.attributeIds.includes(assignOpen.id) : false}
                onChange={() => assignOpen && toggleCategoryAssignment(cat.id, assignOpen.id)}
                className="h-4 w-4 rounded border-stone-300"
              />
              <span className="text-sm font-medium text-stone-700">{cat.name}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
