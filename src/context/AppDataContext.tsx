import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData } from '@/services/seed'
import { buildSeedData, isValidAppData } from '@/services/seed'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/services/storage'
import type {
  Attribute, AttributeValue, Catalogue, CatalogueStatus, Category, Customer,
  Enquiry, EnquiryStatus, InventoryEntry, InventoryReason, Notification,
  Collection, Product, ProductVariant,
} from '@/types'

const DATA_KEY = 'app_data'
// Increment this whenever the demo seed shape or its cross-record references change.
const DEMO_DATA_VERSION = '3'

function loadInitialData(): AppData {
  const storedVersion = loadJSON<string>(STORAGE_KEYS.demoDataVersion, '')
  if (storedVersion !== DEMO_DATA_VERSION) return buildSeedData()

  const storedData = loadJSON<AppData | null>(DATA_KEY, null)
  if (!storedData || !isValidAppData(storedData)) return buildSeedData()

  return storedData
}

function genId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface AppDataContextValue {
  data: AppData
  // products
  addProduct: (product: Product, variants: ProductVariant[]) => void
  updateProduct: (id: string, patch: Partial<Product>) => void
  archiveProduct: (id: string) => void
  duplicateProduct: (id: string) => void
  addVariant: (variant: ProductVariant) => void
  updateVariant: (id: string, patch: Partial<ProductVariant>) => void
  adjustStock: (variantId: string, type: 'add' | 'remove' | 'set', quantity: number, reason: InventoryReason, note?: string) => void
  incrementProductViews: (id: string) => void
  // categories
  addCategory: (category: Category) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void
  // attributes
  addAttribute: (attribute: Attribute) => void
  updateAttribute: (id: string, patch: Partial<Attribute>) => void
  addAttributeValue: (attributeId: string, value: AttributeValue) => void
  deleteAttributeValue: (attributeId: string, valueId: string) => void
  // customers
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, patch: Partial<Customer>) => void
  archiveCustomer: (id: string) => void
  addCollection: (collection: Collection) => void
  // catalogues
  createCatalogue: (catalogue: Catalogue) => void
  updateCatalogue: (id: string, patch: Partial<Catalogue>) => void
  duplicateCatalogue: (id: string) => void
  setCatalogueStatus: (id: string, status: CatalogueStatus) => void
  deleteCatalogue: (id: string) => void
  recordCatalogueVisit: (slug: string) => void
  // enquiries
  submitEnquiry: (enquiry: Enquiry) => void
  updateEnquiryStatus: (id: string, status: EnquiryStatus, note?: string) => void
  // notifications
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  // settings
  updateSettings: (patch: Partial<AppData['settings']>) => void
  // demo
  resetDemoData: () => void
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadInitialData)

  useEffect(() => {
    saveJSON(DATA_KEY, data)
    saveJSON(STORAGE_KEYS.demoDataVersion, DEMO_DATA_VERSION)
  }, [data])

  const addProduct = useCallback((product: Product, variants: ProductVariant[]) => {
    setData((d) => ({ ...d, products: [product, ...d.products], variants: [...d.variants, ...variants] }))
  }, [])

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setData((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    }))
  }, [])

  const archiveProduct = useCallback((id: string) => {
    setData((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, status: 'archived' } : p)) }))
  }, [])

  const duplicateProduct = useCallback((id: string) => {
    setData((d) => {
      const source = d.products.find((p) => p.id === id)
      if (!source) return d
      const newId = genId('prod')
      const copy: Product = {
        ...source,
        id: newId,
        code: `${source.code}-COPY`,
        name: `${source.name} (Copy)`,
        status: 'draft',
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const sourceVariants = d.variants.filter((v) => v.productId === id)
      const copyVariants = sourceVariants.map((v) => ({ ...v, id: genId('var'), productId: newId }))
      return { ...d, products: [copy, ...d.products], variants: [...d.variants, ...copyVariants] }
    })
  }, [])

  const addVariant = useCallback((variant: ProductVariant) => {
    setData((d) => ({ ...d, variants: [...d.variants, variant] }))
  }, [])

  const updateVariant = useCallback((id: string, patch: Partial<ProductVariant>) => {
    setData((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
  }, [])

  const adjustStock = useCallback((variantId: string, type: 'add' | 'remove' | 'set', quantity: number, reason: InventoryReason, note?: string) => {
    setData((d) => {
      const variant = d.variants.find((v) => v.id === variantId)
      if (!variant) return d
      const previousStock = variant.stock
      let newStock = previousStock
      if (type === 'add') newStock = previousStock + quantity
      if (type === 'remove') newStock = Math.max(0, previousStock - quantity)
      if (type === 'set') newStock = Math.max(0, quantity)
      const entry: InventoryEntry = {
        id: genId('inv'),
        variantId,
        productId: variant.productId,
        type,
        quantity,
        previousStock,
        newStock,
        reason,
        note,
        createdAt: new Date().toISOString(),
        createdBy: 'Amit Shah',
      }
      return {
        ...d,
        variants: d.variants.map((v) => (v.id === variantId ? { ...v, stock: newStock } : v)),
        inventoryEntries: [entry, ...d.inventoryEntries],
      }
    })
  }, [])

  const incrementProductViews = useCallback((id: string) => {
    setData((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, views: p.views + 1 } : p)) }))
  }, [])

  const addCategory = useCallback((category: Category) => {
    setData((d) => ({ ...d, categories: [category, ...d.categories] }))
  }, [])
  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    setData((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }, [])
  const deleteCategory = useCallback((id: string) => {
    setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }))
  }, [])

  const addAttribute = useCallback((attribute: Attribute) => {
    setData((d) => ({ ...d, attributes: [attribute, ...d.attributes] }))
  }, [])
  const updateAttribute = useCallback((id: string, patch: Partial<Attribute>) => {
    setData((d) => ({ ...d, attributes: d.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  }, [])
  const addAttributeValue = useCallback((attributeId: string, value: AttributeValue) => {
    setData((d) => ({
      ...d,
      attributes: d.attributes.map((a) => (a.id === attributeId ? { ...a, values: [...a.values, value] } : a)),
    }))
  }, [])
  const deleteAttributeValue = useCallback((attributeId: string, valueId: string) => {
    setData((d) => ({
      ...d,
      attributes: d.attributes.map((a) =>
        a.id === attributeId ? { ...a, values: a.values.filter((v) => v.id !== valueId) } : a,
      ),
    }))
  }, [])

  const addCustomer = useCallback((customer: Customer) => {
    setData((d) => ({ ...d, customers: [customer, ...d.customers] }))
  }, [])
  const updateCustomer = useCallback((id: string, patch: Partial<Customer>) => {
    setData((d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }, [])
  const archiveCustomer = useCallback((id: string) => {
    setData((d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, status: 'inactive' } : c)) }))
  }, [])

  const addCollection = useCallback((collection: Collection) => {
    setData((d) => ({ ...d, collections: [collection, ...d.collections] }))
  }, [])

  const createCatalogue = useCallback((catalogue: Catalogue) => {
    setData((d) => ({ ...d, catalogues: [catalogue, ...d.catalogues] }))
  }, [])
  const updateCatalogue = useCallback((id: string, patch: Partial<Catalogue>) => {
    setData((d) => ({ ...d, catalogues: d.catalogues.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }, [])
  const duplicateCatalogue = useCallback((id: string) => {
    setData((d) => {
      const source = d.catalogues.find((c) => c.id === id)
      if (!source) return d
      const copy: Catalogue = {
        ...source,
        id: genId('cat-log'),
        slug: genId('link').slice(-10),
        name: `${source.name} (Copy)`,
        status: 'draft',
        views: 0,
        uniqueVisitors: 0,
        createdAt: new Date().toISOString(),
      }
      return { ...d, catalogues: [copy, ...d.catalogues] }
    })
  }, [])
  const setCatalogueStatus = useCallback((id: string, status: CatalogueStatus) => {
    setData((d) => ({ ...d, catalogues: d.catalogues.map((c) => (c.id === id ? { ...c, status } : c)) }))
  }, [])
  const deleteCatalogue = useCallback((id: string) => {
    setData((d) => ({ ...d, catalogues: d.catalogues.filter((c) => c.id !== id) }))
  }, [])
  const recordCatalogueVisit = useCallback((slug: string) => {
    setData((d) => ({
      ...d,
      catalogues: d.catalogues.map((c) => (c.slug === slug ? { ...c, views: c.views + 1 } : c)),
    }))
  }, [])

  const submitEnquiry = useCallback((enquiry: Enquiry) => {
    setData((d) => ({
      ...d,
      enquiries: [enquiry, ...d.enquiries],
      catalogues: d.catalogues.map((c) => (c.id === enquiry.catalogueId ? { ...c } : c)),
      notifications: [
        {
          id: genId('notif'),
          type: 'enquiry',
          title: 'New enquiry received',
          message: `${enquiry.businessName} submitted a new enquiry.`,
          read: false,
          createdAt: new Date().toISOString(),
          link: `/enquiries/${enquiry.id}`,
        },
        ...d.notifications,
      ],
    }))
  }, [])

  const updateEnquiryStatus = useCallback((id: string, status: EnquiryStatus, note?: string) => {
    setData((d) => ({
      ...d,
      enquiries: d.enquiries.map((e) =>
        e.id === id
          ? { ...e, status, timeline: [...e.timeline, { status, at: new Date().toISOString(), note }] }
          : e,
      ),
    }))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
  }, [])
  const markAllNotificationsRead = useCallback(() => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }))
  }, [])

  const updateSettings = useCallback((patch: Partial<AppData['settings']>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  }, [])

  const resetDemoData = useCallback(() => {
    const fresh = buildSeedData()
    setData(fresh)
  }, [])

  const value = useMemo<AppDataContextValue>(() => ({
    data,
    addProduct, updateProduct, archiveProduct, duplicateProduct,
    addVariant, updateVariant, adjustStock, incrementProductViews,
    addCategory, updateCategory, deleteCategory,
    addAttribute, updateAttribute, addAttributeValue, deleteAttributeValue,
    addCustomer, updateCustomer, archiveCustomer, addCollection,
    createCatalogue, updateCatalogue, duplicateCatalogue, setCatalogueStatus, deleteCatalogue, recordCatalogueVisit,
    submitEnquiry, updateEnquiryStatus,
    markNotificationRead, markAllNotificationsRead,
    updateSettings, resetDemoData,
  }), [data, addProduct, updateProduct, archiveProduct, duplicateProduct, addVariant, updateVariant,
    adjustStock, incrementProductViews, addCategory, updateCategory, deleteCategory, addAttribute,
    updateAttribute, addAttributeValue, deleteAttributeValue, addCustomer, updateCustomer, archiveCustomer, addCollection,
    createCatalogue, updateCatalogue, duplicateCatalogue, setCatalogueStatus, deleteCatalogue,
    recordCatalogueVisit, submitEnquiry, updateEnquiryStatus, markNotificationRead,
    markAllNotificationsRead, updateSettings, resetDemoData])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}

export { STORAGE_KEYS }
