const RETAINED_KEY_TTL_MS = 2 * 60 * 1000
const SENSITIVE_PATH_SEGMENT = /(?:^|\/)(?:credential|credentials|secret|secrets|token|tokens|authorization|auth)(?:\/|$)/i
const SENSITIVE_FIELD_PARTS = ['apikey', 'token', 'secret', 'credential', 'authorization', 'password', 'passwd', 'privatekey', 'clientsecret', 'auth']
const SENSITIVE_VALUE_PATTERNS = [
  /\bbearer\s+[^\s,;]+/i,
  /\b(?:sk|rk|pk)-(?:proj-)?[a-z0-9_-]{16,}\b/i,
  /\bsk-ant-[a-z0-9_-]{16,}\b/i,
  /\bgh[opsu]_[a-z0-9]{20,}\b/i,
  /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
]

type RetainedKey = {
  key: string
  expiresAt: number
}

export type MutationKeyReservation = {
  key: string
  signature: string | null
}

const retainedMutationKeys = new Map<string, RetainedKey>()

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function reserveMutationKey(
  method: string,
  url: string,
  data: unknown,
  now = Date.now(),
  generate = createIdempotencyKey,
): Promise<MutationKeyReservation> {
  const signature = await mutationSignature(method, url, data)
  if (!signature) return { key: generate(), signature: null }

  const retained = retainedMutationKeys.get(signature)
  const key = retained && retained.expiresAt > now ? retained.key : generate()
  retainedMutationKeys.set(signature, { key, expiresAt: now + RETAINED_KEY_TTL_MS })
  return { key, signature }
}

export function releaseMutationKey(signature: string | null | undefined) {
  if (signature) retainedMutationKeys.delete(signature)
}

async function mutationSignature(method: string, url: string, data: unknown): Promise<string | null> {
  if (typeof FormData !== 'undefined' && data instanceof FormData) return null
  if (typeof Blob !== 'undefined' && data instanceof Blob) return null
  // Credential-setting requests are deliberately not retained for ambiguous
  // retry deduplication. The API caller already reuses its Idempotency-Key
  // when it retries the same Axios config after auth refresh.
  if (containsSensitiveRequestPath(url) || containsSensitiveData(data)) return null
  try {
    const serialized = JSON.stringify(data ?? null)
    if (typeof serialized !== 'string' || typeof TextEncoder === 'undefined' || !globalThis.crypto?.subtle?.digest) return null
    // Use the platform's Web Crypto implementation rather than a local hash
    // implementation. The map key is only this one-way digest, never the
    // request body, token, email, URL, or another reversible string.
    const input = new TextEncoder().encode(`${method.toLowerCase()}\u0000${url}\u0000${serialized}`)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
    return `v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  } catch {
    // Environments without usable Web Crypto still get a fresh key, but no
    // signature is retained and therefore no request data enters the map.
    return null
  }
}

function containsSensitiveRequestPath(url: string): boolean {
  try {
    const path = new URL(url, 'https://idempotency.invalid').pathname
    return SENSITIVE_PATH_SEGMENT.test(path)
  } catch {
    // If the URL cannot be parsed safely, do not retain a signature derived
    // from it. Request execution can still proceed with a one-off key.
    return true
  }
}

function containsSensitiveData(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 32) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true
    // Serialized JSON bodies need the same recursive property-name check as
    // object payloads, or an API key could bypass it as a string.
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return containsSensitiveData(JSON.parse(trimmed), seen, depth + 1)
      } catch {
        return true
      }
    }
    return false
  }
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value)) return true
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.some((item) => containsSensitiveData(item, seen, depth + 1))
    return Object.entries(value as Record<string, unknown>).some(([name, nested]) => {
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (normalizedName === 'key' || SENSITIVE_FIELD_PARTS.some((part) => normalizedName.includes(part))) return true
      return containsSensitiveData(nested, seen, depth + 1)
    })
  } catch {
    // Accessors/proxies that fail inspection must not be retained as a key.
    return true
  } finally {
    seen.delete(value)
  }
}
