'use client'

import type { PanelId } from '@/components/studio/studio-constants'
import { Cog6ToothIcon, ListBulletIcon, PaintBrushIcon } from '@heroicons/react/20/solid'
import type { KeyboardEvent } from 'react'
import { useRef } from 'react'

interface StudioPanelTabsProps {
  activePanel: PanelId
  onPanelChange: (panel: PanelId) => void
  onPanelIntent?: (panel: PanelId) => void
}

const PANELS = [
  { id: 'sections', icon: ListBulletIcon, label: 'Secciones' },
  { id: 'config', icon: Cog6ToothIcon, label: 'Ajustes' },
  { id: 'design', icon: PaintBrushIcon, label: 'Diseño' },
] as const satisfies ReadonlyArray<{ id: PanelId; icon: typeof ListBulletIcon; label: string }>

export function StudioPanelTabs({ activePanel, onPanelChange, onPanelIntent }: StudioPanelTabsProps) {
  const tabRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({})

  const activatePanel = (panel: PanelId) => {
    onPanelIntent?.(panel)
    onPanelChange(panel)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, panel: PanelId) => {
    const currentIndex = PANELS.findIndex(({ id }) => id === panel)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PANELS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PANELS.length) % PANELS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = PANELS.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextPanel = PANELS[nextIndex].id
    activatePanel(nextPanel)
    tabRefs.current[nextPanel]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Herramientas del estudio"
      className="scrollbar-none flex overflow-x-auto border-b border-white/10"
    >
      {PANELS.map(({ id, icon: Icon, label }) => {
        const isActive = activePanel === id

        return (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[id] = element
            }}
            type="button"
            id={`studio-tab-${id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`studio-panel-${id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => activatePanel(id)}
            onFocus={() => onPanelIntent?.(id)}
            onPointerEnter={() => onPanelIntent?.(id)}
            onKeyDown={(event) => handleKeyDown(event, id)}
            className={[
              'flex min-h-11 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-400',
              isActive ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
