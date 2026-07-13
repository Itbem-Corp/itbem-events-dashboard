'use client'

import { Button } from '@/components/button'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: { label: string } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900">
        <Icon className="size-8 text-zinc-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-zinc-500">{description}</p>}
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
