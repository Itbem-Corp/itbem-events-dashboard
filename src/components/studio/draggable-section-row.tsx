'use client'

import { memo, useState } from 'react'
import { Reorder, useDragControls, AnimatePresence } from 'motion/react'
import {
  Bars3Icon,
  EyeIcon,
  EyeSlashIcon,
  ChevronDownIcon,
  ArrowPathIcon,
} from '@heroicons/react/20/solid'
import { getTypeMeta } from '@/components/studio/studio-constants'
import SectionConfigEditor from '@/components/studio/section-config-editor'
import type { EventSection } from '@/models/EventSection'

interface DraggableSectionRowProps {
  section: EventSection
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  onToggleVisible: (section: EventSection) => void
  onSaveConfig: (section: EventSection, config: Record<string, unknown>) => Promise<void>
  onDragStart?: () => void
}

export const DraggableSectionRow = memo(function DraggableSectionRow({
  section,
  isExpanded,
  onToggleExpand,
  onToggleVisible,
  onSaveConfig,
  onDragStart,
}: DraggableSectionRowProps) {
  const controls = useDragControls()
  const [togglingVisible, setTogglingVisible] = useState(false)
  const typeName = section.component_type || section.type || ''
  const meta = getTypeMeta(typeName)
  const Icon = meta.icon

  const handleToggleVisible = async () => {
    setTogglingVisible(true)
    await onToggleVisible(section)
    setTogglingVisible(false)
  }

  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 50,
      }}
      layout="position"
      transition={{ duration: 0.2 }}
      className="list-none"
    >
      <div
        className={[
          'flex items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors',
          section.is_visible
            ? 'border-white/10 bg-zinc-900/60 hover:bg-zinc-900/80'
            : 'border-dashed border-white/5 bg-zinc-950/40 opacity-50',
          isExpanded ? 'rounded-b-none border-indigo-500/30 bg-indigo-500/5' : '',
        ].join(' ')}
      >
        {/* Drag handle */}
        <button
          onPointerDown={(e) => controls.start(e)}
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
          title="Arrastra para reordenar"
        >
          <Bars3Icon className="size-4" />
        </button>

        {/* Colored type icon */}
        <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${meta.iconBoxCls}`}>
          <Icon className="size-3.5" />
        </div>

        {/* Name + type label */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">{section.name}</p>
          <p className="text-[10px] text-zinc-600">{meta.label}</p>
        </div>

        {/* Visibility toggle */}
        <button
          onClick={handleToggleVisible}
          disabled={togglingVisible}
          className={[
            'shrink-0 p-1.5 rounded-lg transition-colors',
            section.is_visible
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              : 'text-zinc-700 hover:text-zinc-500 hover:bg-white/5',
          ].join(' ')}
          title={section.is_visible ? 'Ocultar seccion' : 'Mostrar seccion'}
        >
          {togglingVisible ? (
            <ArrowPathIcon className="size-3.5 animate-spin" />
          ) : section.is_visible ? (
            <EyeIcon className="size-3.5" />
          ) : (
            <EyeSlashIcon className="size-3.5" />
          )}
        </button>

        {/* Expand chevron */}
        <button
          onClick={() => onToggleExpand(section.id)}
          className={[
            'shrink-0 p-1 rounded transition-colors',
            isExpanded ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400',
          ].join(' ')}
          title="Editar configuracion"
        >
          <ChevronDownIcon
            className={['size-3.5 transition-transform', isExpanded ? 'rotate-180' : ''].join(' ')}
          />
        </button>
      </div>

      {/* Expandable config editor */}
      <AnimatePresence>
        {isExpanded && (
          <SectionConfigEditor
            section={section}
            onSave={onSaveConfig}
            onClose={() => onToggleExpand(section.id)}
          />
        )}
      </AnimatePresence>
    </Reorder.Item>
  )
})
