// @vitest-environment node
import { isUuid } from '@/lib/uuid'
import { describe, expect, it } from 'vitest'

describe('isUuid (EVT-36)', () => {
  it('accepts well-formed ids and rejects malformed route params', () => {
    expect(isUuid('552429f8-d9d3-459f-b37a-39ca19c5218f')).toBe(true)
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('552429f8-d9d3-459f-b37a-39ca19c5218')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})
