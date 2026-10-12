export type DataErrorState = 'fatal' | 'stale' | null

export function getDataErrorState(error: unknown, data: unknown): DataErrorState {
  if (!error) return null
  return data === undefined ? 'fatal' : 'stale'
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as { status?: unknown; response?: { status?: unknown } }
  const status = candidate.response?.status ?? candidate.status
  return typeof status === 'number' ? status : undefined
}

function errorBody(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const candidate = error as { response?: { data?: unknown }; data?: unknown; message?: unknown }
  try {
    return JSON.stringify(candidate.response?.data ?? candidate.data ?? candidate.message ?? '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * True when a detail request failed because the record does not exist or is not
 * visible to this user (404, or a 403 the backend uses to avoid confirming that
 * an id exists). Workspace/organization-context denials are transient and keep
 * the "connection" treatment so the user retries instead of giving up.
 */
export function isMissingResourceError(error: unknown): boolean {
  const status = errorStatus(error)
  if (status === 404 || status === 410) return true
  if (status !== 403) return false
  const body = errorBody(error)
  return !body.includes('organization context') && !body.includes('application context denied')
}
