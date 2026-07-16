import { EventListActionsMenu } from '@/components/events/event-list-actions-menu'
import type { Event } from '@/models/Event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/events/event-active-toggle', () => ({
  EventActiveToggle: () => <span data-testid="active-toggle" />,
}))

const event = {
  id: 'event-1',
  name: 'Evento premium',
  identifier: 'evento-premium',
  is_active: true,
  event_date_time: '2026-08-01T18:00:00Z',
  timezone: 'America/Mexico_City',
  event_type_id: 'type-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Event

const callbacks = {
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
}

describe('EventListActionsMenu', () => {
  it('gives editors content actions without duplicate or delete', () => {
    render(
      <EventListActionsMenu
        event={event}
        canEdit
        canDuplicate={false}
        canDelete={false}
        {...callbacks}
      />
    )

    expect(screen.getByRole('button', { name: 'Editar evento' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Studio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicar evento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar evento' })).not.toBeInTheDocument()
    expect(screen.getByTestId('active-toggle')).toBeInTheDocument()
  })

  it('exposes each structural action only when explicitly granted', () => {
    render(
      <EventListActionsMenu event={event} canEdit canDuplicate canDelete {...callbacks} />
    )

    expect(screen.getByRole('button', { name: 'Duplicar evento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar evento' })).toBeInTheDocument()
  })
})
