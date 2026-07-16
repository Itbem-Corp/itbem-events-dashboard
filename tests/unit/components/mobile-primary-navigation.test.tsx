import { MobilePrimaryNavigation } from '@/components/mobile-primary-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('MobilePrimaryNavigation', () => {
  it('keeps regular accounts focused on their two primary routes', () => {
    render(<MobilePrimaryNavigation pathname="/events" isRoot={false} modules={['home', 'events']} onIntent={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Eventos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('exposes root workspaces and preloads them from pointer intent', () => {
    const onIntent = vi.fn()
    render(<MobilePrimaryNavigation pathname="/" isRoot modules={['home', 'events', 'users', 'organizations']} onIntent={onIntent} />)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    const clients = screen.getByRole('link', { name: 'Clientes' })
    fireEvent.pointerEnter(clients)
    expect(onIntent).toHaveBeenCalledWith('/clients')
  })

  it('does not expose global administration for an operational tenant', () => {
    render(<MobilePrimaryNavigation pathname="/" isRoot modules={['home', 'events']} onIntent={vi.fn()} />)

    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument()
  })
})
