import type { EventDetailTabId } from '@/components/events/event-detail-tabs'
import { useEventDetailGuestData } from '@/hooks/useEventDetailGuestData'
import { eventGuestSummaryPath, eventGuestsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { requestPathFromKey } from '@/lib/request-context'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 2_000 }}>{children}</SWRConfig>
}

describe('useEventDetailGuestData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetcher).mockImplementation(async (key) => {
      const path = requestPathFromKey(key)
      if (path === eventGuestSummaryPath('event-1')) {
        return { total: 2, confirmed: 1, pending: 1, declined: 0, total_attendees: 3 }
      }
      if (path === eventGuestsPath('event-1')) return [{ id: 'guest-1' }]
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('keeps the workspace summary compact across guest tabs', async () => {
    const initialSummary = { total: 2, confirmed: 1, pending: 1, declined: 0, total_attendees: 3 }
    const { result, rerender } = renderHook(
      ({ tab }: { tab: EventDetailTabId }) => useEventDetailGuestData('event-1', tab, true, initialSummary),
      {
        initialProps: { tab: 'resumen' as EventDetailTabId },
        wrapper,
      }
    )

    await waitFor(() => expect(result.current.summary?.total).toBe(2))
    expect(vi.mocked(fetcher).mock.calls.filter(([path]) => path === eventGuestSummaryPath('event-1'))).toHaveLength(0)
    expect(vi.mocked(fetcher).mock.calls.filter(([path]) => path === eventGuestsPath('event-1'))).toHaveLength(0)

    rerender({ tab: 'invitaciones' })

    await waitFor(() => expect(result.current.summary?.total).toBe(2))
    expect(vi.mocked(fetcher).mock.calls.filter(([path]) => path === eventGuestsPath('event-1'))).toHaveLength(0)
  })

  it('waits for the composed detail and uses the compact fallback only when the embedded summary is absent', async () => {
    const embedded = { total: 4, confirmed: 2, pending: 2, declined: 0, total_attendees: 5 }
    const { result, rerender } = renderHook(
      ({ summary }: { summary?: typeof embedded | null }) => useEventDetailGuestData('event-1', 'resumen', true, summary),
      { initialProps: { summary: undefined as typeof embedded | null | undefined }, wrapper }
    )

    expect(result.current.summary).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()

    rerender({ summary: null })
    await waitFor(() => expect(result.current.summary?.total).toBe(2))
    expect(fetcher).toHaveBeenCalledWith(eventGuestSummaryPath('event-1'))
  })
})
