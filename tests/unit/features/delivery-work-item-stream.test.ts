import { deliveryWorkItemStreamEnabled, isNewDeliveryWorkItemRevision, parseDeliveryWorkItemStreamEvent } from '@/features/automation/use-delivery-work-item-stream'
import { describe, expect, it } from 'vitest'

describe('delivery work item stream adapter', () => {
  it('accepts the bounded invalidation payload emitted by the backend', () => {
    expect(parseDeliveryWorkItemStreamEvent({
      event: 'update',
      id: 'revision-1',
      data: JSON.stringify({
        work_item_id: 'work-1',
        revision: 'revision-1',
        state: 'implementation',
        active_tasks: 1,
        last_activity_at: '2026-08-11T20:00:00Z',
        generated_at: '2026-08-11T20:00:01Z',
      }),
    })).toEqual({
      work_item_id: 'work-1',
      revision: 'revision-1',
      state: 'implementation',
      active_tasks: 1,
      last_activity_at: '2026-08-11T20:00:00Z',
      generated_at: '2026-08-11T20:00:01Z',
    })
  })

  it('fails closed for non-stream events and malformed activity values', () => {
    expect(parseDeliveryWorkItemStreamEvent({ event: 'message', data: '{}' })).toBeNull()
    expect(parseDeliveryWorkItemStreamEvent({
      event: 'update',
      data: JSON.stringify({
        work_item_id: 'work-1', revision: 'r', state: 'planning', active_tasks: -1, generated_at: 'now',
      }),
    })).toBeNull()
    expect(parseDeliveryWorkItemStreamEvent({
      event: 'snapshot',
      data: JSON.stringify({
        work_item_id: ' ', revision: ' ', state: ' ', active_tasks: 0, generated_at: ' ',
      }),
    })).toBeNull()
  })

  it('only invalidates for a new stream revision', () => {
    const event = {
      work_item_id: 'work-1', revision: 'revision-1', state: 'implementation', active_tasks: 1, generated_at: '2026-08-11T20:00:01Z',
    }

    expect(isNewDeliveryWorkItemRevision(undefined, event)).toBe(true)
    expect(isNewDeliveryWorkItemRevision('revision-1', event)).toBe(false)
    expect(isNewDeliveryWorkItemRevision('revision-0', event)).toBe(true)
  })

  it('keeps subscriptions only for a result that can still move', () => {
    expect(deliveryWorkItemStreamEnabled('work-1', 'implementation')).toBe(true)
    expect(deliveryWorkItemStreamEnabled('work-1', 'released')).toBe(false)
    expect(deliveryWorkItemStreamEnabled('work-1', 'cancelled')).toBe(false)
    expect(deliveryWorkItemStreamEnabled('', 'planning')).toBe(false)
  })
})
