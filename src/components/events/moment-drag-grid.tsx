'use client'

import type { Moment } from '@/models/Moment'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type ReactNode } from 'react'

function SortableFrame({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        position: 'relative',
        zIndex: isDragging ? 999 : undefined,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-1.5 left-1.5 z-20 cursor-grab touch-none rounded-md bg-black/50 p-1 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white active:cursor-grabbing"
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
      >
        <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
          <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
          <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
        </svg>
      </button>
      {children}
    </div>
  )
}

interface MomentDragGridProps {
  moments: Moment[]
  onOrderChange: (moments: Moment[]) => void
  renderCard: (moment: Moment) => ReactNode
}

export function MomentDragGrid({ moments, onOrderChange, renderCard }: MomentDragGridProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const handleDragStart = (event: DragStartEvent) => setActiveDragId(String(event.active.id))
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = moments.findIndex((moment) => moment.id === active.id)
    const newIndex = moments.findIndex((moment) => moment.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) onOrderChange(arrayMove(moments, oldIndex, newIndex))
  }
  const activeMoment = activeDragId ? moments.find((moment) => moment.id === activeDragId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={moments.map((moment) => moment.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5 md:grid-cols-4 xl:grid-cols-5">
          {moments.map((moment) => (
            <SortableFrame key={moment.id} id={moment.id}>{renderCard(moment)}</SortableFrame>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeMoment ? (
          <div className="scale-105 rotate-1 rounded-xl opacity-95 shadow-2xl ring-2 shadow-black/60 ring-cyan-400 ring-offset-2 ring-offset-zinc-950 transition-transform">
            {renderCard(activeMoment)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
