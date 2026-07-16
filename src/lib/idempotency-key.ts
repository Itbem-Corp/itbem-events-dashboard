const RETAINED_KEY_TTL_MS = 2 * 60 * 1000

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

export function reserveMutationKey(
  method: string,
  url: string,
  data: unknown,
  now = Date.now(),
  generate = createIdempotencyKey,
): MutationKeyReservation {
  const signature = mutationSignature(method, url, data)
  if (!signature) return { key: generate(), signature: null }

  const retained = retainedMutationKeys.get(signature)
  const key = retained && retained.expiresAt > now ? retained.key : generate()
  retainedMutationKeys.set(signature, { key, expiresAt: now + RETAINED_KEY_TTL_MS })
  return { key, signature }
}

export function releaseMutationKey(signature: string | null | undefined) {
  if (signature) retainedMutationKeys.delete(signature)
}

function mutationSignature(method: string, url: string, data: unknown): string | null {
  if (typeof FormData !== 'undefined' && data instanceof FormData) return null
  if (typeof Blob !== 'undefined' && data instanceof Blob) return null
  try {
    return `${method}|${url}|${JSON.stringify(data ?? null)}`
  } catch {
    return null
  }
}
