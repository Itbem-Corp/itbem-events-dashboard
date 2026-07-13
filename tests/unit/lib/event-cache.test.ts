import {
  findEventInListCache,
  isEventCacheKey,
  patchEventCacheValue,
  removeEventCacheValue,
  upsertEventCacheValue,
} from '@/lib/event-cache'
import type { Event } from '@/models/Event'
import { describe, expect, it } from 'vitest'

describe('isEventCacheKey', () => {
  it('matches event lists and the protected event detail only', () => {
    expect(isEventCacheKey('/events', 'evt-1')).toBe(true)
    expect(isEventCacheKey('/events?client_id=client-1', 'evt-1')).toBe(true)
    expect(isEventCacheKey('/events/evt-1/detail', 'evt-1')).toBe(true)

    expect(isEventCacheKey('/events/evt-1/config', 'evt-1')).toBe(false)
    expect(isEventCacheKey('/events/evt-1/sections', 'evt-1')).toBe(false)
    expect(isEventCacheKey('/events/evt-1/analytics', 'evt-1')).toBe(false)
    expect(isEventCacheKey('/event-types', 'evt-1')).toBe(false)
  })
})

describe('findEventInListCache', () => {
  it('reuses a scoped list snapshot from the SWR cache', () => {
    const cache = new Map<unknown, unknown>([
      ['/events?client_id=client-1', { data: [{ id: 'evt-1', name: 'Evento inmediato' }] }],
      [['moment-summaries'], { data: [] }],
    ])

    expect(findEventInListCache(cache, 'evt-1')).toEqual({ id: 'evt-1', name: 'Evento inmediato' })
    expect(findEventInListCache(cache, 'missing')).toBeUndefined()
  })
})

describe('patchEventCacheValue', () => {
  it('patches direct event arrays', () => {
    expect(
      patchEventCacheValue(
        [
          { id: 'evt-1', is_active: true },
          { id: 'evt-2', is_active: true },
        ],
        'evt-1',
        { is_active: false }
      )
    ).toEqual([
      { id: 'evt-1', is_active: false },
      { id: 'evt-2', is_active: true },
    ])
  })

  it('normalizes backend aliases when patching event cache records', () => {
    expect(
      patchEventCacheValue(
        [
          {
            ID: 'evt-1',
            Name: 'Evento',
            CoverImageURL: 'events/evt-1/old.webp',
          },
        ],
        'evt-1',
        {
          CoverImageURL: 'events/evt-1/new.webp',
          CoverViewURL: 'https://signed.example.com/new.webp',
          ViewURL: 'https://signed.example.com/new.webp',
          ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
        } as unknown as Partial<Event>
      )
    ).toEqual([
      {
        id: 'evt-1',
        name: 'Evento',
        cover_image_url: 'events/evt-1/new.webp',
        cover_view_url: 'https://signed.example.com/new.webp',
        view_url: 'https://signed.example.com/new.webp',
        view_url_expires_at: '2026-03-01T12:05:00.000Z',
      },
    ])
  })

  it('patches backend envelopes without dropping metadata', () => {
    expect(
      patchEventCacheValue(
        {
          status: 200,
          message: 'Events loaded',
          data: { data: [{ id: 'evt-1', is_active: true }], total: 1 },
        },
        'evt-1',
        { is_active: false }
      )
    ).toEqual({
      status: 200,
      message: 'Events loaded',
      data: { data: [{ id: 'evt-1', is_active: false }], total: 1 },
    })
  })

  it('preserves Pascal-cased backend event list envelopes', () => {
    expect(
      patchEventCacheValue(
        {
          Status: 200,
          Message: 'Events loaded',
          Data: { Items: [{ id: 'evt-1', is_active: true }], Total: 1 },
        },
        'evt-1',
        { is_active: false }
      )
    ).toEqual({
      Status: 200,
      Message: 'Events loaded',
      Data: { Items: [{ id: 'evt-1', is_active: false }], Total: 1 },
    })
  })

  it('patches useful direct Data event pages before empty canonical containers', () => {
    expect(
      patchEventCacheValue(
        {
          data: { items: [] },
          Data: {
            Items: [
              { id: 'evt-1', is_active: true },
              { id: 'evt-2', is_active: true },
            ],
            Total: 2,
          },
        },
        'evt-2',
        { is_active: false }
      )
    ).toEqual({
      data: { items: [] },
      Data: {
        Items: [
          { id: 'evt-1', is_active: true },
          { id: 'evt-2', is_active: false },
        ],
        Total: 2,
      },
    })
  })

  it('patches direct and enveloped event detail payloads', () => {
    expect(patchEventCacheValue({ id: 'evt-1', is_active: true }, 'evt-1', { is_active: false })).toEqual({
      id: 'evt-1',
      is_active: false,
    })

    expect(
      patchEventCacheValue({ status: 200, data: { id: 'evt-1', is_active: true } }, 'evt-1', { is_active: false })
    ).toEqual({ status: 200, data: { id: 'evt-1', is_active: false } })

    expect(
      patchEventCacheValue({ Status: 200, Data: { id: 'evt-1', is_active: true } }, 'evt-1', { is_active: false })
    ).toEqual({ Status: 200, Data: { id: 'evt-1', is_active: false } })
  })
})

describe('removeEventCacheValue', () => {
  it('removes an event from paginated envelopes and adjusts the total', () => {
    expect(
      removeEventCacheValue(
        {
          status: 200,
          data: {
            data: [
              { id: 'evt-1', name: 'Primero' },
              { id: 'evt-2', name: 'Segundo' },
            ],
            total: 7,
          },
        },
        'evt-1'
      )
    ).toEqual({
      status: 200,
      data: {
        data: [{ id: 'evt-2', name: 'Segundo' }],
        total: 6,
      },
    })
  })
})

describe('upsertEventCacheValue', () => {
  it('inserts a created event and adjusts a paginated total', () => {
    expect(
      upsertEventCacheValue(
        { status: 200, data: { data: [{ id: 'evt-1', name: 'Primero' }], total: 1 } },
        { id: 'evt-2', name: 'Segundo' } as Event
      )
    ).toEqual({
      status: 200,
      data: { data: [{ id: 'evt-1', name: 'Primero' }, { id: 'evt-2', name: 'Segundo' }], total: 2 },
    })
  })

  it('merges an edited event without changing the total', () => {
    expect(
      upsertEventCacheValue(
        { data: [{ id: 'evt-1', name: 'Antes', identifier: 'estable' }], total: 1 },
        { id: 'evt-1', name: 'Después' } as Event
      )
    ).toEqual({ data: [{ id: 'evt-1', name: 'Después', identifier: 'estable' }], total: 1 })
  })
})
