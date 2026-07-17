import { Heading } from '@/components/heading'
import clsx from 'clsx'
import type { ComponentType, ReactNode, SVGProps } from 'react'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow: string
  title: ReactNode
  description: ReactNode
  icon?: Icon
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={clsx('product-page-header flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        <p className="product-eyebrow">
          {Icon && (
            <span className="product-eyebrow-icon">
              <Icon className="size-3.5" />
            </span>
          )}
          {eyebrow}
        </p>
        <Heading className="mt-3 text-[2rem]/9 tracking-[-0.04em] sm:text-4xl/10">{title}</Heading>
        <p className="mt-3 max-w-2xl text-sm/6 text-ink-secondary sm:text-[15px]/7">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  )
}
