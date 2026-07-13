import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string) {
  return readFileSync(resolve(process.cwd(), 'src/components/events', file), 'utf8')
}

describe('invitation and RSVP render performance contracts', () => {
  it('bounds invitation rows and defers full-collection search', () => {
    const invitations = source('invitation-tracker.tsx')
    expect(invitations).toContain('const INVITATIONS_PAGE_SIZE = 25')
    expect(invitations).toContain('const debouncedSearch = useDebounce(search, 200)')
    expect(invitations).toContain('visibleGuests.map((guest, i)')
    expect(invitations).not.toContain('filteredGuests.map((guest, i)')
    expect(invitations).toContain('eventInvitationsPagePath(event.id')
    expect(invitations).toContain('guestsPage?.share_summary ?? null')
    expect(invitations).not.toContain('eventGuestShareSummaryPath(event.id)')
    expect(invitations).toContain('eventGuestsExportPath(event.id')
    expect(invitations).toContain("view: 'invitations'")
    expect(invitations).toContain("{ responseType: 'blob' }")
    expect(invitations).toContain("'CSV completo'")
    expect(invitations).not.toContain('exportInvitationsCSV(visibleGuests')
    expect(invitations).toContain('keepPreviousData: true')
    expect(invitations).toContain('delay: Math.min(index, 6) * 0.015')
    expect(invitations).not.toContain('guests: Guest[]\n  isLoading: boolean')
  })

  it('updates a selected guest page through one bulk status request', () => {
    const guests = source('event-detail-guests-panel.tsx')
    const handler = guests.slice(guests.indexOf('const bulkUpdateStatus'), guests.indexOf('const bulkDeleteGuests'))
    expect(handler).toContain('await api.patch(bulkGuestStatusPath()')
    expect(handler).toContain('const selectedGuestIds = Array.from(selectedIds)')
    expect(handler).toContain('ids: selectedGuestIds')
    expect(handler).not.toContain('selectedGuests.map')
    expect(handler).not.toContain('api.put(guestPath')
    expect(handler).not.toContain('Promise.all')
  })

  it('mounts only one bounded responsive RSVP layout', () => {
    const rsvp = source('rsvp-tracker.tsx')
    expect(rsvp).toContain('const RSVP_PAGE_SIZE = 50')
    expect(rsvp).toContain("const isDesktop = useMediaQuery('(min-width: 640px)')")
    expect(rsvp).toContain('data-rsvp-layout="mobile"')
    expect(rsvp).toContain('data-rsvp-layout="desktop"')
    expect(rsvp.match(/visibleGuests\.map\(\(guest\)/g)).toHaveLength(2)
    expect(rsvp).not.toContain('filteredGuests.map((guest)')
    expect(rsvp).toContain('eventGuestsPagePath(eventId')
    expect(rsvp).toContain('eventGuestsExportPath(eventId')
    expect(rsvp).toContain("view: 'rsvp'")
    expect(rsvp).toContain("{ responseType: 'blob' }")
    expect(rsvp).toContain("'CSV completo'")
    expect(rsvp).not.toContain('exportRsvpCSV(visibleGuests')
    expect(rsvp).toContain('keepPreviousData: true')
    expect(rsvp).not.toContain('isLoading: boolean')
  })

  it('bounds sortable guests in the unassigned seating tray', () => {
    const unassigned = source('seating/unassigned-panel.tsx')
    expect(unassigned).toContain('const UNASSIGNED_PAGE_SIZE = 30')
    expect(unassigned).toContain('const deferredSearch = useDeferredValue(search)')
    expect(unassigned).toContain('const guestIds = visibleGuests.map(')
    expect(unassigned).toContain('visibleGuests.map((g)')
    expect(unassigned).not.toContain('filtered.map((g)')
  })

  it('saves the seating workspace through one transactional request', () => {
    const seating = source('seating/seating-plan-v2.tsx')
    const saveHandler = seating.slice(seating.indexOf('const handleSave'), seating.indexOf('const handleAutoAssign'))
    expect(saveHandler).toContain('const res = await api.put(eventTablesPlanPath(eventId)')
    expect(saveHandler).toContain('created: seating.state.createdTables.map')
    expect(saveHandler).toContain('deleted_ids: Array.from(seating.state.deletedTableIds)')
    expect(saveHandler).not.toContain('api.post<EventTableResponse>')
    expect(saveHandler).not.toContain('eventTablesAssignPath')
    expect(saveHandler).not.toContain('api.delete(tablePath')
    expect(seating).toContain('eventSeatingWorkspacePath(eventId)')
    expect(saveHandler).toContain('await mutateWorkspace(savedWorkspace, { revalidate: false })')
    expect(saveHandler).toContain('void mutateWorkspace()')
    expect(seating).not.toContain('Promise.all([mutateTables(), mutateGuests()])')
  })

  it('keeps the moments notes view inside the progressive render window', () => {
    const moments = source('moments-wall.tsx')
    const notesView = moments.slice(moments.indexOf('/* Notes list view */'), moments.indexOf('/* Grouped view */'))
    expect(notesView).toContain('visibleMoments.map((moment)')
    expect(notesView).not.toContain('filteredMoments.map((moment)')
  })

  it('defers legacy video frame extraction until its moment card is near the viewport', () => {
    const moments = source('moments-wall.tsx')
    expect(moments).toContain('useVideoThumbnail(visible && video && !thumbnailUrl ? url : null)')
    expect(moments).not.toContain('useVideoThumbnail(video && !thumbnailUrl ? url : null)')
  })

  it('keeps drag-and-drop libraries outside the default moments bundle', () => {
    const moments = source('moments-wall.tsx')
    expect(moments).toContain("import('@/components/events/moment-drag-grid')")
    expect(moments).not.toContain("from '@dnd-kit/")
  })

  it('bounds every auxiliary moments status tray', () => {
    const moments = source('moments-wall.tsx')
    expect(moments).toContain('const STATUS_SECTION_PAGE = 24')
    expect(moments.match(/const visibleMoments = moments\.slice\(0, visibleCount\)/g)).toHaveLength(3)
    expect(moments.match(/visibleMoments\.map\(\(m\)/g)).toHaveLength(3)
  })

  it('limits concurrent media downloads while generating a ZIP', () => {
    const moments = source('moments-wall.tsx')
    const zipHandler = moments.slice(moments.indexOf('const handleDownloadZip'), moments.indexOf('const [selectMode'))
    expect(zipHandler).toContain('mapSettledWithConcurrency(approved, 4')
    expect(zipHandler).toContain('if (!response.ok)')
    expect(zipHandler).not.toContain('await Promise.all(')
  })
})
