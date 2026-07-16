import { beforeEach, describe, expect, it } from 'vitest'

import { releaseMutationKey, reserveMutationKey } from './idempotency-key'

describe('mutation idempotency keys', () => {
  const data = { email: 'person@example.com' }
  let generated = 0
  const generate = () => `key-${++generated}`

  beforeEach(() => {
    generated = 0
    const existing = reserveMutationKey('post', '/users/invite', data, 0, generate)
    releaseMutationKey(existing.signature)
    generated = 0
  })

  it('reuses a key for the same ambiguous mutation within the retry window', () => {
    const first = reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    const retry = reserveMutationKey('post', '/users/invite', data, 2_000, generate)

    expect(retry.key).toBe(first.key)
    expect(generated).toBe(1)
    releaseMutationKey(first.signature)
  })

  it('creates a new key after a known response releases the mutation', () => {
    const first = reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    releaseMutationKey(first.signature)
    const nextAction = reserveMutationKey('post', '/users/invite', data, 2_000, generate)

    expect(nextAction.key).not.toBe(first.key)
    releaseMutationKey(nextAction.signature)
  })

  it('does not share keys across different payloads', () => {
    const first = reserveMutationKey('post', '/users/invite', data, 1_000, generate)
    const second = reserveMutationKey('post', '/users/invite', { email: 'other@example.com' }, 1_000, generate)

    expect(second.key).not.toBe(first.key)
    releaseMutationKey(first.signature)
    releaseMutationKey(second.signature)
  })
})
