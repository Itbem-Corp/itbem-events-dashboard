import { describe, expect, it } from 'vitest'

import { eventPasswordError } from '@/lib/event-password'

describe('eventPasswordError', () => {
  it('rejects a new password shorter than 6 or longer than 128 characters', () => {
    expect(eventPasswordError('abc', '')).toMatch(/al menos 6/)
    expect(eventPasswordError('x'.repeat(129), '')).toMatch(/más de 128/)
  })

  it('counts characters, not bytes', () => {
    expect(eventPasswordError('ñandú1', '')).toBeNull()
    expect(eventPasswordError('🎉🎉🎉🎉🎉', '')).toMatch(/al menos 6/)
  })

  it('accepts 6 to 128 characters, clearing, and an unchanged legacy short password', () => {
    expect(eventPasswordError('123456', '')).toBeNull()
    expect(eventPasswordError('x'.repeat(128), '')).toBeNull()
    expect(eventPasswordError('', 'abc')).toBeNull()
    expect(eventPasswordError('   ', 'abc')).toBeNull()
    expect(eventPasswordError('abc', 'abc')).toBeNull()
    expect(eventPasswordError('abd', 'abc')).toMatch(/al menos 6/)
  })
})
