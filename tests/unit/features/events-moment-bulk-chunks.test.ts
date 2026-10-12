import { chunkMomentIds, MOMENT_BULK_MAX_IDS } from '@/features/events/moment-bulk-chunks'
import { describe, expect, it } from 'vitest'

describe('chunkMomentIds', () => {
  it('keeps a list at the backend limit in one request', () => {
    const ids = Array.from({ length: MOMENT_BULK_MAX_IDS }, (_, index) => `m-${index}`)
    expect(chunkMomentIds(ids)).toHaveLength(1)
  })

  it('splits a list above 5000 ids into chunks of at most 5000, in order', () => {
    const ids = Array.from({ length: 12_001 }, (_, index) => index)
    const chunks = chunkMomentIds(ids)
    expect(chunks.map((chunk) => chunk.length)).toEqual([5000, 5000, 2001])
    expect(chunks.flat()).toEqual(ids)
  })

  it('returns no chunks for an empty list and rejects a bad size', () => {
    expect(chunkMomentIds([])).toEqual([])
    expect(() => chunkMomentIds([1], 0)).toThrow()
  })
})
