const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 3_500
const MAX_URL_LENGTH = 4_096

const DEFAULT_EXACT_HOSTS = [
  'cdn.eventiapp.com.mx',
  'cdn-staging.eventiapp.com.mx',
  'itbem-events-bucket-prod.s3.us-east-2.amazonaws.com',
  'itbem-events-bucket-staging.s3.us-east-2.amazonaws.com',
] as const

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface OgCoverPayload {
  bytes: ArrayBuffer
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
}

interface OgCoverFetchOptions {
  backendUrl?: string | null
  configuredHosts?: string | null
  allowedHosts?: ReadonlySet<string>
  fetchImpl?: FetchLike
  maxBytes?: number
  timeoutMs?: number
}

function configuredHost(value: string): string | null {
  const candidate = value.trim().toLowerCase()
  if (!candidate) return null

  try {
    const url = candidate.includes('://') ? new URL(candidate) : new URL(`https://${candidate}`)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.hostname
  } catch {
    return null
  }
}

export function buildOgCoverAllowedHosts(
  backendUrl?: string | null,
  configuredHosts?: string | null
): ReadonlySet<string> {
  const hosts = new Set<string>(DEFAULT_EXACT_HOSTS)

  for (const candidate of configuredHosts?.split(',') ?? []) {
    const hostname = configuredHost(candidate)
    if (hostname) hosts.add(hostname)
  }

  try {
    const backend = new URL(backendUrl ?? '')
    if (backend.protocol === 'https:' && !backend.username && !backend.password && !backend.port) {
      hosts.add(backend.hostname.toLowerCase())
    }
  } catch {
    // A missing local backend URL simply contributes no remote cover host.
  }

  return hosts
}

export function isAllowedOgCoverUrl(value: string, allowedHosts: ReadonlySet<string>): boolean {
  if (!value || value.length > MAX_URL_LENGTH) return false

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      allowedHosts.has(url.hostname.toLowerCase())
    )
  } catch {
    return false
  }
}

function hasExpectedMagicBytes(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  }
  if (contentType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    )
  }
  return false
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function fetchOgCover(
  value: string,
  options: OgCoverFetchOptions = {}
): Promise<OgCoverPayload | null> {
  const allowedHosts =
    options.allowedHosts ?? buildOgCoverAllowedHosts(options.backendUrl, options.configuredHosts)
  if (!isAllowedOgCoverUrl(value, allowedHosts)) return null

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await (options.fetchImpl ?? fetch)(value, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      credentials: 'omit',
      headers: { Accept: 'image/webp,image/png,image/jpeg' },
      signal: controller.signal,
    })
    if (!response.ok || response.status < 200 || response.status >= 300) return null

    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return null

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null

    const bytes = await readBoundedBody(response, maxBytes)
    if (!bytes || !hasExpectedMagicBytes(bytes, contentType)) return null

    return {
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      contentType: contentType as OgCoverPayload['contentType'],
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
