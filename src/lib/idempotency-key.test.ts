import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { releaseMutationKey, reserveMutationKey } from './idempotency-key'

describe('mutation idempotency keys', () => {
  const data = { email: 'person@example.com' }
  let generated = 0
  const generate = () => `key-${++generated}`

  beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto)
    generated = 0
    const existing = await reserveMutationKey('post', '/users/invite', data, 0, generate)
    releaseMutationKey(existing.signature)
    generated = 0
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reuses a key for the same ambiguous mutation within the retry window', async () => {
    const first = await reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    const retry = await reserveMutationKey('post', '/users/invite', data, 2_000, generate)

    expect(retry.key).toBe(first.key)
    expect(first.signature).toMatch(/^v1:[a-f0-9]{64}$/)
    expect(first.signature).not.toContain(JSON.stringify(data))
    expect(first.signature).toBe('v1:550a0d06d6327f3c0d72af5824175f01183b8e0a8d81e85b36223d1fd554198c')
    expect(generated).toBe(1)
    releaseMutationKey(first.signature)
  })

  it('creates a new key after a known response releases the mutation', async () => {
    const first = await reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    releaseMutationKey(first.signature)
    const nextAction = await reserveMutationKey('post', '/users/invite', data, 2_000, generate)

    expect(nextAction.key).not.toBe(first.key)
    releaseMutationKey(nextAction.signature)
  })

  it('does not share keys across different payloads', async () => {
    const first = await reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    const second = await reserveMutationKey('post', '/users/invite', { email: 'other@example.com' }, 1_000, generate)

    expect(second.key).not.toBe(first.key)
    releaseMutationKey(first.signature)
    releaseMutationKey(second.signature)
  })

  it('never retains credential-setting requests or their secret canaries', async () => {
    const secretCanary = 'synthetic-api-key-canary-not-for-retention'
    const request = () => reserveMutationKey(
      'put',
      '/automation/ai/projects/project-1/providers/openrouter/credential',
      { api_key: secretCanary },
      1_000,
      generate,
    )

    const first = await request()
    const retry = await request()

    expect(first.signature).toBeNull()
    expect(retry.signature).toBeNull()
    expect(retry.key).not.toBe(first.key)
    expect(`${first.key}${first.signature ?? ''}${retry.key}${retry.signature ?? ''}`).not.toContain(secretCanary)
  })

  it('does not retain nested token, credential, or serialized JSON fields', async () => {
    const canaries = await Promise.all([
      reserveMutationKey('post', '/automation/jobs', { metadata: { accessToken: 'nested-token-canary' } }, 1_000, generate),
      reserveMutationKey('post', '/automation/jobs', { config: { credential_value: 'nested-credential-canary' } }, 1_000, generate),
      reserveMutationKey('post', '/automation/jobs', '{"options":{"apiKey":"serialized-api-key-canary"}}', 1_000, generate),
    ])

    expect(canaries.map(({ signature }) => signature)).toEqual([null, null, null])
    expect(JSON.stringify(canaries)).not.toMatch(/nested-token-canary|nested-credential-canary|serialized-api-key-canary/)
  })

  it('stores only a one-way digest for non-sensitive bodies', async () => {
    const secretLikeText = 'ordinary-private-profile-text'
    const reservation = await reserveMutationKey('post', '/profiles', { note: secretLikeText }, 1_000, generate)

    expect(reservation.signature).toMatch(/^v1:[a-f0-9]{64}$/)
    expect(reservation.signature).not.toContain(secretLikeText)
    expect(reservation.signature).not.toContain(JSON.stringify({ note: secretLikeText }))
    releaseMutationKey(reservation.signature)
  })

  it('hashes multi-block payloads with the stable SHA-256 format', async () => {
    const reservation = await reserveMutationKey('post', '/profiles', { note: 'x'.repeat(90) }, 1_000, generate)

    expect(reservation.signature).toBe('v1:0a4de3767f5bb947efcbf72897bfb31522f2a95e735c0aa1737470ec19ff3da1')
    releaseMutationKey(reservation.signature)
  })

  it('uses one-off keys and retains no signature when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fallback-random-id' })

    const first = await reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    const retry = await reserveMutationKey('post', '/users/invite', data, 2_000, generate)

    expect(first.signature).toBeNull()
    expect(retry.signature).toBeNull()
    expect(retry.key).not.toBe(first.key)
  })
})
