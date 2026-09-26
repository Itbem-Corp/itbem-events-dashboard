import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecurrenceHistory } from '@/features/automation/use-recurrence-history'

const mocks = vi.hoisted(() => ({
  useSWRInfinite: vi.fn(),
  scopedPath: vi.fn((path: string) => [path, 'core', 'organization', 'org-1'] as const),
}))

vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherScope: () => mocks.scopedPath }))
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))

const emptyQuery = {
  data: undefined,
  error: undefined,
  isLoading: false,
  isValidating: false,
  size: 1,
  setSize: vi.fn(),
  mutate: vi.fn(),
}

describe('useRecurrenceHistory pagination and request scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSWRInfinite.mockReturnValue(emptyQuery)
  })

  it('uses the project and schedule endpoint and scopes both feeds to the active organization context', () => {
    renderHook(() => useRecurrenceHistory('project-1', '123e4567-e89b-42d3-a456-426614174000'))

    expect(mocks.useSWRInfinite).toHaveBeenCalledTimes(2)
    const [occurrenceKey] = mocks.useSWRInfinite.mock.calls[0] as unknown as [(index: number, previous: null) => readonly unknown[]]
    const [eventKey] = mocks.useSWRInfinite.mock.calls[1] as unknown as [(index: number, previous: null) => readonly unknown[]]
    expect(occurrenceKey(0, null)).toEqual([
      '/automation/projects/project-1/schedules/123e4567-e89b-42d3-a456-426614174000/occurrences?limit=25&offset=0',
      'core', 'organization', 'org-1',
    ])
    expect(eventKey(0, null)).toEqual([
      '/automation/projects/project-1/schedules/123e4567-e89b-42d3-a456-426614174000/events?limit=25&offset=0',
      'core', 'organization', 'org-1',
    ])
  })

  it('requests the API-provided next offset and stops beyond its documented maximum', () => {
    renderHook(() => useRecurrenceHistory('project-1', '123e4567-e89b-42d3-a456-426614174000'))
    const [getOccurrenceKey] = mocks.useSWRInfinite.mock.calls[0] as unknown as [(index: number, previous: { next_offset?: number } | null) => readonly unknown[] | null]
    expect(getOccurrenceKey(1, { next_offset: 25 })?.[0]).toBe(
      '/automation/projects/project-1/schedules/123e4567-e89b-42d3-a456-426614174000/occurrences?limit=25&offset=25',
    )
    expect(getOccurrenceKey(2, { next_offset: 10_025 })).toBeNull()
    expect(getOccurrenceKey(1, { next_offset: undefined })).toBeNull()
  })

  it('does not create fetch keys without both project and schedule scope', () => {
    renderHook(() => useRecurrenceHistory('', ''))
    const [getOccurrenceKey] = mocks.useSWRInfinite.mock.calls[0] as unknown as [(index: number, previous: null) => null]
    expect(getOccurrenceKey(0, null)).toBeNull()
    expect(mocks.scopedPath).not.toHaveBeenCalled()
  })
})
