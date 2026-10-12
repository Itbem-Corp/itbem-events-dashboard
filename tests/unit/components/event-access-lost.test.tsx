import { EventAccessLost } from '@/components/events/event-capability-error'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('EventAccessLost', () => {
  it('explains the lost access and links back to the events list', () => {
    render(<EventAccessLost eventsLabel="Mis eventos" />)
    expect(screen.getByRole('heading', { name: 'Ya no tienes acceso a este evento' })).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Volver a Mis eventos' })
    expect(link.getAttribute('href')).toBe('/events')
  })
})
