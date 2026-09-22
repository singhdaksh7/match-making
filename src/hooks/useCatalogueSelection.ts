import { useCallback, useEffect, useState } from 'react'
import { loadJSON, saveJSON } from '@/services/storage'
import type { CustomerSelectionItem } from '@/types'

export function useCatalogueSelection(slug: string) {
  const key = `selection:${slug}`
  const [items, setItems] = useState<CustomerSelectionItem[]>(() => loadJSON(key, []))

  useEffect(() => {
    saveJSON(key, items)
  }, [key, items])

  const addItem = useCallback((item: CustomerSelectionItem) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.variantId === item.variantId)
      if (existingIdx >= 0) {
        const next = [...prev]
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + item.quantity }
        return next
      }
      return [...prev, item]
    })
  }, [])

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, quantity) } : i)))
  }, [])

  const removeItem = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  return { items, addItem, updateQuantity, removeItem, clear }
}
