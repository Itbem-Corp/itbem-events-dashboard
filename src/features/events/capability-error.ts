/**
 * Tells a permission answer apart from a failure to get one. Studio, check-in
 * and the event detail must not show "no tienes permiso" when the request
 * never reached the API or the API failed: that case offers Reintentar.
 */
export type CapabilityErrorKind = 'forbidden' | 'not_found' | 'unavailable'

type StatusCarrier = {
  status?: unknown
  response?: { status?: unknown } | null
}

function asHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined
}

/** HTTP status of an axios or apiFetch error; undefined when there was no response. */
export function httpStatusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as StatusCarrier
  return asHttpStatus(candidate.response?.status) ?? asHttpStatus(candidate.status)
}

export function capabilityErrorKind(error: unknown): CapabilityErrorKind {
  const status = httpStatusOf(error)
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  return 'unavailable'
}
