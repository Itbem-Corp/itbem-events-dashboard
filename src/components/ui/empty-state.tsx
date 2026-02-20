'use client'

import { motion } from 'motion/react'
import { Button } from '@/components/button'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 mb-6">
        <Icon className="size-8 text-zinc-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-zinc-500 max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </motion.div>
  )
}
