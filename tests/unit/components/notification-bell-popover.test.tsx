import { NotificationBell } from '@/components/ui/notification-bell'
import { useStore } from '@/store/useStore'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('swr', () => ({
  default: () => ({ data: [], error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }),
  preload: () => Promise.resolve(),
  mutate: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: vi.fn() }) }))

describe('NotificationBell popover', () => {
  beforeEach(() => {
    useStore.setState({ currentClient: { id: 'client-1', name: 'Cliente', code: 'C1', client_type: { code: 'CUSTOMER' } } })
  })

  it('renders an accessible panel in <body>, outside the clipping sidebar', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <NotificationBell />
      </div>
    )
    const button = screen.getByRole('button', { name: 'Notificaciones' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(button)

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', panel.id)
    expect(container.contains(panel)).toBe(false)
    expect(panel.style.position).toBe('fixed')
    expect(panel).toHaveFocus()
  })

  it('closes on Escape and returns focus to the bell', () => {
    render(<NotificationBell />)
    const button = screen.getByRole('button', { name: 'Notificaciones' })
    fireEvent.click(button)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes on an outside press but not on a press inside the panel', () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))

    fireEvent.pointerDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps keyboard focus where it is when the page scrolls or resizes, and refocuses on reopen', () => {
    render(<NotificationBell />)
    const button = screen.getByRole('button', { name: 'Notificaciones' })
    fireEvent.click(button)
    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(panel).toHaveFocus()

    const link = within(panel).getAllByRole('link')[0]!
    link.focus()
    expect(link).toHaveFocus()

    act(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
    })
    expect(link).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toHaveFocus()
  })
})
