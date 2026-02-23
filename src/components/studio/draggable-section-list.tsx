'use client'

import { useState, useCallback } from 'react'
import { Reorder, AnimatePresence, motion } from 'motion/react'
import {
  Bars3Icon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/react/20/solid'
import { DraggableSectionRow } from '@/components/studio/draggable-section-row'
import type { EventSection } from '@/models/EventSection'

// ─── Onboarding Hint ─────────────────────────────────────────────────────────

const HINT_KEY = 'studio-onboarding-dismissed'

function OnboardingHint() {
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(HINT_KEY) === '1',
  )

  if (dismissed) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 mb-3"
    >
      <div className="flex items-start gap-2">
        <SparklesIcon className="size-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-indigo-300">Arrastra las secciones</p>
          <p className="text-[10px] text-zinc-500">
            Usa el icono <Bars3Icon className="inline size-3 text-zinc-400" /> para arrastrar y reordenar.
            Los cambios se guardan automaticamente.
          </p>
        </div>
        <button
          onClick={() => {
            setDismissed(true)
            localStorage.setItem(HINT_KEY, '1')
          }}
          className="shrink-0 text-zinc-600 hover:text-zinc-400 text-[10px] transition-colors"
        >
          Entendido
        </button>
      </div>
    </motion.div>
  )
}

// ─── Draggable Section List ──────────────────────────────────────────────────

interface DraggableSectionListProps {
  sections: EventSection[]
  isLoading: boolean
  onReorder: (newOrder: EventSection[]) => void
  onToggleVisible: (section: EventSection) => void
  onSaveConfig: (section: EventSection, config: Record<string, unknown>) => Promise<void>
}

export function DraggableSectionList({
  sections,
  isLoading,
  onReorder,
  onToggleVisible,
  onSaveConfig,
}: DraggableSectionListProps) {
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedSectionId((prev) => (prev === id ? null : id))
  }, [])

  const handleDragStart = useCallback(() => {
    setExpandedSectionId(null)
  }, [])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-zinc-800/50 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  // Empty state
  if (sections.length === 0) {
    return (
      <div className="py-8 text-center">
        <Squares2X2Icon className="mx-auto size-8 text-zinc-700 mb-3" />
        <p className="text-xs text-zinc-600">Sin secciones aun.</p>
        <p className="text-[10px] text-zinc-700 mt-1">
          Agrega secciones desde la pestana del evento.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] text-zinc-600">
          {sections.length} seccion{sections.length !== 1 ? 'es' : ''}
        </p>
        <span className="text-[10px] text-zinc-700">
          Arrastra para reordenar
        </span>
      </div>

      {/* Onboarding hint */}
      <AnimatePresence>
        <OnboardingHint />
      </AnimatePresence>

      {/* Reorderable list */}
      <Reorder.Group
        axis="y"
        values={sections}
        onReorder={onReorder}
        className="space-y-1.5"
      >
        {sections.map((section) => (
          <DraggableSectionRow
            key={section.id}
            section={section}
            isExpanded={expandedSectionId === section.id}
            onToggleExpand={handleToggleExpand}
            onToggleVisible={onToggleVisible}
            onSaveConfig={onSaveConfig}
            onDragStart={handleDragStart}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}
