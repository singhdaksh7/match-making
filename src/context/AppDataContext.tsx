import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData } from '@/services/seed'
import { DEFAULT_APP_SETTINGS } from '@/data/business'
import { apiClient } from '@/services/api/client'
import { backendAttributeToFrontend, backendCatalogueToFrontend, backendCategoryToFrontend, backendCollectionToFrontend, backendCustomerToFrontend, backendEnquiryToFrontend, backendProductToFrontend, backendVariantToFrontend } from '@/services/api/adapters'
import { useAuth } from '@/context/AuthContext'
import type {
  Attribute, AttributeValue, Catalogue, CatalogueStatus, Category, Customer,
  Enquiry, EnquiryStatus, InventoryEntry, InventoryReason, Notification,
  Collection, Product, ProductVariant,
} from '@/types'

const emptyData = (): AppData => ({ products: [], variants: [], categories: [], attributes: [], customers: [], collections: [], customerActivities: [], catalogues: [], enquiries: [], notifications: [], inventoryEntries: [], settings: structuredClone(DEFAULT_APP_SETTINGS) })

function genId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface AppDataContextValue {
  data: AppData
  // products
  addProduct: (product: Product, variants: ProductVariant[]) => Promise<string>
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void> | void
  archiveProduct: (id: string) => void
  duplicateProduct: (id: string) => void
  addVariant: (variant: ProductVariant) => Promise<void> | void
  updateVariant: (id: string, patch: Partial<ProductVariant>) => void
  adjustStock: (variantId: string, type: 'add' | 'remove' | 'set', quantity: number, reason: InventoryReason, note?: string) => void
  incrementProductViews: (id: string) => void
  // categories
  addCategory: (category: Category) => Promise<void> | void
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void> | void
  deleteCategory: (id: string) => Promise<void> | void
  // attributes
  addAttribute: (attribute: Attribute) => Promise<void> | void
  updateAttribute: (id: string, patch: Partial<Attribute>) => Promise<void> | void
  addAttributeValue: (attributeId: string, value: AttributeValue) => Promise<void> | void
  deleteAttributeValue: (attributeId: string, valueId: string) => Promise<void>
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
  submitEnquiry: (enquiry: Enquiry) => Promise<{ reference?: string }>
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
  const { user } = useAuth()
  const [data, setData] = useState<AppData>(emptyData)

  const refresh = useCallback(async () => {
    if (!user) {
      const match = window.location.pathname.match(/^\/catalogue\/([^/]+)/)
      if (!match) { setData(emptyData()); return }
      const publicCatalogue = await apiClient.get<any>(`/api/v1/public/catalogues/${encodeURIComponent(match[1])}`)
      const products = publicCatalogue.products.map((product: any) => ({ id: product.id, code: product.code, name: product.name, categoryId: '', description: product.description ?? '', media: product.media.map((media: any, index: number) => ({ id: `${product.id}-${index}`, url: media.url, isPrimary: media.primary })), attributeIds: [], allowedAttributeValueIds: [], wholesalePrice: Number(product.variants[0]?.price ?? 0), moq: product.moq ?? 1, status: 'active' as const, views: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
      const variants = publicCatalogue.products.flatMap((product: any) => product.variants.map((variant: any) => ({ id: variant.id, productId: product.id, sku: variant.sku, attributes: Object.fromEntries(Object.entries(variant.attributes ?? {}).map(([key, value]) => [key.toLowerCase(), value])) as Record<string, string>, price: Number(variant.price ?? 0), stock: variant.stock ?? (variant.available === false ? 0 : 1), reserved: 0, status: 'active' as const, lowStockThreshold: 10 })))
      setData((current) => ({ ...current, products, variants, catalogues: [{ id: match[1], slug: match[1], name: publicCatalogue.title, message: publicCatalogue.message ?? undefined, customerId: '', items: products.map((product: Product) => ({ productId: product.id, variantFilter: {}, allVariants: true })), settings: { showWholesalePrice: publicCatalogue.settings.showPrice, showExactStock: publicCatalogue.settings.showExactStock, showAvailability: publicCatalogue.settings.showAvailability, showMOQ: publicCatalogue.settings.showMOQ, allowProductSelection: publicCatalogue.settings.allowSelection, allowEnquiry: publicCatalogue.settings.allowEnquiry, allowImageDownload: publicCatalogue.settings.allowImageDownload, priceAdjustmentType: 'none', priceAdjustmentValue: 0, pinProtected: false, expiry: 'never' }, status: 'active', views: 0, uniqueVisitors: 0, createdAt: new Date().toISOString(), expiresAt: publicCatalogue.expiresAt ?? null }] }))
      return
    }
    const [products, categories, attributes, customers, collections, catalogues, enquiries] = await Promise.all([
      apiClient.get<any[]>('/api/v1/products?limit=100'), apiClient.get<any[]>('/api/v1/categories?limit=100'), apiClient.get<any[]>('/api/v1/attributes'), apiClient.get<any[]>('/api/v1/customers?limit=100'), apiClient.get<any[]>('/api/v1/collections?limit=100'), apiClient.get<any[]>('/api/v1/catalogues?limit=100'), apiClient.get<any[]>('/api/v1/enquiries?limit=100'),
    ])
    const mappedProducts = products.map(backendProductToFrontend)
    setData((current) => ({ ...current, products: mappedProducts, variants: products.flatMap((product: any) => (product.variants ?? []).map((variant: any) => backendVariantToFrontend(variant, product.id))), categories: categories.map(backendCategoryToFrontend), attributes: attributes.map(backendAttributeToFrontend), customers: customers.map(backendCustomerToFrontend), collections: collections.map(backendCollectionToFrontend), catalogues: catalogues.map(backendCatalogueToFrontend), enquiries: enquiries.map(backendEnquiryToFrontend) }))
  }, [user])

  useEffect(() => {
    refresh().catch(() => { /* pages retain an empty, safe state; auth surfaces API failure */ })
  }, [refresh])

  const addProduct = useCallback(async (product: Product, variants: ProductVariant[]) => {
    const attributeValueIds = (attributes: Record<string, string>) => Object.entries(attributes).flatMap(([key, value]) => {
      const attribute = data.attributes.find((item) => item.name.toLowerCase() === key.toLowerCase() || (key === 'waist' && item.name.toLowerCase() === 'waist size'))
      return attribute?.values.filter((item) => item.value === value).map((item) => item.id) ?? []
    })
    const created = await apiClient.post<any>('/api/v1/products', { categoryId: product.categoryId, code: product.code, name: product.name, description: product.description, basePrice: product.wholesalePrice, moq: product.moq, status: product.status.toUpperCase(), attributeIds: product.attributeIds, allowedAttributeValueIds: product.allowedAttributeValueIds, media: product.media.filter((media: any) => media.objectKey).map((media: any, sortOrder: number) => ({ objectKey: media.objectKey, url: media.url, mimeType: media.mimeType ?? 'image/jpeg', primary: media.isPrimary, sortOrder })), variants: variants.map((variant) => ({ sku: variant.sku, price: variant.price, stock: variant.stock, attributeValueIds: attributeValueIds(variant.attributes) })) })
    await refresh()
    return created.id as string
  }, [data.attributes, refresh])

  const updateProduct = useCallback(async (id: string, patch: Partial<Product>) => {
    await apiClient.patch(`/api/v1/products/${id}`, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.wholesalePrice !== undefined ? { basePrice: patch.wholesalePrice } : {}),
      ...(patch.moq !== undefined ? { moq: patch.moq } : {}),
      ...(patch.status !== undefined ? { status: patch.status.toUpperCase() } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.attributeIds !== undefined ? { attributeIds: patch.attributeIds } : {}),
      ...(patch.allowedAttributeValueIds !== undefined ? { allowedAttributeValueIds: patch.allowedAttributeValueIds } : {}),
    })
    await refresh()
  }, [refresh])

  const archiveProduct = useCallback(async (id: string) => { await apiClient.patch(`/api/v1/products/${id}`, { status: 'ARCHIVED' }); await refresh() }, [refresh])

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

  const addVariant = useCallback(async (variant: ProductVariant) => {
    const attributeValueIds = Object.entries(variant.attributes).flatMap(([key, value]) => {
      const attribute = data.attributes.find((item) => item.name.toLowerCase() === key.toLowerCase() || (key === 'waist' && item.name.toLowerCase() === 'waist size'))
      return attribute?.values.filter((item) => item.value === value).map((item) => item.id) ?? []
    })
    await apiClient.post(`/api/v1/products/${variant.productId}/variants`, { sku: variant.sku, price: variant.price, stock: variant.stock, attributeValueIds })
    await refresh()
  }, [data.attributes, refresh])

  const updateVariant = useCallback((id: string, patch: Partial<ProductVariant>) => {
    setData((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
  }, [])

  const adjustStock = useCallback(async (variantId: string, type: 'add' | 'remove' | 'set', quantity: number, reason: InventoryReason, note?: string) => {
    const current = data.variants.find((variant) => variant.id === variantId)?.stock ?? 0
    const delta = type === 'set' ? quantity - current : quantity
    if (delta === 0) return
    await apiClient.post('/api/v1/inventory/movements', { variantId, type: delta < 0 ? 'SALE' : 'ADJUSTMENT', quantity: Math.abs(delta), reason, reference: note })
    await refresh()
    return
    /* Legacy optimistic implementation retained below only for type-compatible unreachable fallback. */
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
  }, [data.variants, refresh])

  const incrementProductViews = useCallback((id: string) => {
    setData((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, views: p.views + 1 } : p)) }))
  }, [])

  const addCategory = useCallback(async (category: Category) => {
    await apiClient.post('/api/v1/categories', { name: category.name, slug: category.slug, status: category.status.toUpperCase(), attributeIds: category.attributeIds })
    await refresh()
  }, [refresh])
  const updateCategory = useCallback(async (id: string, patch: Partial<Category>) => {
    await apiClient.patch(`/api/v1/categories/${id}`, { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.slug !== undefined ? { slug: patch.slug } : {}), ...(patch.status !== undefined ? { status: patch.status.toUpperCase() } : {}), ...(patch.attributeIds !== undefined ? { attributeIds: patch.attributeIds } : {}) })
    await refresh()
  }, [refresh])
  const deleteCategory = useCallback(async (id: string) => {
    await apiClient.delete(`/api/v1/categories/${id}`).catch(() => undefined)
    await refresh()
  }, [refresh])

  const addAttribute = useCallback(async (attribute: Attribute) => {
    const kind = attribute.type === 'color' ? 'COLOR' : attribute.type === 'size' ? 'SIZE' : 'TEXT'
    await apiClient.post('/api/v1/attributes', { name: attribute.name, kind, values: attribute.values.map((item) => ({ value: item.value, hex: item.hex })) })
    await refresh()
  }, [refresh])
  const updateAttribute = useCallback(async (id: string, patch: Partial<Attribute>) => {
    await apiClient.patch(`/api/v1/attributes/${id}`, { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.type !== undefined ? { kind: patch.type === 'color' ? 'COLOR' : patch.type === 'size' ? 'SIZE' : 'TEXT' } : {}) })
    await refresh()
  }, [refresh])
  const addAttributeValue = useCallback(async (attributeId: string, value: AttributeValue) => {
    await apiClient.post(`/api/v1/attributes/${attributeId}/values`, { value: value.value, hex: value.hex })
    await refresh()
  }, [refresh])
  const deleteAttributeValue = useCallback(async (attributeId: string, valueId: string) => {
    await apiClient.delete(`/api/v1/attributes/${attributeId}/values/${valueId}`)
    await refresh()
  }, [refresh])

  const addCustomer = useCallback(async (customer: Customer) => { await apiClient.post('/api/v1/customers', { businessName: customer.businessName, contactPerson: customer.contactPerson, phone: customer.phone, whatsapp: customer.whatsapp || undefined, email: customer.email || undefined, city: customer.city || undefined, state: customer.state || undefined, type: customer.type.toUpperCase(), gstNumber: customer.gstNumber, notes: customer.notes, status: customer.status.toUpperCase() }); await refresh() }, [refresh])
  const updateCustomer = useCallback(async (id: string, patch: Partial<Customer>) => { await apiClient.patch(`/api/v1/customers/${id}`, { ...patch, ...(patch.type ? { type: patch.type.toUpperCase() } : {}), ...(patch.status ? { status: patch.status.toUpperCase() } : {}) }); await refresh() }, [refresh])
  const archiveCustomer = useCallback(async (id: string) => { await apiClient.patch(`/api/v1/customers/${id}`, { status: 'ARCHIVED' }); await refresh() }, [refresh])

  const addCollection = useCallback((collection: Collection) => {
    setData((d) => ({ ...d, collections: [collection, ...d.collections] }))
  }, [])

  const createCatalogue = useCallback(async (catalogue: Catalogue) => { await apiClient.post('/api/v1/catalogues', { customerId: catalogue.customerId || undefined, title: catalogue.name, message: catalogue.message, expiresAt: catalogue.expiresAt || undefined, status: catalogue.status.toUpperCase(), showPrice: catalogue.settings.showWholesalePrice, showExactStock: catalogue.settings.showExactStock, showAvailability: catalogue.settings.showAvailability, showMOQ: catalogue.settings.showMOQ, allowSelection: catalogue.settings.allowProductSelection, allowEnquiry: catalogue.settings.allowEnquiry, allowImageDownload: catalogue.settings.allowImageDownload, priceAdjustmentPct: catalogue.settings.priceAdjustmentValue, pin: catalogue.settings.pin, items: catalogue.items.map((item) => ({ productId: item.productId })) }); await refresh() }, [refresh])
  const updateCatalogue = useCallback(async (id: string, patch: Partial<Catalogue>) => { await apiClient.patch(`/api/v1/catalogues/${id}`, { ...(patch.name ? { title: patch.name } : {}), ...(patch.message !== undefined ? { message: patch.message } : {}), ...(patch.status ? { status: patch.status.toUpperCase() } : {}) }); await refresh() }, [refresh])
  const duplicateCatalogue = useCallback(async (id: string) => {
    const source = data.catalogues.find((c) => c.id === id)
    if (!source) return
    await apiClient.post('/api/v1/catalogues', { title: `${source.name} (Copy)`, message: source.message, status: 'DRAFT', showPrice: source.settings.showWholesalePrice, showExactStock: source.settings.showExactStock, showAvailability: source.settings.showAvailability, showMOQ: source.settings.showMOQ, allowSelection: source.settings.allowProductSelection, allowEnquiry: source.settings.allowEnquiry, allowImageDownload: source.settings.allowImageDownload, items: source.items.map((item) => ({ productId: item.productId })) })
    await refresh()
  }, [data.catalogues, refresh])
  const setCatalogueStatus = useCallback(async (id: string, status: CatalogueStatus) => { await apiClient.patch(`/api/v1/catalogues/${id}`, { status: status.toUpperCase() }); await refresh() }, [refresh])
  const deleteCatalogue = useCallback(async (id: string) => { await apiClient.delete(`/api/v1/catalogues/${id}`); await refresh() }, [refresh])
  const recordCatalogueVisit = useCallback((slug: string) => {
    setData((d) => ({
      ...d,
      catalogues: d.catalogues.map((c) => (c.slug === slug ? { ...c, views: c.views + 1 } : c)),
    }))
  }, [])

  const submitEnquiry = useCallback(async (enquiry: Enquiry) => {
    const catalogue = data.catalogues.find((item) => item.id === enquiry.catalogueId)
    if (!catalogue) throw new Error('Catalogue is unavailable')
    const result = await apiClient.post<{ reference?: string }>(`/api/v1/public/catalogues/${catalogue.slug}/enquiries`, { contactName: enquiry.contactName, phone: enquiry.phone, message: enquiry.message, items: enquiry.items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) })
    await refresh()
    return result
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
  }, [data.catalogues, refresh])

  const updateEnquiryStatus = useCallback(async (id: string, status: EnquiryStatus, note?: string) => {
    await apiClient.patch(`/api/v1/enquiries/${id}/status`, { status: status.toUpperCase(), note })
    await refresh()
    return
    setData((d) => ({
      ...d,
      enquiries: d.enquiries.map((e) =>
        e.id === id
          ? { ...e, status, timeline: [...e.timeline, { status, at: new Date().toISOString(), note }] }
          : e,
      ),
    }))
  }, [refresh])

  const markNotificationRead = useCallback((id: string) => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
  }, [])
  const markAllNotificationsRead = useCallback(() => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }))
  }, [])

  const updateSettings = useCallback((patch: Partial<AppData['settings']>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  }, [])

  const resetDemoData = useCallback(() => { void refresh() }, [refresh])

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
