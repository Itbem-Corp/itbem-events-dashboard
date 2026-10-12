import { MobilePrimaryNavigation, mobilePrimaryNavigationItems } from '@/components/mobile-primary-navigation'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('MobilePrimaryNavigation', () => {
  it('keeps regular accounts focused on their two primary routes', () => {
    render(<MobilePrimaryNavigation pathname="/events" showEvents showMetrics={false} showTeam={false} showUsers={false} showOrganizations={false} showAutomation={false} onIntent={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Eventos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('exposes root workspaces and preloads them from pointer intent', () => {
    const onIntent = vi.fn()
    render(<MobilePrimaryNavigation pathname="/" showEvents showMetrics={false} showTeam={false} showUsers showOrganizations showAutomation={false} onIntent={onIntent} />)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    const clients = screen.getByRole('link', { name: 'Clientes' })
    fireEvent.pointerEnter(clients)
    expect(onIntent).toHaveBeenCalledWith('/clients')
  })

  it('keeps multitenant administration available for the ITBEM workspace', () => {
    render(<MobilePrimaryNavigation pathname="/" tenantCode="itbem" showEvents={false} showMetrics showTeam={false} showUsers showOrganizations showAutomation={false} onIntent={vi.fn()} />)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Métricas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Organizaciones' })).toBeInTheDocument()
  })

  it('shows the automation control center only when the capability is available', () => {
    const onIntent = vi.fn()
    render(<MobilePrimaryNavigation pathname="/automation" showEvents={false} showMetrics={false} showTeam={false} showUsers={false} showOrganizations={false} showAutomation onIntent={onIntent} />)

    const automation = screen.getByRole('link', { name: 'Centro de automatización' })
    expect(automation).toHaveAttribute('aria-current', 'page')
    fireEvent.pointerEnter(automation)
    expect(onIntent).toHaveBeenCalledWith('/automation')
  })
})

describe('MobilePrimaryNavigation per product shell', () => {
  const memberFlags = {
    showHome: false,
    showEvents: true,
    showMetrics: false,
    showTeam: false,
    showUsers: false,
    showOrganizations: false,
    showAutomation: false,
  }

  it('hides the EventiApp bar when only the event list remains', () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <MobilePrimaryNavigation pathname="/events" eventsLabel="Mis eventos" {...memberFlags} onIntent={vi.fn()} />
      </ProductProvider>
    )

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(mobilePrimaryNavigationItems(memberFlags)).toHaveLength(1)
  })

  it('labels the EventiApp bar for assistive technology and uses 12px text', () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <MobilePrimaryNavigation
          pathname="/events"
          eventsLabel="Mis eventos"
          {...memberFlags}
          showHome
          onIntent={vi.fn()}
        />
      </ProductProvider>
    )

    const navigation = screen.getByRole('navigation', { name: 'Navegación inferior' })
    const events = screen.getByRole('link', { name: 'Mis eventos' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(2)
    expect(events).toHaveClass('text-xs')
    expect(events.className).not.toContain('text-[10px]')
  })

  it('keeps Cafetton House classes and label exactly as before', () => {
    // Generated from the component at 94f16b8 (before the shell policy).
    const { container } = render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <MobilePrimaryNavigation
          pathname="/"
          tenantCode="cafettonhouse"
          showEvents={false}
          showMetrics
          showTeam
          showUsers={false}
          showOrganizations={false}
          showAutomation={false}
          onIntent={vi.fn()}
        />
      </ProductProvider>
    )

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('still renders a single-item bar for Cafetton House, as before', () => {
    render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <MobilePrimaryNavigation pathname="/" {...memberFlags} showHome showEvents={false} onIntent={vi.fn()} />
      </ProductProvider>
    )

    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).getElementsByTagName('a')).toHaveLength(1)
  })
})
