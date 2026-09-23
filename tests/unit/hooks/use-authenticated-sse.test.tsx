import { useAuthenticatedSSE } from '@/hooks/useAuthenticatedSSE'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('@/hooks/usePageActivity', () => ({ usePageActivity: () => true }))
vi.mock('@/lib/api', () => ({ apiUrl: (path: string) => path, apiRequestHeaders: async () => ({}) }))

const encoder = new TextEncoder()
const parse = (event: { data: string }) => (event.data === 'valid' ? event.data : null)
function response(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('authenticated SSE recovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not announce live for headers or an empty successful response', async () => {
    const statuses = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          new ReadableStream({
            start(c) {
              c.close()
            },
          })
        )
      )
    )
    const { result, unmount } = renderHook(() =>
      useAuthenticatedSSE({ path: '/stream', parse, onStatusChange: statuses })
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.status).toBe('reconnecting')
    expect(statuses).not.toHaveBeenCalledWith('live')
    unmount()
  })

  it('aborts a silent reader and reconnects instead of freezing live', async () => {
    const cancelled = vi.fn()
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        response(
          new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode('data: valid\n\n'))
            },
            cancel: cancelled,
          })
        )
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => useAuthenticatedSSE({ path: '/stream', parse }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.status).toBe('live')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000)
    })
    expect(cancelled).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('reconnecting')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('live')
    unmount()
  })

  it('cancels the old work stream on navigation and stops retries on unmount', async () => {
    const cancelled = vi.fn()
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(response(new ReadableStream({ cancel: cancelled }))))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender, unmount } = renderHook(({ path }) => useAuthenticatedSSE({ path, parse }), {
      initialProps: { path: '/one' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    rerender({ path: '/two' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(cancelled).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(cancelled).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
