'use client'

import { Button } from '@/components/button'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  compact?: boolean
  action?: { label: string } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-24'}`}>
      <div className={`${compact ? 'mb-4 size-12' : 'mb-6 size-16'} flex items-center justify-center rounded-2xl border border-border-subtle bg-surface`}>
        <Icon className={`${compact ? 'size-6' : 'size-8'} text-ink-muted`} />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action &&
        (action.href !== undefined ? (
          <Button href={action.href} color="dark/zinc" className="mt-6">
            {action.label}
          </Button>
        ) : (
          <Button onClick={action.onClick} className="mt-6">
            {action.label}
          </Button>
        ))}
    </div>
  )
}
