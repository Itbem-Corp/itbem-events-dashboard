import {
  RESPONSIVE_LIST_DEDUPING_INTERVAL_MS,
  responsiveListSwrOptions,
} from '@/lib/responsive-list-swr'
import { describe, expect, it } from 'vitest'

describe('responsive list SWR policy', () => {
  it('keeps stale-while-revalidate enabled without focus request storms', () => {
    expect(responsiveListSwrOptions).toEqual({
      dedupingInterval: 15_000,
      revalidateIfStale: true,
      revalidateOnFocus: false,
    })
    expect(RESPONSIVE_LIST_DEDUPING_INTERVAL_MS).toBe(15_000)
  })
})
