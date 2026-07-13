import HomeLoading from '@/app/(app)/loading'
import EventDetailLoading from '@/app/(app)/events/[id]/loading'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('route loading skeletons', () => {
  it('preserves the dashboard operations-center geometry', () => {
    const { container } = render(<HomeLoading />)

    expect(screen.getByRole('status', { name: 'Cargando centro de operaciones' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.querySelectorAll('aside')).toHaveLength(1)
  })

  it('preserves event header, workspace tabs and summary cards', () => {
    const { container } = render(<EventDetailLoading />)

    expect(screen.getByRole('status', { name: 'Cargando centro de operación' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.lg\\:grid-cols-4 > div')).toHaveLength(4)
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
  })
})
