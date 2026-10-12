import { renderHook, waitFor } from '@testing-library/react'
import { mutate } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEventHealthCheck } from '@/hooks/useEventHealthCheck'
import { api } from '@/lib/api'
import type { ScopedFetcherKey } from '@/lib/request-context'
import type { Event } from '@/models/Event'

vi.mock('swr', () => ({ mutate: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))

const brokenEvent = {
  id: 'evt-1',
  name: 'Evento',
  identifier: 'evento',
  is_active: true,
  event_date_time: '2026-12-01T00:00:00Z',
  timezone: '',
  language: 'es',
} as Event

const scopedKey = ['/events/evt-1/detail', 'eventiapp', 'organization', 'org-1'] as unknown as ScopedFetcherKey

describe('useEventHealthCheck (EVT-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.mocked(api.post).mockResolvedValue({ data: { status: 200, data: { repaired: true } } })
  })

  it('never calls repair for a user without event:manage', async () => {
    renderHook(() => useEventHealthCheck(brokenEvent, { canRepair: false, eventKey: scopedKey }))
    await Promise.resolve()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('waits for the capabilities, then repairs once and refreshes the scoped detail key', async () => {
    const { rerender } = renderHook(
      ({ canRepair }: { canRepair: boolean }) => useEventHealthCheck(brokenEvent, { canRepair, eventKey: scopedKey }),
      { initialProps: { canRepair: false } }
    )
    expect(api.post).not.toHaveBeenCalled()

    rerender({ canRepair: true })
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(scopedKey))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/events/evt-1/repair')

    rerender({ canRepair: true })
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a healthy event', async () => {
    renderHook(() =>
      useEventHealthCheck({ ...brokenEvent, timezone: 'America/Mexico_City' }, { canRepair: true, eventKey: scopedKey })
    )
    await Promise.resolve()
    expect(api.post).not.toHaveBeenCalled()
  })
})
