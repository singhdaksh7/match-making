import {
  ArrowLeft, Boxes, Calendar, Copy, Edit3, Eye, Package, Tag, Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StockAdjustModal } from '@/components/inventory/StockAdjustModal'
import { VariantTable } from '@/components/product/VariantTable'
import { useAppData } from '@/context/AppDataContext'
import { useToast } from '@/context/ToastContext'
import { COLORS } from '@/data/attributes'
import type { ProductVariant } from '@/types'
import { formatDate, formatINR, formatNumber } from '@/utils/format'
import { categoryName, totalStockForProduct, variantsForProduct } from '@/utils/selectors'

export default function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, archiveProduct, duplicateProduct, refreshData } = useAppData()
  const { showToast } = useToast()
  const [activeImage, setActiveImage] = useState(0)
  const [adjustingVariant, setAdjustingVariant] = useState<ProductVariant | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingVariant, setDeletingVariant] = useState<ProductVariant | null>(null)

  const product = data.products.find((p) => p.id === id)
  const variants = useMemo(() => (product ? variantsForProduct(data, product.id) : []), [data, product])
  const inventoryHistory = useMemo(
    () => data.inventoryEntries.filter((e) => e.productId === id).slice(0, 8),
    [data, id],
  )

  if (!product) return <Navigate to="/products" replace />

  const stock = totalStockForProduct(data, product.id)
  const colors = [...new Set(variants.map((v) => v.attributes.color).filter(Boolean))]
  const sizes = [...new Set(variants.map((v) => v.attributes.size).filter(Boolean))]
  const fabrics = [...new Set(variants.map((v) => v.attributes.fabric).filter(Boolean))]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/products" className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
          <ArrowLeft size={16} /> Back to Products
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { duplicateProduct(product.id); showToast('Product duplicated') }}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 active:scale-[0.98] sm:text-sm"
          >
            <Copy size={14} /> Duplicate
          </button>
          <button
            onClick={() => setConfirmArchive(true)}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-[0.98] sm:text-sm"
          >
            <Trash2 size={14} /> Archive
          </button>
          <button
            onClick={() => setDeleting(true)}
            data-testid="product-delete"
            className="flex h-11 items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-100 active:scale-[0.98] sm:text-sm"
          >
            <Trash2 size={14} /> Delete
          </button>
          <Link to={`/products/${product.id}/edit`} className="flex h-11 items-center gap-1.5 rounded-xl bg-stone-900 px-4 text-xs font-semibold text-white hover:bg-stone-800 active:scale-[0.98] sm:text-sm">
            <Edit3 size={14} /> Edit Product
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
            <ImageWithFallback src={product.media[activeImage]?.url} alt={product.name} className="h-full w-full object-cover" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {product.media.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setActiveImage(i)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${activeImage === i ? 'border-stone-900' : 'border-transparent'}`}
              >
                <ImageWithFallback src={m.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-mono text-xs font-semibold text-stone-500">{product.code}</span>
              <StatusBadge status={product.status} />
            </div>
            <h1 className="mt-2 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">{product.name}</h1>
            <p className="mt-1 text-sm text-stone-500">{categoryName(data, product.categoryId)}</p>
          </div>

          <p className="text-sm leading-relaxed text-stone-600">{product.description}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoTile label="Wholesale Price" value={formatINR(product.wholesalePrice)} icon={Tag} />
            <InfoTile label="MOQ" value={`${product.moq} pcs`} icon={Package} />
            <InfoTile label="Total Stock" value={formatNumber(stock)} icon={Boxes} />
            <InfoTile label="Views" value={formatNumber(product.views)} icon={Eye} />
            <InfoTile label="Date Added" value={formatDate(product.createdAt)} icon={Calendar} />
          </div>

          {fabrics.length > 0 && (
            <AttrRow label="Fabric" values={fabrics.map((f) => <Chip key={f}>{f}</Chip>)} />
          )}

          {colors.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Available Colors</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => {
                  const hex = COLORS.find((cv) => cv.value === c)?.hex
                  return <ColorSwatch key={c} hex={hex} name={c!} showLabel />
                })}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <AttrRow label="Sizes" values={sizes.map((s) => <Chip key={s}>{s}</Chip>)} />
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">Variants ({variants.length})</h2>
        </div>
        <VariantTable variants={variants} onAdjustStock={setAdjustingVariant} onDelete={setDeletingVariant} />
      </div>

      {inventoryHistory.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-stone-900">Inventory History</h2>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {inventoryHistory.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-stone-50 px-4 py-3 text-sm last:border-0">
                <div>
                  <p className="font-medium text-stone-800">{e.reason}</p>
                  <p className="text-xs text-stone-400">{formatDate(e.createdAt)} · {e.createdBy}</p>
                </div>
                <p className={`font-semibold ${e.type === 'add' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {e.type === 'add' ? '+' : '-'}{e.quantity} pcs
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <StockAdjustModal variant={adjustingVariant} onClose={() => setAdjustingVariant(null)} />
      {deleting && (
        <DeleteDialog
          open
          onClose={() => setDeleting(false)}
          entityLabel="Product"
          collection="products"
          id={product.id}
          deletePath={`/api/v1/products/${product.id}`}
          onDeleted={async () => { await refreshData(); navigate('/products') }}
          archive={product.status === 'archived' ? undefined : { label: 'Archive instead', onArchive: async () => { await archiveProduct(product.id); showToast('Product archived'); navigate('/products') } }}
        />
      )}
      {deletingVariant && (
        <DeleteDialog
          open
          onClose={() => setDeletingVariant(null)}
          entityLabel="Variant"
          collection="variants"
          id={deletingVariant.id}
          deletePath={`/api/v1/products/${product.id}/variants/${deletingVariant.id}`}
          onDeleted={refreshData}
        />
      )}
      <ConfirmDialog
        open={confirmArchive}
        title="Archive this product?"
        description="Archived products are hidden from customer catalogues and the product list, but historical data is preserved."
        confirmLabel="Archive"
        danger
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => { archiveProduct(product.id); showToast('Product archived'); navigate('/products') }}
      />
    </div>
  )
}

function InfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Tag }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <Icon size={14} className="mb-1.5 text-stone-400" />
      <p className="text-sm font-semibold text-stone-800">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  )
}

function AttrRow({ label, values }: { label: string; values: React.ReactNode[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="flex flex-wrap gap-2">{values}</div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700">{children}</span>
}
