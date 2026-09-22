import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAppData } from '@/context/AppDataContext'
import { waCatalogueLink } from '@/utils/selectors'
import { formatINR } from '@/utils/format'

export default function EnquirySuccessPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { data } = useAppData()
  const result = (location.state as { refNumber?: string; designs?: number; variants?: number; pieces?: number; estimatedValue?: number } | null)
  const refNumber = result?.refNumber

  const catalogue = data.catalogues.find((c) => c.slug === slug)
  if (!catalogue) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf8f5] px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={30} />
        </div>
        <h1 className="mt-4 font-serif text-xl font-semibold text-stone-900">Enquiry Sent Successfully</h1>
        <p className="mt-2 text-sm text-stone-500">Your selected products have been shared with Vastraa Wholesale.</p>
        {refNumber && (
          <p className="mt-4 rounded-xl bg-stone-100 py-2.5 text-sm font-mono font-semibold text-stone-700">
            Reference: {refNumber}
          </p>
        )}
        {result?.pieces != null && <div className="mt-4 grid grid-cols-3 rounded-xl bg-stone-50 p-3 text-center"><div><p className="font-semibold text-stone-800">{result.designs}</p><p className="text-[10px] text-stone-400">Designs</p></div><div><p className="font-semibold text-stone-800">{result.variants}</p><p className="text-[10px] text-stone-400">Variants</p></div><div><p className="font-semibold text-stone-800">{result.pieces}</p><p className="text-[10px] text-stone-400">Total Quantity</p></div>{catalogue.settings.showWholesalePrice && <p className="col-span-3 mt-2 border-t border-stone-200 pt-2 text-xs font-semibold text-stone-700">Estimated Value: {formatINR(result.estimatedValue ?? 0)}</p>}</div>}
        <div className="mt-6 flex flex-col gap-2.5">
          <Link to={`/catalogue/${slug}`} className="rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800">
            Continue Browsing
          </Link>
          <a
            href={waCatalogueLink(data.settings.business.whatsapp, `Hi, I just submitted an enquiry (${refNumber ?? ''}) for ${catalogue.name}.`)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <MessageCircle size={15} /> WhatsApp Vastraa
          </a>
        </div>
      </div>
    </div>
  )
}
