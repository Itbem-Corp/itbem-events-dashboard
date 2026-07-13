import { EventDetailActionsMenu } from '@/components/events/event-detail-actions-menu'
import { getEventPublicUrl } from '@/lib/public-urls'
import type { Event } from '@/models/Event'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/events/event-active-toggle', () => ({
  EventActiveToggle: () => <button role="switch" aria-checked="true" aria-label="Estado del evento" />,
}))

const ensurePreviewToken = vi.fn().mockResolvedValue('preview-token')

vi.mock('@/hooks/usePreviewToken', () => ({
  usePreviewToken: () => ({ ensureToken: ensurePreviewToken, isLoading: false }),
}))

const event = {
  id: 'event-1',
  name: 'Evento premium',
  identifier: 'evento-premium',
  is_active: true,
} as Event

describe('EventDetailActionsMenu', () => {
  it('keeps secondary actions available after the menu is loaded on intent', async () => {
    const onEdit = vi.fn()
    const onEditIntent = vi.fn()
    const previewWindow = { opener: window, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(previewWindow as unknown as Window)

    render(
      <EventDetailActionsMenu
        event={event}
        onEdit={onEdit}
        onEditIntent={onEditIntent}
        onPublicContentChanged={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir vista previa' }))
    await waitFor(() => expect(ensurePreviewToken).toHaveBeenCalledOnce())

    const editButton = screen.getByRole('button', { name: 'Editar información' })
    fireEvent.pointerEnter(editButton)
    fireEvent.click(editButton)
    expect(onEditIntent).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledOnce()

    expect(screen.getByRole('link', { name: 'Ver página pública' })).toHaveAttribute(
      'href',
      getEventPublicUrl(event.identifier)
    )
    expect(screen.getByRole('switch', { name: 'Estado del evento' })).toHaveAttribute('aria-checked', 'true')
  })
})
