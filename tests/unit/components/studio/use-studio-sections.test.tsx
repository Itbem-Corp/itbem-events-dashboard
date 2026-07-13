import { act, renderHook, waitFor } from '@testing-library/react'
import useSWR from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioSections } from '@/components/studio/use-studio-sections'
import { api } from '@/lib/api'
import type { EventSection } from '@/models/EventSection'

vi.mock('swr', () => ({
  default: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const baseSection: Omit<EventSection, 'id' | 'order' | 'component_type' | 'name'> = {
  event_id: 'event-1',
  created_at: '2026-07-05T00:00:00.000Z',
  updated_at: '2026-07-05T00:00:00.000Z',
  is_visible: true,
  config: {},
}

function makeSection(overrides: Pick<EventSection, 'id' | 'order' | 'component_type' | 'name'>): EventSection {
  return { ...baseSection, ...overrides }
}

describe('useStudioSections', () => {
  const mutate = vi.fn()
  const sectionA = makeSection({ id: 'section-a', order: 1, component_type: 'CountdownHeader', name: 'A' })
  const sectionB = makeSection({ id: 'section-b', order: 2, component_type: 'MomentWall', name: 'B' })
  const sectionC = makeSection({ id: 'section-c', order: 3, component_type: 'Agenda', name: 'C' })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSWR).mockReturnValue({
      data: [sectionA, sectionB],
      error: undefined,
      isLoading: false,
      mutate,
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes sections sorted by render order with a stable id tie-break', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: [sectionC, sectionA, { ...sectionB, order: 3 }, { ...sectionC, id: 'section-aa', order: 3, name: 'AA' }],
      error: undefined,
      isLoading: false,
      mutate,
    } as never)

    const { result } = renderHook(() => useStudioSections('event-1'))

    expect(result.current.sections.map((section) => section.id)).toEqual([
      'section-a',
      'section-aa',
      'section-b',
      'section-c',
    ])
  })

  it('reorders sections through the bulk reorder endpoint', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleReorder([sectionB, sectionA])
    })

    expect(vi.mocked(api.patch)).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(vi.mocked(api.patch)).toHaveBeenCalledWith('/events/event-1/sections/reorder', {
      sections: [
        { id: 'section-b', order: 1 },
        { id: 'section-a', order: 2 },
      ],
    })
    expect(vi.mocked(api.put)).not.toHaveBeenCalled()
  })

  it('persists only the latest order after rapid drag updates', async () => {
    vi.useFakeTimers()
    vi.mocked(useSWR).mockReturnValue({
      data: [sectionA, sectionB, sectionC],
      error: undefined,
      isLoading: false,
      mutate,
    } as never)

    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleReorder([sectionB, sectionA, sectionC])
      await result.current.handleReorder([sectionB, sectionC, sectionA])
    })

    expect(vi.mocked(api.patch)).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(vi.mocked(api.patch)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith('/events/event-1/sections/reorder', {
      sections: [
        { id: 'section-b', order: 1 },
        { id: 'section-c', order: 2 },
        { id: 'section-a', order: 3 },
      ],
    })
  })

  it('toggles visibility with a partial section payload', async () => {
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleToggleVisible(sectionA)
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/sections/section-a', { is_visible: false })
    })
  })

  it('upserts section cache from a backend response envelope after toggling visibility', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({
      data: {
        status: 200,
        message: 'Section updated',
        data: {
          ...sectionA,
          is_visible: false,
          updated_at: '2026-07-06T00:00:00.000Z',
        },
      },
    })

    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleToggleVisible(sectionA)
    })

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
    })

    const cacheUpdater = mutate.mock.calls.find((call) => typeof call[0] === 'function')?.[0] as
      | ((current: EventSection[]) => EventSection[])
      | undefined

    expect(cacheUpdater?.([sectionA, sectionB])).toEqual([
      {
        ...sectionA,
        is_visible: false,
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      sectionB,
    ])
  })

  it('saves config with a partial section payload', async () => {
    const { result } = renderHook(() => useStudioSections('event-1'))
    const config = { title: 'Nuevo titulo' }

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, config)
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/sections/section-b', { config })
    })
  })

  it('debounces preview refresh after saving config', async () => {
    vi.useFakeTimers()
    const refreshPreview = vi.fn()
    const { result } = renderHook(() => useStudioSections('event-1', refreshPreview))
    const config = { title: 'Nuevo titulo' }

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, config)
    })

    expect(refreshPreview).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(refreshPreview).toHaveBeenCalledTimes(1)
  })

  it('clears a pending preview refresh on unmount', async () => {
    vi.useFakeTimers()
    const refreshPreview = vi.fn()
    const { result, unmount } = renderHook(() => useStudioSections('event-1', refreshPreview))

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, { title: 'Nuevo titulo' })
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(refreshPreview).not.toHaveBeenCalled()
  })
})
