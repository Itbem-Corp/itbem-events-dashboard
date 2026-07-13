import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/components/ui/branded-qr', () => ({
  BrandedQR: ({ value }: { value: string }) => <div data-testid="branded-qr" data-value={value} />,
}))

const mockEvent: Event = {
  id: 'evt-001',
  name: 'Test Event',
  identifier: 'test-event',
  is_active: true,
  event_date_time: '2026-08-15T20:00:00-06:00',
  timezone: 'America/Mexico_City',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Event

function status(code: string): GuestStatus {
  return {
    id: code.toLowerCase(),
    code,
    name: code,
    color: code.toLowerCase(),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-001',
    event_id: 'evt-001',
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@example.com',
    phone: '+52 55 1234 5678',
    pretty_token: 'TOKEN123',
    rsvp_status: 'PENDING',
    status_id: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Guest
}

describe('EventSharePanel', () => {
  it('keeps its loading and retry states isolated from the settings panel', async () => {
    const { EventSharePanel } = await import('@/components/events/event-share-panel')
    const retry = vi.fn()
    const { rerender } = render(<EventSharePanel event={mockEvent} guests={[]} isLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos para compartir…')

    rerender(<EventSharePanel event={mockEvent} guests={[]} error={new Error('offline')} onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar datos' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Las demás opciones de configuración siguen disponibles.')
    expect(retry).toHaveBeenCalledOnce()
  })

  it('includes blank RSVP status guests as pending when catalog status is pending', async () => {
    const { EventSharePanel } = await import('@/components/events/event-share-panel')

    render(
      <EventSharePanel
        event={mockEvent}
        guests={[
          guest({ rsvp_status: ' ', status: status('PENDING') }),
          guest({ id: 'guest-002', rsvp_status: 'CONFIRMED', email: 'confirmed@example.com' }),
        ]}
      />
    )

    expect(screen.getByText('RSVP de Ana')).toBeInTheDocument()
    expect(screen.getByText('1 pendientes con correo')).toBeInTheDocument()
  })
})
