'use client'

import { EventActiveToggle } from '@/components/events/event-active-toggle'
import { usePreviewToken } from '@/hooks/usePreviewToken'
import { getApiErrorMessage } from '@/lib/api-error'
import { getEventPreviewUrl, getEventPublicUrl } from '@/lib/public-urls'
import type { Event } from '@/models/Event'
import { ArrowTopRightOnSquareIcon, PencilSquareIcon } from '@heroicons/react/16/solid'
import { useCallback } from 'react'
import { toast } from 'sonner'

interface EventDetailActionsMenuProps {
  event: Event
  onEdit: () => void
  onEditIntent: () => void
  onPublicContentChanged: () => void
}

export function EventDetailActionsMenu({
  event,
  onEdit,
  onEditIntent,
  onPublicContentChanged,
}: EventDetailActionsMenuProps) {
  const publicUrl = getEventPublicUrl(event.identifier)
  const { ensureToken: ensurePreviewToken, isLoading: openingPreview } = usePreviewToken(event.id)

  const handleOpenPreview = useCallback(async () => {
    if (!event.id || !event.identifier || openingPreview) return
    const previewWindow = window.open('about:blank', '_blank')

    try {
      const token = await ensurePreviewToken()
      const previewUrl = getEventPreviewUrl(event.identifier, {
        cacheKey: Date.now(),
        previewToken: token,
      })
      if (previewWindow) {
        previewWindow.opener = null
        previewWindow.location.href = previewUrl
      } else {
        window.open(previewUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      previewWindow?.close()
      toast.error(getApiErrorMessage(error, 'No se pudo generar el preview'))
    }
  }, [ensurePreviewToken, event.id, event.identifier, openingPreview])

  return (
    <div className="absolute top-full left-0 z-30 mt-2 w-60 rounded-xl border border-white/10 bg-surface/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl sm:right-0 sm:left-auto">
      <button
        type="button"
        onClick={handleOpenPreview}
        disabled={openingPreview}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:outline-none disabled:opacity-50"
      >
        <ArrowTopRightOnSquareIcon className="size-4 text-ink-muted" />
        {openingPreview ? 'Abriendo preview…' : 'Abrir vista previa'}
      </button>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:outline-none"
      >
        <ArrowTopRightOnSquareIcon className="size-4 text-ink-muted" />
        Ver página pública
      </a>
      <button
        type="button"
        onFocus={onEditIntent}
        onPointerEnter={onEditIntent}
        onClick={onEdit}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:outline-none"
      >
        <PencilSquareIcon className="size-4 text-ink-muted" />
        Editar información
      </button>
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-white/8 px-3 py-2.5 text-xs text-ink-secondary">
        <span>{event.is_active ? 'Evento activo' : 'Evento inactivo'}</span>
        <EventActiveToggle event={event} onPublicContentChanged={onPublicContentChanged} />
      </div>
    </div>
  )
}
