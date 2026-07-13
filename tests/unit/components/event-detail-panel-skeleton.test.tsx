import { EventDetailPanelSkeleton } from '@/components/events/event-detail-panel-skeleton'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('EventDetailPanelSkeleton', () => {
  it.each([
    ['invitados', 'Cargando invitados…'],
    ['invitaciones', 'Cargando invitaciones…'],
    ['asientos', 'Cargando mesas…'],
    ['rsvp', 'Cargando RSVP…'],
    ['momentos', 'Cargando momentos…'],
    ['analiticas', 'Cargando analíticas…'],
    ['configuracion', 'Cargando configuración…'],
  ] as const)('announces %s while its async chunk loads', (tab, announcement) => {
    const { container } = render(<EventDetailPanelSkeleton tab={tab} />)

    expect(screen.getByRole('status')).toHaveTextContent(announcement)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.motion-reduce\\:animate-none')).toBeInTheDocument()
  })
})
