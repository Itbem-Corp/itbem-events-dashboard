import { MobilePrimaryNavigation } from '@/components/mobile-primary-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('MobilePrimaryNavigation', () => {
  it('keeps regular accounts focused on their two primary routes', () => {
    render(<MobilePrimaryNavigation pathname="/events" showEvents showMetrics={false} showTeam={false} showUsers={false} showOrganizations={false} onIntent={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Eventos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('exposes root workspaces and preloads them from pointer intent', () => {
    const onIntent = vi.fn()
    render(<MobilePrimaryNavigation pathname="/" showEvents showMetrics={false} showTeam={false} showUsers showOrganizations onIntent={onIntent} />)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    const clients = screen.getByRole('link', { name: 'Clientes' })
    fireEvent.pointerEnter(clients)
    expect(onIntent).toHaveBeenCalledWith('/clients')
  })

  it('keeps multitenant administration available for the ITBEM workspace', () => {
    render(<MobilePrimaryNavigation pathname="/" showEvents={false} showMetrics showTeam={false} showUsers showOrganizations onIntent={vi.fn()} />)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Métricas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeInTheDocument()
  })
})
