import { describe, expect, it } from 'vitest'
import {
  deliveryWorkItemStreamEnabled,
  deliveryWorkItemStreamEventMatches,
  isNewDeliveryWorkItemRevision,
  parseDeliveryWorkItemStreamEvent,
} from './use-delivery-work-item-stream'

const snapshot = {
  event: 'snapshot',
  data: JSON.stringify({
    work_item_id: 'work-item-1',
    revision: 'revision-1',
    state: 'running',
    active_tasks: 2,
    last_activity_at: '2026-09-09T06:00:00Z',
    generated_at: '2026-09-09T06:00:01Z',
  }),
}

describe('delivery work-item SSE boundary', () => {
  it('accepts the bounded backend snapshot shape', () => {
    expect(parseDeliveryWorkItemStreamEvent(snapshot)).toEqual({
      work_item_id: 'work-item-1',
      revision: 'revision-1',
      state: 'running',
      active_tasks: 2,
      last_activity_at: '2026-09-09T06:00:00Z',
      generated_at: '2026-09-09T06:00:01Z',
    })
  })

  it('rejects unrelated events and malformed task counts', () => {
    expect(parseDeliveryWorkItemStreamEvent({ ...snapshot, event: 'message' })).toBeNull()
    expect(parseDeliveryWorkItemStreamEvent({ ...snapshot, data: '{"work_item_id":"work-item-1","revision":"revision-1","state":"running","active_tasks":-1,"generated_at":"now"}' })).toBeNull()
  })

  it('binds an accepted event to the stream work item before it can refresh UI state', () => {
    const event = parseDeliveryWorkItemStreamEvent(snapshot)
    expect(event).not.toBeNull()
    expect(deliveryWorkItemStreamEventMatches(event!, 'work-item-1')).toBe(true)
    expect(deliveryWorkItemStreamEventMatches(event!, 'work-item-2')).toBe(false)
    expect(deliveryWorkItemStreamEventMatches(event!, '   ')).toBe(false)
  })

  it('deduplicates only revisions for the same subscribed item and stops terminal streams', () => {
    const event = parseDeliveryWorkItemStreamEvent(snapshot)!
    expect(isNewDeliveryWorkItemRevision('revision-1', event)).toBe(false)
    expect(isNewDeliveryWorkItemRevision('revision-0', event)).toBe(true)
    expect(deliveryWorkItemStreamEnabled('work-item-1', 'running')).toBe(true)
    expect(deliveryWorkItemStreamEnabled('work-item-1', 'released')).toBe(false)
  })
})
