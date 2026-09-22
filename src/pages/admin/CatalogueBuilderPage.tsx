import {
  ArrowLeft, ArrowRight, Check, Copy, ExternalLink, MessageCircle, QrCode, Search, Smartphone, Monitor,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { Modal } from '@/components/ui/Modal'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { COLORS } from '@/data/attributes'
import type { Catalogue, CatalogueItem, CatalogueSettings } from '@/types'
import { formatINR, randomSlugSuffix, slugify } from '@/utils/format'
import { applyPriceAdjustment, primaryImage, totalStockForProduct, variantsForProduct, waCatalogueLink } from '@/utils/selectors'

const STEPS = ['Customer', 'Catalogue Info', 'Select Products', 'Variants', 'Settings', 'Preview', 'Generate']

const DEFAULT_SETTINGS: CatalogueSettings = {
  showWholesalePrice: true,
  showExactStock: false,
  showAvailability: true,
  showMOQ: true,
  allowProductSelection: true,
  allowEnquiry: true,
  allowImageDownload: false,
  priceAdjustmentType: 'none',
  priceAdjustmentValue: 0,
  pinProtected: false,
  expiry: '30d',
}

export default function CatalogueBuilderPage() {
  const { data, createCatalogue } = useAppData()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState(0)
  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '')
  const [customerQuery, setCustomerQuery] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [readyStockOnly, setReadyStockOnly] = useState(false)
  const initialCollection = data.collections.find((c) => c.id === searchParams.get('collection'))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialCollection?.productIds ?? []))
  const [variantFilters, setVariantFilters] = useState<Record<string, { allVariants: boolean; colors: Set<string>; sizes: Set<string> }>>({})
  const [settings, setSettings] = useState<CatalogueSettings>(DEFAULT_SETTINGS)
  const [devicePreview, setDevicePreview] = useState<'mobile' | 'desktop'>('mobile')
  const [generated, setGenerated] = useState<Catalogue | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const customer = data.customers.find((c) => c.id === customerId)
  const filteredCustomers = data.customers.filter((c) => c.businessName.toLowerCase().includes(customerQuery.toLowerCase()))

  const filteredProducts = useMemo(() => {
    let list = data.products.filter((p) => p.status === 'active')
    if (productQuery.trim()) list = list.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase()) || p.code.toLowerCase().includes(productQuery.toLowerCase()))
    if (categoryFilter) list = list.filter((p) => p.categoryId === categoryFilter)
    if (readyStockOnly) list = list.filter((p) => totalStockForProduct(data, p.id) > 0)
    return list
  }, [data, productQuery, categoryFilter, readyStockOnly])

  const selectedProducts = data.products.filter((p) => selectedIds.has(p.id))

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCategorySelect(categoryId: string) {
    const ids = data.products.filter((p) => p.categoryId === categoryId && p.status === 'active').map((p) => p.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  function getVariantFilter(productId: string) {
    return variantFilters[productId] ?? { allVariants: true, colors: new Set<string>(), sizes: new Set<string>() }
  }

  function updateVariantFilter(productId: string, patch: Partial<{ allVariants: boolean; colors: Set<string>; sizes: Set<string> }>) {
    setVariantFilters((prev) => ({ ...prev, [productId]: { ...getVariantFilter(productId), ...patch } }))
  }

  function canProceed() {
    if (step === 0) return !!customerId
    if (step === 1) return name.trim().length > 0
    if (step === 2) return selectedIds.size > 0
    return true
  }

  function buildItems(): CatalogueItem[] {
    return selectedProducts.map((p) => {
      const vf = getVariantFilter(p.id)
      if (vf.allVariants) return { productId: p.id, variantFilter: {}, allVariants: true }
      const filter: Record<string, string[]> = {}
      if (vf.colors.size > 0) filter.color = [...vf.colors]
      if (vf.sizes.size > 0) filter.size = [...vf.sizes]
      return { productId: p.id, variantFilter: filter, allVariants: false }
    })
  }

  function expiryToDate(expiry: CatalogueSettings['expiry']): string | null {
    if (expiry === 'never') return null
    const days = expiry === '1d' ? 1 : expiry === '7d' ? 7 : 30
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString()
  }

  function handleGenerate() {
    const slug = `${slugify(customer?.businessName.split(' ')[0] ?? 'catalogue')}-${randomSlugSuffix()}`
    const catalogue: Catalogue = {
      id: `cat-log-${Date.now()}`,
      slug,
      name,
      message: message || undefined,
      customerId,
      items: buildItems(),
      settings,
      status: 'active',
      views: 0,
      uniqueVisitors: 0,
      createdAt: new Date().toISOString(),
      expiresAt: expiryToDate(settings.expiry),
    }
    createCatalogue(catalogue)
    setGenerated(catalogue)
    setStep(6)
    showToast('Catalogue created successfully')
  }

  const catalogueLink = generated ? `${window.location.origin}/catalogue/${generated.slug}` : ''
  const waMessage = generated && customer
    ? `Hi ${customer.contactPerson} 👋\n\nWe've prepared a private wholesale collection for ${customer.businessName}.\n\n📦 18 designs\n🎨 Multiple colours & variants\n✅ Ready stock available\n\nView your catalogue:\n${catalogueLink}\n\nSelect the designs, colours, sizes and quantities you're interested in and send us your enquiry directly.\n\n– Vastraa Wholesale`
    : ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">Create Catalogue</h1>
          {step < 6 && <p className="text-sm text-stone-500">Step {step + 1} of {STEPS.length - 1} — {STEPS[step]}</p>}
        </div>
      </div>

      {step < 6 && (
        <div className="flex gap-1.5">
          {STEPS.slice(0, 6).map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-stone-900' : 'bg-stone-200'}`} />)}
        </div>
      )}

      {step === 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="relative mb-4">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search customers..." className="w-full rounded-xl border border-stone-200 py-2.5 pl-10 pr-4 text-sm" />
          </div>
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => setCustomerId(c.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${customerId === c.id ? 'border-stone-900 bg-stone-50' : 'border-stone-100 hover:bg-stone-50'}`}
              >
                <div>
                  <p className="text-sm font-semibold text-stone-800">{c.businessName}</p>
                  <p className="text-xs text-stone-400">{c.contactPerson} · {c.city}</p>
                </div>
                {customerId === c.id && <Check size={16} className="text-stone-900" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Catalogue Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`September New Arrivals – ${customer?.businessName ?? ''}`} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-600">Message (optional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="A short note for your customer..." className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products..." className="w-full rounded-xl border border-stone-200 py-2.5 pl-10 pr-4 text-sm" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm">
              <option value="">All categories</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setReadyStockOnly((v) => !v)} className={`whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${readyStockOnly ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-stone-200 text-stone-600'}`}>✓ Ready Stock Only</button>
            {categoryFilter && (
              <button onClick={() => toggleCategorySelect(categoryFilter)} className="whitespace-nowrap rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">
                Select entire category
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pb-20 sm:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleProduct(p.id)}
                className={`relative overflow-hidden rounded-2xl border-2 text-left transition-all ${selectedIds.has(p.id) ? 'border-stone-900' : 'border-transparent'}`}
              >
                <div className="aspect-[3/4] bg-stone-100">
                  <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-full w-full object-cover" />
                </div>
                <div className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${selectedIds.has(p.id) ? 'border-stone-900 bg-stone-900 text-white' : 'border-white bg-white/70'}`}>
                  {selectedIds.has(p.id) && <Check size={13} />}
                </div>
                <div className="border border-t-0 border-stone-200 bg-white p-2.5">
                  <p className="truncate text-xs font-semibold text-stone-800">{p.name}</p>
                  <p className="text-[11px] text-stone-400">{p.code} · {formatINR(p.wholesalePrice)}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:sticky sm:rounded-xl sm:border">
              <p className="text-center text-sm font-semibold text-stone-800">{selectedIds.size} Products Selected</p>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {selectedProducts.map((p) => {
            const variants = variantsForProduct(data, p.id)
            const colors = [...new Set(variants.map((v) => v.attributes.color).filter(Boolean))]
            const sizes = [...new Set(variants.map((v) => v.attributes.size).filter(Boolean))]
            const vf = getVariantFilter(p.id)
            return (
              <div key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-3">
                  <ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-10 w-10 rounded-lg object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{p.name}</p>
                    <p className="text-xs text-stone-400">{p.code}</p>
                  </div>
                  <label className="ml-auto flex items-center gap-2 text-xs font-medium text-stone-600">
                    <input type="checkbox" checked={vf.allVariants} onChange={(e) => updateVariantFilter(p.id, { allVariants: e.target.checked })} />
                    All variants
                  </label>
                </div>
                {!vf.allVariants && (
                  <div className="space-y-3 border-t border-stone-100 pt-3">
                    {colors.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase text-stone-400">Colors</p>
                        <div className="flex flex-wrap gap-1.5">
                          {colors.map((c) => {
                            const hex = COLORS.find((cv) => cv.value === c)?.hex
                            const isSelected = vf.colors.has(c!)
                            return (
                              <ColorSwatch key={c} hex={hex} name={c!} showLabel selected={isSelected} onClick={() => {
                                const next = new Set(vf.colors)
                                isSelected ? next.delete(c!) : next.add(c!)
                                updateVariantFilter(p.id, { colors: next })
                              }} />
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {sizes.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase text-stone-400">Sizes</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sizes.map((s) => {
                            const isSelected = vf.sizes.has(s!)
                            return (
                              <button key={s} onClick={() => {
                                const next = new Set(vf.sizes)
                                isSelected ? next.delete(s!) : next.add(s!)
                                updateVariantFilter(p.id, { sizes: next })
                              }} className={`rounded-full border px-3 py-1 text-xs font-medium ${isSelected ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                                {s}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {step === 4 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsCard title="Display Options">
            <Toggle label="Show Wholesale Price" checked={settings.showWholesalePrice} onChange={(v) => setSettings((s) => ({ ...s, showWholesalePrice: v }))} />
            <Toggle label="Show Exact Stock" checked={settings.showExactStock} onChange={(v) => setSettings((s) => ({ ...s, showExactStock: v }))} />
            <Toggle label="Show Availability" checked={settings.showAvailability} onChange={(v) => setSettings((s) => ({ ...s, showAvailability: v }))} />
            <Toggle label="Show MOQ" checked={settings.showMOQ} onChange={(v) => setSettings((s) => ({ ...s, showMOQ: v }))} />
          </SettingsCard>
          <SettingsCard title="Customer Interaction">
            <Toggle label="Allow Product Selection" checked={settings.allowProductSelection} onChange={(v) => setSettings((s) => ({ ...s, allowProductSelection: v }))} />
            <Toggle label="Allow Enquiry" checked={settings.allowEnquiry} onChange={(v) => setSettings((s) => ({ ...s, allowEnquiry: v }))} />
            <Toggle label="Allow Image Download" checked={settings.allowImageDownload} onChange={(v) => setSettings((s) => ({ ...s, allowImageDownload: v }))} />
          </SettingsCard>
          <SettingsCard title="Price Adjustment">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setSettings((s) => ({ ...s, priceAdjustmentType: 'none', priceAdjustmentValue: 0 }))} className={`rounded-xl border py-2 text-xs font-semibold ${settings.priceAdjustmentType === 'none' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>Normal Pricing</button>
              <button onClick={() => setSettings((s) => ({ ...s, priceAdjustmentType: 'percentage' }))} className={`rounded-xl border py-2 text-xs font-semibold ${settings.priceAdjustmentType === 'percentage' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>Percentage</button>
              <button onClick={() => setSettings((s) => ({ ...s, priceAdjustmentType: 'custom' }))} className={`rounded-xl border py-2 text-xs font-semibold ${settings.priceAdjustmentType === 'custom' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>Custom Price</button>
            </div>
            {settings.priceAdjustmentType === 'percentage' && (
              <div className="mt-2 flex gap-2">
                {[-10, -5, 5, 10].map((v) => (
                  <button key={v} onClick={() => setSettings((s) => ({ ...s, priceAdjustmentValue: v }))} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${settings.priceAdjustmentValue === v ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                    {v > 0 ? `+${v}%` : `${v}%`}
                  </button>
                ))}
              </div>
            )}
            {settings.priceAdjustmentType === 'custom' && <input type="number" min="0" value={settings.priceAdjustmentValue || ''} onChange={(e) => setSettings((s) => ({ ...s, priceAdjustmentValue: Number(e.target.value) }))} placeholder="Customer price per piece (₹)" className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />}
          </SettingsCard>
          <SettingsCard title="Security & Expiry">
            <Toggle label="PIN Protection" checked={settings.pinProtected} onChange={(v) => setSettings((s) => ({ ...s, pinProtected: v }))} />
            {settings.pinProtected && (
              <input value={settings.pin ?? ''} onChange={(e) => setSettings((s) => ({ ...s, pin: e.target.value }))} placeholder="4-digit PIN" maxLength={4} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            )}
            <p className="mb-1.5 mt-3 text-xs font-semibold text-stone-600">Expiry</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(['1d', '7d', '30d', 'never'] as const).map((e) => (
                <button key={e} onClick={() => setSettings((s) => ({ ...s, expiry: e }))} className={`rounded-lg border py-1.5 text-xs font-semibold ${settings.expiry === e ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
                  {e === 'never' ? 'Never' : e}
                </button>
              ))}
            </div>
          </SettingsCard>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div className="flex justify-center gap-2">
            <button onClick={() => setDevicePreview('mobile')} className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium ${devicePreview === 'mobile' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
              <Smartphone size={15} /> Mobile
            </button>
            <button onClick={() => setDevicePreview('desktop')} className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium ${devicePreview === 'desktop' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>
              <Monitor size={15} /> Desktop
            </button>
          </div>
          <div className={`mx-auto overflow-hidden rounded-3xl border-8 border-stone-900 bg-white ${devicePreview === 'mobile' ? 'max-w-sm' : 'max-w-3xl'}`}>
            <div className="bg-stone-900 px-5 py-4 text-center text-white">
              <p className="font-serif text-sm font-semibold">Vastraa Wholesale</p>
              <p className="mt-1 text-xs text-stone-300">Private Collection for</p>
              <p className="text-base font-semibold">{customer?.businessName}</p>
              <p className="mt-1 text-sm">{name}</p>
            </div>
            <div className={`grid gap-2 p-3 ${devicePreview === 'mobile' ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {selectedProducts.slice(0, devicePreview === 'mobile' ? 4 : 8).map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border border-stone-100">
                  <div className="aspect-[3/4] bg-stone-100"><ImageWithFallback src={primaryImage(p)} alt={p.name} className="h-full w-full object-cover" /></div>
                  <div className="p-2">
                    <p className="truncate text-[11px] font-semibold text-stone-800">{p.name}</p>
                    {settings.showWholesalePrice && (
                      <p className="text-[11px] font-bold text-stone-900">{formatINR(applyPriceAdjustment(p.wholesalePrice, { settings } as Catalogue))}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 6 && generated && (
        <div className="mx-auto max-w-lg space-y-5 rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={28} />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold text-stone-900">Your private catalogue is ready</h2>
            <p className="mt-1 text-sm text-stone-500">Share it directly with your wholesale customer.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-50 p-3 text-left text-xs sm:grid-cols-4">
            <div><p className="text-stone-400">Customer</p><p className="mt-1 font-semibold text-stone-800">Raj Fashion House</p></div>
            <div><p className="text-stone-400">Catalogue</p><p className="mt-1 font-semibold text-stone-800">September New Arrivals</p></div>
            <div><p className="text-stone-400">Summary</p><p className="mt-1 font-semibold text-stone-800">18 Designs · 76 Variants</p></div>
            <div><p className="text-stone-400">Access</p><p className="mt-1 font-semibold text-emerald-700">Ready Stock · 30 Days</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="flex-1 truncate text-left text-sm font-mono text-stone-700">{catalogueLink}</p>
            <button onClick={() => { navigator.clipboard.writeText(catalogueLink); showToast('Catalogue link copied') }} className="shrink-0 rounded-lg bg-stone-900 p-2 text-white">
              <Copy size={14} />
            </button>
          </div>
          <a href={waCatalogueLink(customer?.whatsapp ?? '', waMessage)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              <MessageCircle size={15} /> Share on WhatsApp
          </a>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => window.open(catalogueLink, '_blank')} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
              <ExternalLink size={15} /> Open Catalogue
            </button>
            <button onClick={() => { navigator.clipboard.writeText(waMessage); showToast('Message copied') }} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
              <Copy size={15} /> Copy Message
            </button>
            <button onClick={() => setQrOpen(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
              <QrCode size={15} /> QR Code
            </button>
            <button onClick={() => window.print()} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Export / Print Catalogue</button>
          </div>
          <button onClick={() => navigate('/catalogues')} className="w-full rounded-xl bg-stone-100 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-200">
            Back to Catalogues
          </button>
        </div>
      )}

      <CatalogueQrModal open={qrOpen} onClose={() => setQrOpen(false)} url={catalogueLink} onCopy={() => { navigator.clipboard.writeText(catalogueLink); showToast('Catalogue link copied') }} />

      {step < 6 && (
        <div className="flex items-center justify-between pb-4">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 disabled:opacity-40">
            Back
          </button>
          {step < 5 ? (
            <button onClick={() => canProceed() && setStep((s) => s + 1)} disabled={!canProceed()} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button onClick={handleGenerate} className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">
              <Check size={15} /> Generate Catalogue Link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CatalogueQrModal({ open, onClose, url, onCopy }: { open: boolean; onClose: () => void; url: string; onCopy: () => void }) {
  const [image, setImage] = useState('')
  useEffect(() => {
    if (open && url) QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1c1917', light: '#ffffff' } }).then(setImage)
  }, [open, url])
  function download() {
    if (!image) return
    const link = document.createElement('a')
    link.href = image
    link.download = 'vastraa-catalogue-qr.png'
    link.click()
  }
  return <Modal open={open} onClose={onClose} title="Vastraa Wholesale" size="sm">
    <div className="space-y-4 text-center"><div><p className="font-serif text-xl font-semibold text-stone-900">Catalogue QR Code</p><p className="mt-1 text-sm text-stone-500">Customer: Raj Fashion House</p><p className="text-sm text-stone-500">Catalogue: September New Arrivals</p></div>
      <div className="mx-auto w-fit rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">{image ? <img src={image} alt="Scannable QR code for the catalogue" className="h-56 w-56" /> : <div className="h-56 w-56 animate-pulse rounded-xl bg-stone-100" />}</div>
      <p className="text-sm text-stone-500">Scan to open this private wholesale catalogue</p>
      <div className="grid grid-cols-2 gap-2"><button onClick={download} disabled={!image} className="rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Download QR</button><button onClick={onCopy} className="rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700">Copy Catalogue Link</button></div><button onClick={onClose} className="w-full py-2 text-sm font-semibold text-stone-500">Close</button>
    </div>
  </Modal>
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-stone-800">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-stone-600">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        type="button"
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-stone-900' : 'bg-stone-200'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}
