import type { SWRConfiguration } from 'swr'

import { apiErrorStatus, isCanceledRequest } from '@/lib/api-error'
import { isOrganizationContextFailure } from '@/lib/api'

export const SWR_MAX_ERROR_RETRIES = 3

/**
 * Retry only failures that can heal on their own: network drops, 5xx, 408
 * and 429. A 4xx (forbidden, not found, validation) gives the same answer on
 * every retry and each retry re-triggers the interceptor's toasts.
 */
export function shouldRetrySwrError(error: unknown, retryCount: number): boolean {
  if (retryCount >= SWR_MAX_ERROR_RETRIES) return false
  if (isCanceledRequest(error)) return false
  // A missing or expired organization credential is not an answer about the
  // user's role: the interceptor already refreshed it once, so give the
  // workspace another chance instead of caching the failure.
  if (isOrganizationContextFailure(error)) return true
  const status = apiErrorStatus(error)
  if (status === undefined) return true
  if (status === 408 || status === 429) return true
  return status >= 500
}

export const swrOnErrorRetry: NonNullable<SWRConfiguration['onErrorRetry']> = (
  error,
  _key,
  config,
  revalidate,
  { retryCount }
) => {
  if (!shouldRetrySwrError(error, retryCount)) return
  const baseInterval = config.errorRetryInterval ?? 5_000
  // Exponential backoff with jitter, as SWR's default does.
  const delay = Math.min(baseInterval * 2 ** Math.max(0, retryCount - 1), 60_000) * (0.5 + Math.random() / 2)
  setTimeout(() => void revalidate({ retryCount }), delay)
}
