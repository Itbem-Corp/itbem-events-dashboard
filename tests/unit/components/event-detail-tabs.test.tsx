import { EVENT_DETAIL_TAB_IDS } from '@/components/events/event-detail-tab-state'
import { EventDetailTabs, type EventDetailTabId } from '@/components/events/event-detail-tabs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

function EventDetailTabsHarness({ onTabIntent }: { onTabIntent: (tab: EventDetailTabId) => void }) {
  const [activeTab, setActiveTab] = useState<EventDetailTabId>('resumen')

  return (
    <EventDetailTabs
      activeTab={activeTab}
      availableTabs={EVENT_DETAIL_TAB_IDS}
      guestCount={24}
      pendingInvitationCount={5}
      onTabChange={setActiveTab}
      onTabIntent={onTabIntent}
    />
  )
}

describe('EventDetailTabs', () => {
  it('exposes linked ARIA tabs and preloads a panel on intent without activating it', () => {
    const onTabIntent = vi.fn()
    render(<EventDetailTabsHarness onTabIntent={onTabIntent} />)

    const summaryTab = screen.getByRole('tab', { name: 'Resumen' })
    const guestsTab = screen.getByRole('tab', { name: /Invitados/ })

    expect(screen.getByRole('tablist', { name: 'Secciones del evento' })).toBeInTheDocument()
    expect(summaryTab).toHaveAttribute('aria-selected', 'true')
    expect(summaryTab).toHaveAttribute('tabindex', '0')
    expect(guestsTab).toHaveAttribute('aria-controls', 'event-panel-invitados')
    expect(guestsTab).toHaveAttribute('tabindex', '-1')
    expect(onTabIntent).not.toHaveBeenCalled()

    fireEvent.pointerEnter(guestsTab)

    expect(onTabIntent).toHaveBeenCalledWith('invitados')
    expect(guestsTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(guestsTab)

    expect(guestsTab).toHaveAttribute('aria-selected', 'true')
    expect(guestsTab).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('supports arrows, Home and End with automatic activation and roving focus', () => {
    const onTabIntent = vi.fn()
    render(<EventDetailTabsHarness onTabIntent={onTabIntent} />)

    const summaryTab = screen.getByRole('tab', { name: 'Resumen' })
    const guestsTab = screen.getByRole('tab', { name: /Invitados/ })
    const settingsTab = screen.getByRole('tab', { name: 'Configuración' })

    summaryTab.focus()
    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' })
    expect(guestsTab).toHaveFocus()
    expect(guestsTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(guestsTab, { key: 'End' })
    expect(settingsTab).toHaveFocus()
    expect(settingsTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(settingsTab, { key: 'Home' })
    expect(summaryTab).toHaveFocus()
    expect(summaryTab).toHaveAttribute('aria-selected', 'true')
    expect(onTabIntent).toHaveBeenCalledWith('configuracion')
  })

  it('only exposes workspaces that the current event capability allows', () => {
    const onTabIntent = vi.fn()
    render(
      <EventDetailTabs
        activeTab="resumen"
        availableTabs={['resumen', 'momentos', 'analiticas']}
        onTabChange={vi.fn()}
        onTabIntent={onTabIntent}
      />
    )

    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Momentos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Analíticas' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Invitados/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('reveals an active tab that is outside the horizontal viewport without moving the page', async () => {
    const scrollTo = vi.fn()
    const previousScrollTo = HTMLElement.prototype.scrollTo
    HTMLElement.prototype.scrollTo = scrollTo
    const onTabIntent = vi.fn()
    render(<EventDetailTabsHarness onTabIntent={onTabIntent} />)

    const tabList = screen.getByRole('tablist', { name: 'Secciones del evento' })
    const settingsTab = screen.getByRole('tab', { name: 'Configuración' })
    Object.defineProperty(tabList, 'scrollLeft', { configurable: true, value: 0 })
    vi.spyOn(tabList, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 320,
      top: 0,
      bottom: 48,
      width: 320,
      height: 48,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(settingsTab, 'getBoundingClientRect').mockReturnValue({
      left: 620,
      right: 720,
      top: 0,
      bottom: 40,
      width: 100,
      height: 40,
      x: 620,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.click(settingsTab)

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ left: 408, behavior: 'smooth' }))
    HTMLElement.prototype.scrollTo = previousScrollTo
  })
})
