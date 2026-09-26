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
  const [loaded, setLoaded] = useState(false)

  if (errored || !src) {
    return (
      <div className={cn('flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-400', className)}>
        <ImageOff size={24} strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-stone-200" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
