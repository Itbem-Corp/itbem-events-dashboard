'use client'

import clsx from 'clsx'
import Image from 'next/image'
import React, { useState } from 'react'

type AvatarProps = {
  src?: string | null
  sizes?: string
  square?: boolean
  initials?: string
  alt?: string
  className?: string
}

export function Avatar({
  src = null,
  sizes = '64px',
  square = false,
  initials,
  alt = '',
  className,
  ...props
}: AvatarProps & React.ComponentPropsWithoutRef<'span'>) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const normalizedSrc = typeof src === 'string' ? src.trim() : ''
  const hasValidSrc = normalizedSrc !== '' && normalizedSrc !== failedSrc

  return (
    <span
      data-slot="avatar"
      {...props}
      className={clsx(
        className,
        'relative inline-grid shrink-0 align-middle [--avatar-radius:20%] *:col-start-1 *:row-start-1',
        'outline -outline-offset-1 outline-black/10 dark:outline-white/10',
        square ? 'rounded-(--avatar-radius) *:rounded-(--avatar-radius)' : 'rounded-full *:rounded-full'
      )}
    >
      {/* Fallback → SOLO si NO hay imagen válida */}
      {!hasValidSrc && initials && (
        <svg
          className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none"
          viewBox="0 0 100 100"
          aria-hidden={alt ? undefined : 'true'}
        >
          {alt && <title>{alt}</title>}
          <text x="50%" y="50%" alignmentBaseline="middle" dominantBaseline="middle" textAnchor="middle" dy=".125em">
            {initials}
          </text>
        </svg>
      )}

      {/* Imagen SOLO si es válida */}
      {hasValidSrc && (
        <Image
          className="size-full object-cover"
          src={normalizedSrc}
          alt={alt}
          fill
          sizes={sizes}
          onError={() => setFailedSrc(normalizedSrc)}
        />
      )}
    </span>
  )
}
