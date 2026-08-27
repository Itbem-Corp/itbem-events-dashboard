const sha256Pattern = /^[a-f0-9]{64}$/

export function expectedArtifactSHA256(value?: string) {
  const digest = value?.trim().toLowerCase() ?? ''
  return sha256Pattern.test(digest) ? digest : ''
}

export async function sha256Hex(content: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable for artifact verification')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', content)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Current Delivery artifacts always carry the worker's immutable digest.  We
// retain a no-op path for historical evidence that predates that contract, but
// any explicit digest mismatch is a hard failure and must never be rendered.
export async function verifyArtifactIntegrity(content: ArrayBuffer, expected?: string) {
  const normalized = expectedArtifactSHA256(expected)
  if (!normalized) return false
  if (await sha256Hex(content) !== normalized) {
    throw new Error('private artifact failed its SHA-256 integrity check')
  }
  return true
}
