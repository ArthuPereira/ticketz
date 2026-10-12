import { useState } from 'react'
import type { ImgHTMLAttributes } from 'react'

interface EventBannerProps {
  className?: string
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading']
  name: string
  source: string | null
}

export const EVENT_BANNER_PLACEHOLDER = '/event-placeholder.svg'

export function EventBanner({
  className,
  loading = 'eager',
  name,
  source,
}: EventBannerProps) {
  const [hasError, setHasError] = useState(false)
  const imageSource = source && !hasError ? source : EVENT_BANNER_PLACEHOLDER

  return (
    <img
      alt={source && !hasError ? `Banner do evento ${name}` : ''}
      className={className}
      loading={loading}
      onError={() => setHasError(true)}
      src={imageSource}
    />
  )
}
