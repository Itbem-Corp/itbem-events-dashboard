import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function MaybeBroken({ broken }: { broken: boolean }) {
  if (broken) throw new Error('render failed')
  return <p>Evento recuperado</p>
}

describe('EventErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries through the Next router and recovers without reloading the document', async () => {
    const { EventErrorBoundary } = await import('@/components/events/event-error-boundary')
    const onRetry = vi.fn()
    const { rerender } = render(
      <EventErrorBoundary eventId="event-1" onRetry={onRetry}>
        <MaybeBroken broken />
      </EventErrorBoundary>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/mostrar este evento/i)

    rerender(
      <EventErrorBoundary eventId="event-1" onRetry={onRetry}>
        <MaybeBroken broken={false} />
      </EventErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByText('Evento recuperado')).toBeInTheDocument()
  })
})
