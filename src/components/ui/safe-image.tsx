'use client'

import { PhotoIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import Image, { type ImageProps } from 'next/image'
import { useState, type ReactNode } from 'react'

import { buildImageRemotePatterns, isOptimizableImageSrc, isRenderableImageSrc } from '@/lib/image-remote-hosts.mjs'

// Same inputs as next.config.mjs `images.remotePatterns`. NEXT_PUBLIC_* values
// are inlined at build time, so both sides see the same host list.
const IMAGE_REMOTE_PATTERNS = buildImageRemotePatterns({
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
  extraHosts: process.env.NEXT_PUBLIC_IMAGE_REMOTE_HOSTS,
})

/** True when next/image may optimize this URL without throwing. */
export function canOptimizeImageSrc(src: string): boolean {
  return isOptimizableImageSrc(src, IMAGE_REMOTE_PATTERNS)
}

export type SafeImageProps = Omit<ImageProps, 'src'> & {
  src: ImageProps['src'] | null | undefined
  /** Rendered when there is no usable URL or the image fails to load. */
  fallback?: ReactNode
  /** Extra classes for the default placeholder. */
  fallbackClassName?: string
}

/**
 * next/image that can never take a page down because of its URL.
 *
 * - Hosts allowed by `images.remotePatterns` (and same-origin paths) are optimized.
 * - Any other http(s) host, blob: or data: preview is rendered unoptimized
 *   instead of letting next/image throw "hostname is not configured".
 * - If the optimizer itself fails (e.g. it refuses a private IP in local
 *   development), the image is retried once unoptimized.
 * - Empty, malformed or failing URLs show a neutral placeholder (or `fallback`).
 */
export function SafeImage({ src, fallback, fallbackClassName, onError, unoptimized, alt, ...props }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [directSrc, setDirectSrc] = useState<string | null>(null)
  const normalized = typeof src === 'string' ? src.trim() : src
  const srcKey = typeof normalized === 'string' ? normalized : normalized ? JSON.stringify(normalized) : ''

  const unusable =
    !normalized || (typeof normalized === 'string' && !isRenderableImageSrc(normalized)) || srcKey === failedSrc

  if (unusable) {
    if (fallback !== undefined) return <>{fallback}</>
    return (
      <ImagePlaceholder
        alt={alt}
        fill={props.fill}
        width={props.width}
        height={props.height}
        className={clsx(fallbackClassName, !props.fill && props.className)}
      />
    )
  }

  const mustSkipOptimizer =
    Boolean(unoptimized) ||
    srcKey === directSrc ||
    (typeof normalized === 'string' && !isOptimizableImageSrc(normalized, IMAGE_REMOTE_PATTERNS))

  return (
    <Image
      {...props}
      src={normalized}
      alt={alt}
      unoptimized={mustSkipOptimizer}
      onError={(event) => {
        if (!mustSkipOptimizer && typeof normalized === 'string') {
          setDirectSrc(srcKey)
          return
        }
        setFailedSrc(srcKey)
        onError?.(event)
      }}
    />
  )
}

function ImagePlaceholder({
  alt,
  fill,
  width,
  height,
  className,
}: {
  alt: string
  fill?: boolean
  width?: number | `${number}`
  height?: number | `${number}`
  className?: string
}) {
  return (
    <span
      data-slot="image-fallback"
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={fill ? undefined : { width: width ? Number(width) : undefined, height: height ? Number(height) : undefined }}
      className={clsx(
        'flex items-center justify-center bg-surface-raised text-ink-muted',
        fill ? 'absolute inset-0' : 'inline-flex',
        className
      )}
    >
      <PhotoIcon className="size-1/3 max-h-10 max-w-10 min-h-4 min-w-4" aria-hidden="true" />
    </span>
  )
}
