// @vitest-environment node
import { AxiosError, CanceledError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { shouldRetrySwrError, swrOnErrorRetry } from '@/lib/swr-error-retry'

function httpError(status: number) {
  const error = new AxiosError(`status ${status}`)
  error.response = { status, data: {}, statusText: '', headers: {}, config: {} as never }
  return error
}

describe('shouldRetrySwrError', () => {
  it('never retries 4xx answers', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) expect(shouldRetrySwrError(httpError(status), 1)).toBe(false)
  })

  it('retries transient failures up to the limit', () => {
    expect(shouldRetrySwrError(httpError(503), 1)).toBe(true)
    expect(shouldRetrySwrError(httpError(429), 1)).toBe(true)
    expect(shouldRetrySwrError(new AxiosError('Network Error', 'ERR_NETWORK'), 2)).toBe(true)
    expect(shouldRetrySwrError(httpError(503), 3)).toBe(false)
  })

  it('never retries a cancelled request', () => {
    expect(shouldRetrySwrError(new CanceledError(), 1)).toBe(false)
  })
})

describe('swrOnErrorRetry', () => {
  afterEach(() => vi.useRealTimers())

  it('schedules a revalidation only for retryable errors', () => {
    vi.useFakeTimers()
    const revalidate = vi.fn()
    const config = { errorRetryInterval: 1_000 } as never

    swrOnErrorRetry(httpError(403), 'k', config, revalidate, { retryCount: 1, dedupe: true })
    swrOnErrorRetry(httpError(500), 'k', config, revalidate, { retryCount: 1, dedupe: true })
    vi.advanceTimersByTime(60_000)

    expect(revalidate).toHaveBeenCalledTimes(1)
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 })
  })
})
