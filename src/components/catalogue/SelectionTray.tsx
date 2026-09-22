import { ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function SelectionTray({ slug, count }: { slug: string; count: number }) {
  const navigate = useNavigate()
  if (count === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <button
        onClick={() => navigate(`/catalogue/${slug}/selection`)}
        className="mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl bg-stone-900 px-5 py-3.5 text-white shadow-lg"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={17} />
          {count} {count === 1 ? 'Product' : 'Products'} Selected
        </span>
        <span className="text-sm font-semibold underline underline-offset-2">View Selection</span>
      </button>
    </div>
  )
}
