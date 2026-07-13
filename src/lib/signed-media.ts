export function getPresignedUrlExpiry(viewUrl: string | null | undefined): Date | null {
  const raw = viewUrl?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    return parseAwsSigV4Expiry(url) ?? parseSignedEpochSecondsExpiry(url)
  } catch {
    return null
  }
}

function parseAwsSigV4Expiry(url: URL): Date | null {
  const dateStr = url.searchParams.get('X-Amz-Date')
  const expires = Number(url.searchParams.get('X-Amz-Expires') || '0')
  if (!dateStr || !/^\d{8}T\d{6}Z$/.test(dateStr) || !Number.isFinite(expires) || expires <= 0) {
    return null
  }

  const signedDate = new Date(
    Date.UTC(
      Number(dateStr.slice(0, 4)),
      Number(dateStr.slice(4, 6)) - 1,
      Number(dateStr.slice(6, 8)),
      Number(dateStr.slice(9, 11)),
      Number(dateStr.slice(11, 13)),
      Number(dateStr.slice(13, 15))
    )
  )
  if (Number.isNaN(signedDate.getTime())) return null
  return new Date(signedDate.getTime() + expires * 1000)
}

function parseSignedEpochSecondsExpiry(url: URL): Date | null {
  const hasSignatureMarker =
    url.searchParams.has('Signature') ||
    url.searchParams.has('AWSAccessKeyId') ||
    url.searchParams.has('Key-Pair-Id') ||
    url.searchParams.has('Policy')
  if (!hasSignatureMarker) return null

  const expires = Number(url.searchParams.get('Expires') || '0')
  if (!Number.isFinite(expires) || expires <= 0) return null

  const expiry = new Date(expires * 1000)
  return Number.isNaN(expiry.getTime()) ? null : expiry
}

export function getMediaRefreshDelay(
  expiries: Array<Date | null | undefined>,
  now = Date.now(),
  skewMs = 60 * 1000
): number | null {
  const validExpiries = expiries.filter(
    (expiry): expiry is Date => expiry instanceof Date && !Number.isNaN(expiry.getTime())
  )
  if (validExpiries.length === 0) return null

  const earliest = Math.min(...validExpiries.map((expiry) => expiry.getTime()))
  return Math.max(0, earliest - now - skewMs)
}
