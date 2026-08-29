import { createHash, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const originalCrypto = globalThis.crypto

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto })
})

describe('automation artifact integrity', () => {
  it('normalizes only canonical SHA-256 digests', async () => {
    const { expectedArtifactSHA256 } = await import('@/lib/automation-artifact-integrity')
    expect(expectedArtifactSHA256(' ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789 ')).toBe('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789')
    expect(expectedArtifactSHA256('not-a-digest')).toBe('')
  })

  it('rejects a private artifact when the downloaded bytes differ from its worker digest', async () => {
    const { verifyArtifactIntegrity } = await import('@/lib/automation-artifact-integrity')
    const encoded = new TextEncoder().encode('captured Stagehand screenshot')
    const content = new ArrayBuffer(encoded.byteLength)
    new Uint8Array(content).set(encoded)
    const digest = createHash('sha256').update(Buffer.from(new Uint8Array(content))).digest('hex')
    await expect(verifyArtifactIntegrity(content, digest)).resolves.toBe(true)
    await expect(verifyArtifactIntegrity(content, `${digest.slice(0, -1)}0`)).rejects.toThrow('SHA-256 integrity check')
  })

  it('keeps legacy artifacts readable when no digest was recorded', async () => {
    const { verifyArtifactIntegrity } = await import('@/lib/automation-artifact-integrity')
    const content = new ArrayBuffer(3)
    new Uint8Array(content).set([1, 2, 3])
    await expect(verifyArtifactIntegrity(content, undefined)).resolves.toBe(false)
  })
})
