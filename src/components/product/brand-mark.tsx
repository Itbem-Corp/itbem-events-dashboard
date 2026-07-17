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
        <BuildingOffice2Icon className={iconSizeClasses[size]} style={{ color: accent }} />
      ) : (
        <BuildingStorefrontIcon className={iconSizeClasses[size]} style={{ color: accent }} />
      )}
    </span>
  )
}
