import { EventGuestCollectionBoundary } from '@/components/events/event-guest-collection-boundary'
import { EventGuestSummary } from '@/components/events/event-guest-summary'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('event guest async states', () => {
  it('renders summary metrics without depending on the guest collection', () => {
    render(
      <EventGuestSummary
        summary={{ total: 8, confirmed: 4, pending: 3, declined: 1, total_attendees: 6 }}
        isLoading={false}
        onRetry={vi.fn()}
        onOpenGuests={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Resumen de invitados' })).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('retries only the summary after an isolated summary error', () => {
    const retry = vi.fn()
    render(
      <EventGuestSummary
        summary={null}
        isLoading={false}
        error={new Error('offline')}
        onRetry={retry}
        onOpenGuests={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar resumen' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('El resto del evento sigue disponible.')
  })

  it('keeps a failed full collection inside the active panel boundary', () => {
    const retry = vi.fn()
    render(
      <EventGuestCollectionBoundary tab="invitados" isLoading={false} error={new Error('offline')} onRetry={retry}>
        <div>Guest rows</div>
      </EventGuestCollectionBoundary>
    )

    expect(screen.queryByText('Guest rows')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar panel' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
