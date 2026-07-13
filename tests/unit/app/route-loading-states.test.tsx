import ClientsLoading from '@/app/(app)/clients/loading'
import EventsLoading from '@/app/(app)/events/loading'
import UsersLoading from '@/app/(app)/users/loading'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('dashboard route loading states', () => {
  it.each([
    [EventsLoading, 'Cargando portafolio de eventos'],
    [ClientsLoading, 'Cargando organizaciones'],
    [UsersLoading, 'Cargando equipo y accesos'],
  ] as const)('announces a stable route skeleton', (LoadingState, label) => {
    render(<LoadingState />)
    const status = screen.getByRole('status', { name: label })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('.skeleton').length).toBeGreaterThan(10)
  })
})
