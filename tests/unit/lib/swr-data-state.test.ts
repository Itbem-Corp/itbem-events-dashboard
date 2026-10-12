// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getDataErrorState, isMissingResourceError } from '@/lib/swr-data-state'

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

// QA EVT-36 / EVT-94: a deleted or unknown event showed "Conexión interrumpida".
describe('isMissingResourceError', () => {
  it('treats 404 and a plain 403 as a missing record', () => {
    expect(isMissingResourceError({ response: { status: 404, data: { message: 'Event not found' } } })).toBe(true)
    expect(isMissingResourceError({ response: { status: 403, data: { message: 'Forbidden' } } })).toBe(true)
    expect(isMissingResourceError({ status: 404 })).toBe(true)
  })

  it('keeps workspace context races and network failures as transient', () => {
    expect(
      isMissingResourceError({ response: { status: 403, data: { message: 'organization context token is required' } } })
    ).toBe(false)
    expect(
      isMissingResourceError({ response: { status: 403, data: { message: 'Application context denied', detail: 'x' } } })
    ).toBe(false)
    expect(isMissingResourceError(new Error('Network Error'))).toBe(false)
    expect(isMissingResourceError({ response: { status: 500 } })).toBe(false)
  })
})
