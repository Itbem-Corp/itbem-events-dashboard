import { NotificationBell } from '@/components/ui/notification-bell'
import { useStore } from '@/store/useStore'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function daysFromNow(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

const events = [
  { id: 'today', name: 'Boda hoy', event_date_time: daysFromNow(0) },
  { id: 'soon', name: 'Fiesta pronto', event_date_time: daysFromNow(2) },
  { id: 'past', name: 'Cena pasada', event_date_time: daysFromNow(-2) },
]

vi.mock('swr', () => ({
  default: () => ({ data: events, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }),
  preload: () => Promise.resolve(),
  mutate: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: vi.fn() }) }))

describe('NotificationBell count (ROLES-115)', () => {
  beforeEach(() => {
    useStore.setState({ currentClient: { id: 'client-1', name: 'Cliente', code: 'C1', client_type: { code: 'CUSTOMER' } } })
  })

  it('counts only active items and lists finished events under their own heading', () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })

    expect(within(panel).getByText('2 activas')).toBeInTheDocument()
    const heading = within(panel).getByText('Terminados recientemente')
    const links = within(panel).getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/events/'))
    expect(links).toHaveLength(3)
    // Both active items come before the heading, the finished one after it.
    expect(heading.compareDocumentPosition(links[1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(heading.compareDocumentPosition(links[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
