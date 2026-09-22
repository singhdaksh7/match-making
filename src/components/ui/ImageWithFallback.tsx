import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/utils/cn'

interface Props {
  src: string
  alt: string
  className?: string
}

export function ImageWithFallback({ src, alt, className }: Props) {
  const [errored, setErrored] = useState(false)

  if (errored || !src) {
    return (
      <div className={cn('flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-400', className)}>
        <ImageOff size={28} strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  )
}
