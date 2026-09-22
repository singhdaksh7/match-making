import { Bell, Building2, Palette, RotateCcw, Sliders, Users } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAppData } from '@/context/AppDataContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

export default function SettingsPage() {
  const { data, updateSettings, resetDemoData } = useAppData()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [business, setBusiness] = useState(data.settings.business)
  const [confirmReset, setConfirmReset] = useState(false)

  function saveBusiness() {
    updateSettings({ business })
    showToast('Business profile updated')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">Manage your business profile and application preferences</p>
      </div>

      <Section icon={Building2} title="Business Profile">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Business Name" value={business.name} onChange={(v) => setBusiness((b) => ({ ...b, name: v }))} />
          <TextField label="Business Type" value={business.type} onChange={(v) => setBusiness((b) => ({ ...b, type: v }))} />
          <TextField label="Phone" value={business.phone} onChange={(v) => setBusiness((b) => ({ ...b, phone: v }))} />
          <TextField label="WhatsApp" value={business.whatsapp} onChange={(v) => setBusiness((b) => ({ ...b, whatsapp: v }))} />
          <TextField label="Email" value={business.email} onChange={(v) => setBusiness((b) => ({ ...b, email: v }))} />
          <TextField label="Address" value={business.address} onChange={(v) => setBusiness((b) => ({ ...b, address: v }))} />
        </div>
        <button onClick={saveBusiness} className="mt-4 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">Save Changes</button>
      </Section>

      <Section icon={Sliders} title="Catalogue Defaults">
        <div className="space-y-3">
          <Toggle label="Show price by default" checked={data.settings.catalogueDefaults.showPrice} onChange={(v) => updateSettings({ catalogueDefaults: { ...data.settings.catalogueDefaults, showPrice: v } })} />
          <Toggle label="Show stock by default" checked={data.settings.catalogueDefaults.showStock} onChange={(v) => updateSettings({ catalogueDefaults: { ...data.settings.catalogueDefaults, showStock: v } })} />
          <div>
            <p className="mb-1.5 text-xs font-semibold text-stone-600">Default Expiry</p>
            <select
              value={data.settings.catalogueDefaults.defaultExpiry}
              onChange={(e) => updateSettings({ catalogueDefaults: { ...data.settings.catalogueDefaults, defaultExpiry: e.target.value as any } })}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm sm:w-48"
            >
              <option value="1d">1 Day</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
      </Section>

      <Section icon={Bell} title="Inventory Settings">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">Low Stock Threshold</p>
          <input
            type="number"
            value={data.settings.lowStockThreshold}
            onChange={(e) => updateSettings({ lowStockThreshold: Number(e.target.value) })}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm sm:w-48"
          />
        </div>
      </Section>

      <Section icon={Users} title="Users">
        <div className="flex items-center gap-3 rounded-xl border border-stone-100 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5ede2] text-sm font-semibold text-[#7a5230]">
            {user?.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-800">{user?.name}</p>
            <p className="text-xs text-stone-400">{user?.email} · Owner</p>
          </div>
        </div>
      </Section>

      <Section icon={Palette} title="Appearance">
        <p className="text-sm text-stone-500">Vastraa Wholesale uses a warm neutral, premium fashion-forward theme across the admin and customer catalogue.</p>
      </Section>

      <Section icon={RotateCcw} title="Demo Reset">
        <p className="mb-3 text-sm text-stone-500">Restore all products, customers, catalogues and enquiries to their original demo state.</p>
        <button onClick={() => setConfirmReset(true)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
          Reset Demo Data
        </button>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        description="This will restore the original Vastraa Wholesale demo data. Any changes you've made will be lost."
        confirmLabel="Reset Data"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { resetDemoData(); setConfirmReset(false); showToast('Demo data has been reset') }}
      />
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Building2; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5ede2] text-[#7a5230]"><Icon size={15} /></span>
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-stone-600">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-stone-600">{label}</span>
      <button onClick={() => onChange(!checked)} type="button" className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-stone-900' : 'bg-stone-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}
