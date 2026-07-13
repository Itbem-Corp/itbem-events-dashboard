import { patchEventCacheValue } from '@/lib/event-cache'
import { replaceEventConfigCacheValue } from '@/lib/event-config-cache'
import { reorderEventSectionsCacheValue, upsertEventSectionCacheValue } from '@/lib/event-section-cache'
import { patchGuestCacheValue } from '@/lib/guest-cache'
import { patchMomentsCacheValue } from '@/lib/moment-cache'
import { patchResourceFileCacheValue } from '@/lib/resource-cache'
import { patchUserCacheValue } from '@/lib/user-cache'
import { upsertClientCacheValue } from '@/lib/client-cache'
import { cacheRecordId } from '@/lib/cache-record'
import type { Client } from '@/models/Client'
import type { EventConfig } from '@/models/EventConfig'
import type { EventSection } from '@/models/EventSection'
import { describe, expect, it } from 'vitest'

function pascalEnvelope(items: unknown[]) {
  return {
    Status: 200,
    Message: 'ok',
    Data: { Items: items, Total: items.length },
  }
}

describe('cache record id aliases', () => {
  it('reads ids from Go and adapter casing variants', () => {
    expect(cacheRecordId({ id: 'lower' })).toBe('lower')
    expect(cacheRecordId({ ID: 'pascal' })).toBe('pascal')
    expect(cacheRecordId({ Id: 123 })).toBe('123')
    expect(cacheRecordId({ id: ' ', ID: 'pascal-after-blank' })).toBe('pascal-after-blank')
  })

  it('matches Pascal-cased item IDs in optimistic cache mutations', () => {
    expect(
      patchMomentsCacheValue(pascalEnvelope([{ ID: 'moment-1', is_approved: false }]), ['moment-1'], {
        is_approved: true,
      })
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ id: 'moment-1', is_approved: true })] },
    })

    expect(
      patchResourceFileCacheValue(pascalEnvelope([{ ID: 'resource-1', view_url: 'old.webp' }]), 'resource-1', {
        view_url: 'new.webp',
      })
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ ID: 'resource-1', view_url: 'new.webp' })] },
    })

    expect(
      patchGuestCacheValue(pascalEnvelope([{ ID: 'guest-1', first_name: 'Old' }]), 'guest-1', {
        first_name: 'New',
      })
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ id: 'guest-1', first_name: 'New' })] },
    })

    expect(
      upsertClientCacheValue(pascalEnvelope([{ ID: 'client-1', name: 'Old' }]), {
        id: 'client-1',
        name: 'New',
      } as Client)
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ id: 'client-1', name: 'New' })] },
    })

    expect(
      patchUserCacheValue(pascalEnvelope([{ ID: 'user-1', email: 'u@example.com', is_active: true }]), 'user-1', {
        is_active: false,
      })
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ id: 'user-1', is_active: false })] },
    })

    expect(
      patchEventCacheValue(pascalEnvelope([{ ID: 'event-1', name: 'Old' }]), 'event-1', {
        name: 'New',
      })
    ).toMatchObject({
      Data: { Items: [expect.objectContaining({ id: 'event-1', name: 'New' })] },
    })
  })

  it('uses Pascal-cased IDs for section order and event config replacement', () => {
    expect(
      reorderEventSectionsCacheValue(
        pascalEnvelope([
          { ID: 'section-1', order: 2 },
          { ID: 'section-2', order: 1 },
        ]),
        [{ id: 'section-1', order: 0 }]
      )
    ).toMatchObject({
      Data: {
        Items: [
          expect.objectContaining({ ID: 'section-1', order: 0 }),
          expect.objectContaining({ ID: 'section-2', order: 1 }),
        ],
      },
    })

    expect(
      upsertEventSectionCacheValue(pascalEnvelope([{ ID: 'section-1', order: 0, is_visible: true }]), {
        ID: 'section-1',
        is_visible: false,
      } as unknown as EventSection)
    ).toMatchObject({
      Data: {
        Items: [expect.objectContaining({ ID: 'section-1', is_visible: false })],
      },
    })

    expect(
      replaceEventConfigCacheValue(undefined, {
        EventID: 'event-1',
        is_public: true,
      } as unknown as EventConfig)
    ).toMatchObject({
      event_id: 'event-1',
      is_public: true,
    })
  })
})
