'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { Reorder, AnimatePresence, motion } from 'motion/react'
import {
  Bars3Icon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/react/20/solid'
import { DraggableSectionRow } from '@/components/studio/draggable-section-row'
import { sectionHiddenByEventConfig } from '@/lib/section-config-visibility'
import type { EventConfig } from '@/models/EventConfig'
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
          <p className="text-[10px] text-ink-muted">
            Usa el icono <Bars3Icon className="inline size-3 text-ink-secondary" /> para arrastrar y reordenar.
            Los cambios se guardan automáticamente.
          </p>
        </div>
        <button
          onClick={() => {
            setDismissed(true)
            localStorage.setItem(HINT_KEY, '1')
          }}
          className="shrink-0 text-ink-muted hover:text-ink-secondary text-[10px] transition-colors"
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
  onSaveConfig: (
    section: EventSection,
    config: Record<string, unknown>,
    expectedUpdatedAt?: string | null
  ) => Promise<EventSection | null | void>
  /** The user chose to drop a section's unsaved (failed or conflicting) edits. */
  onDiscardFailedSave?: (sectionId: string) => void
  onResourcesChanged?: () => void
  /** Event config, to flag sections hidden by an event-level switch (STU-54). */
  eventConfig?: EventConfig
  /** Where sections are added and deleted (Configuración > Secciones de la página). */
  manageSectionsHref?: string
}

export function DraggableSectionList({
  sections,
  isLoading,
  onReorder,
  onToggleVisible,
  onSaveConfig,
  onDiscardFailedSave,
  onResourcesChanged,
  eventConfig,
  manageSectionsHref,
}: DraggableSectionListProps) {
  const [expandedPanel, setExpandedPanel] = useState<{ id: string; panel: 'config' | 'media' } | null>(null)

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedPanel((prev) => (prev?.id === id && prev.panel === 'config' ? null : { id, panel: 'config' }))
  }, [])

  const handleToggleMedia = useCallback((id: string) => {
    setExpandedPanel((prev) => (prev?.id === id && prev.panel === 'media' ? null : { id, panel: 'media' }))
  }, [])

  const hiddenReasons = useMemo(() => {
    const reasons = new Map<string, ReturnType<typeof sectionHiddenByEventConfig>>()
    for (const section of sections) {
      const reason = sectionHiddenByEventConfig(section.component_type || section.type, eventConfig)
      if (reason) reasons.set(section.id, reason)
    }
    return reasons
  }, [sections, eventConfig])

  const handleDragStart = useCallback(() => {
    setExpandedPanel(null)
  }, [])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-surface-raised/50 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  // Empty state
  if (sections.length === 0) {
    return (
      <div className="py-8 text-center">
        <Squares2X2Icon className="mx-auto size-8 text-ink-muted mb-3" />
        <p className="text-xs text-ink-muted">Aún no hay secciones.</p>
        <p className="text-[10px] text-ink-muted mt-1">
          Se agregan en el evento, en Configuración &gt; Secciones de la página.
        </p>
        {manageSectionsHref && (
          <Link
            href={manageSectionsHref}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
          >
            Agregar secciones
          </Link>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] text-ink-muted">
          {sections.length} {sections.length === 1 ? 'sección' : 'secciones'}
        </p>
        <span className="text-[10px] text-ink-muted">
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
            isExpanded={expandedPanel?.id === section.id && expandedPanel.panel === 'config'}
            isMediaOpen={expandedPanel?.id === section.id && expandedPanel.panel === 'media'}
            onToggleExpand={handleToggleExpand}
            onToggleMedia={handleToggleMedia}
            onToggleVisible={onToggleVisible}
            onSaveConfig={onSaveConfig}
            onDiscardFailedSave={onDiscardFailedSave}
            onResourcesChanged={onResourcesChanged}
            onDragStart={handleDragStart}
            hiddenReason={hiddenReasons.get(section.id) ?? null}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}
