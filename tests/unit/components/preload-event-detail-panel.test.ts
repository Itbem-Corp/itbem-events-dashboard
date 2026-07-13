import {
  eventDetailDataPreloaders,
  eventDetailPanelLoaders,
  preloadEventDetailPanel,
} from '@/components/events/preload-event-detail-panel'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preloadEventDetailPanel', () => {
  it('does not request another chunk for the initial summary', async () => {
    const guestsLoader = vi.spyOn(eventDetailPanelLoaders, 'invitados').mockResolvedValue({})
    const settingsLoader = vi.spyOn(eventDetailPanelLoaders, 'configuracion').mockResolvedValue({})
    const guestsPreloader = vi.spyOn(eventDetailDataPreloaders, 'guestPage').mockResolvedValue([])

    await preloadEventDetailPanel('resumen', 'event-1')

    expect(guestsLoader).not.toHaveBeenCalled()
    expect(settingsLoader).not.toHaveBeenCalled()
    expect(guestsPreloader).not.toHaveBeenCalled()
  })

  it('preloads the panel chunk and its guest data on explicit user intent', async () => {
    const guestsLoader = vi.spyOn(eventDetailPanelLoaders, 'invitados').mockResolvedValue({})
    const settingsLoader = vi.spyOn(eventDetailPanelLoaders, 'configuracion').mockResolvedValue({})
    const guestsPreloader = vi.spyOn(eventDetailDataPreloaders, 'guestPage').mockResolvedValue([])

    await preloadEventDetailPanel('invitados', 'event-1')

    expect(guestsLoader).toHaveBeenCalledOnce()
    expect(settingsLoader).not.toHaveBeenCalled()
    expect(guestsPreloader).toHaveBeenCalledOnce()
    expect(guestsPreloader).toHaveBeenCalledWith('event-1')
  })

  it('preloads only the first RSVP page instead of the full guest collection', async () => {
    const rsvpLoader = vi.spyOn(eventDetailPanelLoaders, 'rsvp').mockResolvedValue({})
    const pagePreloader = vi.spyOn(eventDetailDataPreloaders, 'guestPage').mockResolvedValue([])

    await preloadEventDetailPanel('rsvp', 'event-1')

    expect(rsvpLoader).toHaveBeenCalledOnce()
    expect(pagePreloader).toHaveBeenCalledWith('event-1')
  })

  it.each(['invitados', 'rsvp'] as const)('reuses the cached guest page for %s', async (tab) => {
    const panelLoader = vi.spyOn(eventDetailPanelLoaders, tab).mockResolvedValue({})
    const pagePreloader = vi.spyOn(eventDetailDataPreloaders, 'guestPage').mockResolvedValue([])

    await preloadEventDetailPanel(tab, 'event-1', { guestDataCached: true })

    expect(panelLoader).toHaveBeenCalledOnce()
    expect(pagePreloader).not.toHaveBeenCalled()
  })

  it('preloads only moments code because configuration is embedded in event detail', async () => {
    const momentsLoader = vi.spyOn(eventDetailPanelLoaders, 'momentos').mockResolvedValue({})

    await preloadEventDetailPanel('momentos', 'event-1')

    expect(momentsLoader).toHaveBeenCalledOnce()
  })

  it('preloads compact seating guests and tables before the panel opens', async () => {
    const seatingLoader = vi.spyOn(eventDetailPanelLoaders, 'asientos').mockResolvedValue({})
    const workspacePreloader = vi.spyOn(eventDetailDataPreloaders, 'seatingWorkspace').mockResolvedValue({})

    await preloadEventDetailPanel('asientos', 'event-1')

    expect(seatingLoader).toHaveBeenCalledOnce()
    expect(workspacePreloader).toHaveBeenCalledWith('event-1')
  })

  it('preloads the compact analytics contract without loading full guests', async () => {
    const analyticsLoader = vi.spyOn(eventDetailPanelLoaders, 'analiticas').mockResolvedValue({})
    const analyticsPreloader = vi.spyOn(eventDetailDataPreloaders, 'analytics').mockResolvedValue([{}, {}])

    await preloadEventDetailPanel('analiticas', 'event-1')

    expect(analyticsLoader).toHaveBeenCalledOnce()
    expect(analyticsPreloader).toHaveBeenCalledWith('event-1')
  })

  it('preloads compact invitation data even when a legacy full collection is cached', async () => {
    const invitationsLoader = vi.spyOn(eventDetailPanelLoaders, 'invitaciones').mockResolvedValue({})
    const pagePreloader = vi.spyOn(eventDetailDataPreloaders, 'guestPage').mockResolvedValue([])
    const invitationsPreloader = vi.spyOn(eventDetailDataPreloaders, 'invitationsPage').mockResolvedValue([])
    const sharePreloader = vi.spyOn(eventDetailDataPreloaders, 'share').mockResolvedValue({})

    await preloadEventDetailPanel('invitaciones', 'event-1', { guestDataCached: true })

    expect(invitationsLoader).toHaveBeenCalledOnce()
    expect(invitationsPreloader).toHaveBeenCalledWith('event-1')
    expect(pagePreloader).not.toHaveBeenCalled()
    expect(sharePreloader).not.toHaveBeenCalled()
  })

  it('preloads only settings code because config and share summary are embedded', async () => {
    const settingsLoader = vi.spyOn(eventDetailPanelLoaders, 'configuracion').mockResolvedValue({})
    const sharePreloader = vi.spyOn(eventDetailDataPreloaders, 'share').mockResolvedValue({})

    await preloadEventDetailPanel('configuracion', 'event-1')

    expect(settingsLoader).toHaveBeenCalledOnce()
    expect(sharePreloader).not.toHaveBeenCalled()
  })
})
