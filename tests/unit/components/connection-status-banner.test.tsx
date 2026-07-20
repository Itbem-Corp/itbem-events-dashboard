import { ConnectionStatusBanner } from '@/components/ui/connection-status-banner'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ online: true }))

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mocks.online,
}))

describe('ConnectionStatusBanner', () => {
  beforeEach(() => {
    mocks.online = true
  })

  it('stays out of the layout during a normal online session', () => {
    render(<ConnectionStatusBanner />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains that loaded data remains available while offline', () => {
    mocks.online = false
    render(<ConnectionStatusBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Puedes seguir consultando')
  })

  it('briefly confirms recovery after an offline period', () => {
    vi.useFakeTimers()
    mocks.online = false
    const { rerender } = render(<ConnectionStatusBanner />)

    mocks.online = true
    rerender(<ConnectionStatusBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Conexión recuperada')

    act(() => vi.advanceTimersByTime(2800))
    expect(screen.queryByRole('status')).toBeNull()
    vi.useRealTimers()
  })
})
