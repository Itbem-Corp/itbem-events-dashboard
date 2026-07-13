import { StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useStoreHydrationMock = vi.fn(() => false)

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => useStoreHydrationMock(),
}))

describe('StoreHydrationBoundary', () => {
  it('keeps false route states hidden until persisted context is ready', () => {
    const { rerender } = render(
      <StoreHydrationBoundary>
        <p>Contenido autenticado</p>
      </StoreHydrationBoundary>
    )

    expect(screen.getByRole('status', { name: 'Preparando dashboard' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido autenticado')).not.toBeInTheDocument()

    useStoreHydrationMock.mockReturnValue(true)
    rerender(
      <StoreHydrationBoundary>
        <p>Contenido autenticado</p>
      </StoreHydrationBoundary>
    )

    expect(screen.getByText('Contenido autenticado')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Preparando dashboard' })).not.toBeInTheDocument()
  })
})
