import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  mergeLatestMoments,
  momentOrderSignature,
  momentReorderPayload,
  sortMomentsByWallOrder,
  useMomentReorderDraft,
} from '@/features/events/moment-wall-order'
import type { Moment } from '@/models/Moment'

function moment(id: string, overrides: Partial<Moment> = {}): Moment {
  return {
    id,
    event_id: 'evt-1',
    is_approved: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Moment
}

afterEach(() => {
  vi.useRealTimers()
})

describe('wall order helpers', () => {
  it('sorts like the public wall: custom order first, then newest, then id', () => {
    const list = [
      moment('newest-unordered', { created_at: '2026-03-01T00:00:00Z' }),
      moment('second', { order: 2 }),
      moment('older-unordered', { created_at: '2026-02-01T00:00:00Z' }),
      moment('first', { order: 1, created_at: '2025-01-01T00:00:00Z' }),
      moment('tie-a', { created_at: '2026-02-01T00:00:00Z' }),
    ]
    expect(sortMomentsByWallOrder(list).map((item) => item.id)).toEqual([
      'first',
      'second',
      'newest-unordered',
      'tie-a',
      'older-unordered',
    ])
  })

  it('builds a 1..n payload and an id-only signature', () => {
    const list = [moment('a', { content_view_url: 'https://signed/1' }), moment('b')]
    expect(momentReorderPayload(list)).toEqual([
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ])
    const refetched = [moment('a', { content_view_url: 'https://signed/2', updated_at: '2026-09-09T00:00:00Z' }), moment('b')]
    expect(momentOrderSignature(refetched)).toBe(momentOrderSignature(list))
  })

  it('refreshes card data without reordering, drops unapproved, keeps unloaded ids', () => {
    const ordered = [moment('c'), moment('a'), moment('b'), moment('not-loaded')]
    const latest = [
      moment('a', { content_view_url: 'https://new' }),
      moment('b', { is_approved: false }),
      moment('c'),
    ]
    const merged = mergeLatestMoments(ordered, latest)
    expect(merged.map((item) => item.id)).toEqual(['c', 'a', 'not-loaded'])
    expect(merged[1].content_view_url).toBe('https://new')
  })
})

describe('useMomentReorderDraft (MOM-1 / MOM-2)', () => {
  it('never saves when reorder mode is seeded or refreshed from the server', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useMomentReorderDraft(save))

    act(() => result.current.seed([moment('b', { order: 2 }), moment('a', { order: 1 })]))
    expect(result.current.ordered.map((item) => item.id)).toEqual(['a', 'b'])

    // Every refetch brings new signed URLs and updated_at: still no save.
    for (let i = 0; i < 5; i += 1) {
      act(() =>
        result.current.sync([
          moment('a', { order: 1, content_view_url: `https://signed/${i}` }),
          moment('b', { order: 2, updated_at: `2026-01-0${i + 2}T00:00:00Z` }),
        ])
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
    }
    expect(save).not.toHaveBeenCalled()
    expect(result.current.ordered[0].content_view_url).toBe('https://signed/4')
  })

  it('saves once, debounced, after a user drag that changes the order', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useMomentReorderDraft(save, 800))
    act(() => result.current.seed([moment('a', { order: 1 }), moment('b', { order: 2 }), moment('c', { order: 3 })]))

    act(() => result.current.reorder([moment('b'), moment('a'), moment('c')]))
    act(() => result.current.reorder([moment('c'), moment('b'), moment('a')]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799)
    })
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].map((item: Moment) => item.id)).toEqual(['c', 'b', 'a'])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not save a drag that puts the moments back in the saved order', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useMomentReorderDraft(save))
    act(() => result.current.seed([moment('a', { order: 1 }), moment('b', { order: 2 })]))

    act(() => result.current.reorder([moment('b'), moment('a')]))
    act(() => result.current.reorder([moment('a'), moment('b')]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps a drag made while a refresh lands, and flushes it on exit', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useMomentReorderDraft(save))
    act(() => result.current.seed([moment('a', { order: 1 }), moment('b', { order: 2 })]))

    act(() => result.current.reorder([moment('b'), moment('a')]))
    act(() => result.current.sync([moment('a', { content_view_url: 'https://x' }), moment('b')]))
    expect(result.current.ordered.map((item) => item.id)).toEqual(['b', 'a'])

    await act(async () => {
      await result.current.flush()
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].map((item: Moment) => item.id)).toEqual(['b', 'a'])
  })

  it('retries a failed save on the next drag', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { result } = renderHook(() => useMomentReorderDraft(save))
    act(() => result.current.seed([moment('a', { order: 1 }), moment('b', { order: 2 }), moment('c', { order: 3 })]))

    act(() => result.current.reorder([moment('b'), moment('a'), moment('c')]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    act(() => result.current.reorder([moment('b'), moment('c'), moment('a')]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(save).toHaveBeenCalledTimes(2)
  })
})
