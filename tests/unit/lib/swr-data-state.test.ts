import { describe, expect, it } from 'vitest'
import { getDataErrorState } from '@/lib/swr-data-state'

describe('getDataErrorState', () => {
  it('returns no error state when the request succeeded', () => {
    expect(getDataErrorState(undefined, undefined)).toBeNull()
    expect(getDataErrorState(null, [])).toBeNull()
  })

  it('treats an error without cached data as fatal', () => {
    expect(getDataErrorState(new Error('offline'), undefined)).toBe('fatal')
  })

  it('keeps empty and populated cached results available after a refresh error', () => {
    expect(getDataErrorState(new Error('offline'), [])).toBe('stale')
    expect(getDataErrorState(new Error('offline'), [{ id: '1' }])).toBe('stale')
  })
})
