import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioSections } from '@/components/studio/use-studio-sections'
import { api } from '@/lib/api'
import { removeEventSectionCacheValue, upsertEventSectionCacheValue } from '@/lib/event-section-cache'
import { useEventSectionsSWR } from '@/lib/event-sections-swr'
import { fetcher } from '@/lib/fetcher'
import type { EventSection } from '@/models/EventSection'

vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn(),
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function section(id: string, order: number): EventSection {
  return {
    id,
    event_id: 'event-1',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    name: `Sección ${id}`,
    component_type: 'TextBlock',
    order,
    is_visible: true,
    config: { title: id },
  }
}

const initial = Array.from({ length: 17 }, (_, index) => section(`s-${index + 1}`, index + 1))

// A fresh SWR cache per test, as on a real page load: the list only exists as fallbackData.
function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

describe('useEventSectionsSWR with workspace fallback data (STU-10 / STU-38)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fetch on mount when the workspace already brought the list', () => {
    renderHook(() => useEventSectionsSWR('event-1', initial), { wrapper })
    expect(vi.mocked(fetcher)).not.toHaveBeenCalled()
  })

  it('keeps every section after upserting one into an empty SWR cache', async () => {
    const { result } = renderHook(() => useEventSectionsSWR('event-1', initial), { wrapper })

    await act(async () => {
      await result.current.mutate(
        (current) => upsertEventSectionCacheValue(current, { ...initial[4], config: { title: 'Editada' } }) as EventSection[],
        false
      )
    })

    expect(result.current.data).toHaveLength(17)
    expect(result.current.data?.[4].config).toEqual({ title: 'Editada' })
  })

  it('adds a new section to the full list, not to an empty one', async () => {
    const { result } = renderHook(() => useEventSectionsSWR('event-1', initial), { wrapper })

    await act(async () => {
      await result.current.mutate(
        (current) => upsertEventSectionCacheValue(current, section('s-18', 18)) as EventSection[],
        false
      )
    })
    expect(result.current.data).toHaveLength(18)

    await act(async () => {
      await result.current.mutate((current) => removeEventSectionCacheValue(current, 's-18') as EventSection[], false)
    })
    expect(result.current.data).toHaveLength(17)
  })

  it('removes one section and keeps the rest', async () => {
    const { result } = renderHook(() => useEventSectionsSWR('event-1', initial), { wrapper })

    await act(async () => {
      await result.current.mutate((current) => removeEventSectionCacheValue(current, 's-3') as EventSection[], false)
    })

    expect(result.current.data).toHaveLength(16)
    expect(result.current.data?.some((item) => item.id === 's-3')).toBe(false)
  })
})

describe('useStudioSections autosave with workspace fallback data (STU-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the whole Studio list after a config autosave', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { ...initial[1], config: { title: 'Nuevo título' } } })
    const { result } = renderHook(() => useStudioSections('event-1', undefined, initial), { wrapper })

    expect(result.current.sections).toHaveLength(17)

    await act(async () => {
      await result.current.handleSaveConfig(initial[1], { title: 'Nuevo título' })
    })

    await waitFor(() => expect(result.current.sections[1].config).toEqual({ title: 'Nuevo título' }))
    expect(result.current.sections).toHaveLength(17)
  })

  it('keeps the whole Studio list after toggling visibility', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { ...initial[0], is_visible: false } })
    const { result } = renderHook(() => useStudioSections('event-1', undefined, initial), { wrapper })

    await act(async () => {
      await result.current.handleToggleVisible(initial[0])
    })

    await waitFor(() => expect(result.current.sections[0].is_visible).toBe(false))
    expect(result.current.sections).toHaveLength(17)
  })
})
