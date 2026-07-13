import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'

describe('StaleDataNotice', () => {
  it('keeps the cached-data message visible and retries on demand', () => {
    const onRetry = vi.fn()
    render(<StaleDataNotice label="eventos" onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados mientras recuperamos eventos')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('communicates and disables an active retry', () => {
    render(<StaleDataNotice label="usuarios" onRetry={vi.fn()} retrying />)
    const button = screen.getByRole('button', { name: 'Actualizando…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
