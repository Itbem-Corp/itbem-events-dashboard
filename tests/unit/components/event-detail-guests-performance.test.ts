import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/events/event-detail-guests-panel.tsx'), 'utf8')
const pageSource = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')

describe('event guest list performance contracts', () => {
  it('delegates debounced filtering and bounded pagination to the backend', () => {
    expect(source).toContain('const debouncedSearch = useDebounce(viewState.search, 200)')
    expect(source).toContain('eventGuestsPagePath(event.id, {')
    expect(source).toContain('page_size: GUEST_PAGE_SIZE')
    expect(source).toContain('keepPreviousData: true')
    expect(source).not.toContain('filteredGuests')
  })

  it('mounts only one responsive guest layout', () => {
    expect(source).toContain("const isDesktop = useMediaQuery('(min-width: 640px)')")
    expect(source).toContain('{!isDesktop ? (')
    expect(source).toContain('data-guest-layout="mobile"')
    expect(source).toContain('data-guest-layout="desktop"')
    expect(source).toContain('delay: Math.min(index, 6) * 0.015')
  })

  it('updates bulk guest status without per-row lookups or requests', () => {
    expect(source).toContain('await api.patch(bulkGuestStatusPath()')
    expect(source).toContain('const selectedGuestIds = Array.from(selectedIds)')
    expect(source).toContain('ids: selectedGuestIds')
    expect(source).not.toContain('const guestsById = useMemo(() => new Map(')
    expect(source).not.toContain('selectedGuests.map(')
  })

  it('keeps an authoritative saved guest in cache without refetching the page', () => {
    const handler = source.slice(source.indexOf('const saveGuestInCurrentPage'), source.indexOf('const removeGuestFromCurrentPage'))
    expect(handler).toContain('upsertGuestCacheValue(current ?? rawGuests, savedGuest)')
    expect(handler).toContain('{ revalidate: false }')
    expect(handler).not.toContain('void retryGuests()\n    },')
  })

  it('refreshes the guest summary without refetching the complete event detail', () => {
    const handler = pageSource.slice(
      pageSource.indexOf('const handleGuestCollectionChanged'),
      pageSource.indexOf('// Self-healing:')
    )
    expect(handler).toContain('mutate(eventGuestSummaryPath(event.id))')
    expect(handler).not.toContain('mutateEvent()')
  })
})
