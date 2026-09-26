import type { TenantCode } from '@/lib/tenant-config'
import { BuildingOffice2Icon, BuildingStorefrontIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import Image from 'next/image'
import type { CSSProperties } from 'react'

const sizeClasses = {
  sm: 'size-9 rounded-xl',
  md: 'size-11 rounded-[0.95rem]',
  lg: 'size-12 rounded-2xl',
} as const

const iconSizeClasses = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-5.5',
} as const

// Keep the mark stable before the stylesheet has finished loading. Inline SVGs
// otherwise fall back to their browser intrinsic dimensions during a route
// transition, which makes the sidebar identity briefly jump in size.
const sizePixels = {
  sm: 36,
  md: 44,
  lg: 48,
} as const

const iconSizePixels = {
  sm: 16,
  md: 20,
  lg: 22,
} as const

export function BrandMark({
  code,
  name,
  accent,
  size = 'md',
  className,
  priority = false,
}: {
  code: TenantCode
  name: string
  accent: string
  size?: keyof typeof sizeClasses
  className?: string
  priority?: boolean
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={clsx(
        'relative isolate flex shrink-0 items-center justify-center overflow-hidden border border-[var(--app-border-subtle)] bg-[var(--app-surface-raised)] shadow-sm',
        sizeClasses[size],
        className
      )}
      style={
        {
          '--brand-mark-accent': accent,
          backgroundImage:
            'linear-gradient(145deg, color-mix(in srgb, var(--brand-mark-accent) 10%, var(--app-surface-raised)), var(--app-surface-raised))',
          inlineSize: sizePixels[size],
          blockSize: sizePixels[size],
          flexBasis: sizePixels[size],
        } as CSSProperties
      }
    >
      <span className="absolute inset-x-2 top-0 h-px bg-[var(--app-border-subtle)]" />
      {code === 'eventiapp' ? (
        <Image
          src="/eventiapp-icon.svg"
          alt=""
          width={size === 'sm' ? 24 : size === 'md' ? 28 : 31}
          height={size === 'sm' ? 26 : size === 'md' ? 30 : 33}
          priority={priority}
          unoptimized
        />
      ) : code === 'itbem' ? (
        <BuildingOffice2Icon
          className={iconSizeClasses[size]}
          style={{ color: accent, inlineSize: iconSizePixels[size], blockSize: iconSizePixels[size], flex: 'none' }}
        />
      ) : (
        <BuildingStorefrontIcon
          className={iconSizeClasses[size]}
          style={{ color: accent, inlineSize: iconSizePixels[size], blockSize: iconSizePixels[size], flex: 'none' }}
        />
      )}
    </span>
  )
}
