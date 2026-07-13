import { paginateItems } from '@/lib/paginate'
import { describe, expect, it } from 'vitest'

describe('paginateItems', () => {
  it('returns only the requested page without mutating the source list', () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1)

    expect(paginateItems(items, 1, 12)).toEqual(items.slice(0, 12))
    expect(paginateItems(items, 2, 12)).toEqual(items.slice(12, 24))
    expect(paginateItems(items, 3, 12)).toEqual([25])
    expect(items).toHaveLength(25)
  })

  it('normalizes invalid page inputs to safe positive values', () => {
    expect(paginateItems([1, 2, 3], 0, 0)).toEqual([1])
  })
})
