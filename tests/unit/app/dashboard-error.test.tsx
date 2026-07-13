import DashboardError from '@/app/(app)/error'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('DashboardError', () => {
  it('offers an in-place retry without exposing the exception message', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('internal secret'), { digest: 'route-123' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<DashboardError error={error} reset={reset} />)

    expect(screen.queryByText('internal secret')).not.toBeInTheDocument()
    expect(screen.getByText('Referencia route-123')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reset).toHaveBeenCalledOnce()

    consoleError.mockRestore()
  })
})
