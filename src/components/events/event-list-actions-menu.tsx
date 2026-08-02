'use client'

import { EventActiveToggle } from '@/components/events/event-active-toggle'
import { Link } from '@/components/link'
import type { Event } from '@/models/Event'
import { DocumentDuplicateIcon, PaintBrushIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'

interface EventListActionsMenuProps {
  event: Event
  canEdit: boolean
  canDuplicate: boolean
  canDelete: boolean
  onEdit: (event: Event) => void
  onDuplicate: (event: Event) => void
  onDelete: (event: Event) => void
  onEditIntent?: () => void
  onDuplicateIntent?: () => void
  onDeleteIntent?: () => void
  onStudioIntent?: (event: Event) => void
}

export function EventListActionsMenu({
  event,
  canEdit,
  canDuplicate,
  canDelete,
  onEdit,
  onDuplicate,
  onDelete,
  onEditIntent,
  onDuplicateIntent,
  onDeleteIntent,
  onStudioIntent,
}: EventListActionsMenuProps) {
  return (
    <div
      role="group"
      aria-label={`Más acciones para ${event.name}`}
      className="absolute top-full right-0 z-30 mt-2 w-52 rounded-xl border border-border-subtle bg-surface-raised/95 p-1 shadow-[0_20px_60px_var(--app-shadow-strong)] backdrop-blur-xl"
    >
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => onEdit(event)}
            onFocus={onEditIntent}
            onPointerDown={onEditIntent}
            onPointerEnter={onEditIntent}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus-visible:bg-surface-interactive focus-visible:outline-none"
          >
            <PencilIcon className="size-4 text-ink-muted" />
            Editar evento
          </button>
          <Link
            href={`/events/${event.id}/studio`}
            onFocus={() => onStudioIntent?.(event)}
            onPointerDown={() => onStudioIntent?.(event)}
            onPointerEnter={() => onStudioIntent?.(event)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus-visible:bg-surface-interactive focus-visible:outline-none"
          >
            <PaintBrushIcon className="size-4 text-ink-muted" />
            Abrir Studio
          </Link>
        </>
      )}
      {canDuplicate && (
        <button
          type="button"
          onClick={() => onDuplicate(event)}
          onFocus={onDuplicateIntent}
          onPointerDown={onDuplicateIntent}
          onPointerEnter={onDuplicateIntent}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus-visible:bg-surface-interactive focus-visible:outline-none"
        >
          <DocumentDuplicateIcon className="size-4 text-ink-muted" />
          Duplicar evento
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(event)}
          onFocus={onDeleteIntent}
          onPointerDown={onDeleteIntent}
          onPointerEnter={onDeleteIntent}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:bg-red-500/10 focus-visible:outline-none"
        >
          <TrashIcon className="size-4 text-red-400/70" />
          Eliminar evento
        </button>
      )}
      {canEdit && (
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border-subtle px-3 py-2.5 text-xs text-ink-secondary">
          <span>{event.is_active ? 'Evento activo' : 'Evento inactivo'}</span>
          <EventActiveToggle event={event} />
        </div>
      )}
    </div>
  )
}
