import { act, renderHook, waitFor } from '@testing-library/react'
import useSWR from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioSections } from '@/components/studio/use-studio-sections'
import { api } from '@/lib/api'
import { SectionConflictError } from '@/lib/section-conflict'
import { toast } from 'sonner'
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

  it('revalidates the sections when the tab gets focus again, at most every 2 s (STU-N3)', () => {
    renderHook(() => useStudioSections('event-1'))
    expect(mutate).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith()
  })

  it('returns the saved section so the editor can track its version (STU-N3)', async () => {
    const saved = { ...sectionB, updated_at: '2026-07-05T00:09:00.000Z' }
    vi.mocked(api.put).mockResolvedValueOnce({ data: { status: 200, message: 'Section updated', data: saved } })
    const { result } = renderHook(() => useStudioSections('event-1'))

    let returned: unknown
    await act(async () => {
      returned = await result.current.handleSaveConfig(sectionB, { title: 'x' })
    })

    expect(returned).toMatchObject({ id: 'section-b', updated_at: '2026-07-05T00:09:00.000Z' })
  })

  it('sends expected_updated_at exactly as the API returned it (STU-N3)', async () => {
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, { title: 'x' }, '2026-07-05T00:00:00.123456-06:00')
    })

    expect(vi.mocked(api.put)).toHaveBeenCalledWith('/sections/section-b', {
      config: { title: 'x' },
      expected_updated_at: '2026-07-05T00:00:00.123456-06:00',
    })
  })

  it('turns a 409 section_conflict into SectionConflictError with the current section, without an error toast (STU-N3)', async () => {
    const current = { ...sectionB, updated_at: '2026-07-05T00:07:00.000Z', config: { title: 'otra pestaña' } }
    vi.mocked(api.put).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          status: 409,
          message: 'Esta sección cambió en otra pestaña o por otra persona.',
          error: 'section_conflict',
          code: 'section_conflict',
          data: current,
        },
      },
    })
    const { result } = renderHook(() => useStudioSections('event-1'))

    let caught: unknown
    await act(async () => {
      caught = await result.current
        .handleSaveConfig(sectionB, { title: 'x' }, '2026-07-05T00:00:00.000Z')
        .catch((error: unknown) => error)
    })

    expect(caught).toBeInstanceOf(SectionConflictError)
    expect((caught as SectionConflictError).current).toMatchObject({ updated_at: '2026-07-05T00:07:00.000Z' })
    expect(mutate).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('logs a 400 invalid_expected_updated_at as a client bug (STU-N3)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.put).mockRejectedValueOnce({
      response: { status: 400, data: { error: 'invalid_expected_updated_at' } },
    })
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, { title: 'x' }, 'not-a-date').catch(() => undefined)
    })

    expect(consoleError).toHaveBeenCalledWith(
      '[studio] PUT /sections rejected expected_updated_at',
      expect.objectContaining({ sectionId: 'section-b', expectedUpdatedAt: 'not-a-date' })
    )
    expect(toast.error).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('refetches the sections after a reorder so updated_at is current (STU-N3)', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleReorder([sectionB, sectionA])
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(vi.mocked(api.patch)).toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledWith()
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

  it('tracks in-flight and failed config saves as unsaved changes (STU-20)', async () => {
    let rejectPut: (reason: unknown) => void = () => undefined
    vi.mocked(api.put).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPut = reject
        })
    )
    const { result } = renderHook(() => useStudioSections('event-1'))
    expect(result.current.hasUnsavedChanges).toBe(false)

    let savePromise: Promise<unknown> = Promise.resolve()
    act(() => {
      savePromise = result.current.handleSaveConfig(sectionB, { title: 'x' }).catch(() => undefined)
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    await act(async () => {
      rejectPut(new Error('offline'))
      await savePromise
    })
    // Still unsaved: the last save of this section failed.
    expect(result.current.hasUnsavedChanges).toBe(true)

    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })
    await act(async () => {
      await result.current.handleSaveConfig(sectionB, { title: 'x' })
    })
    expect(result.current.hasUnsavedChanges).toBe(false)
  })
  it('stops reporting unsaved changes once the user discards a failed save (review F11)', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useStudioSections('event-1'))

    await act(async () => {
      await result.current.handleSaveConfig(sectionB, { title: 'x' }).catch(() => undefined)
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    // Discarding another section leaves this failure in place.
    act(() => result.current.discardFailedSave('section-a'))
    expect(result.current.hasUnsavedChanges).toBe(true)

    act(() => result.current.discardFailedSave('section-b'))
    expect(result.current.hasUnsavedChanges).toBe(false)
  })
})
