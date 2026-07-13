import {
  isEventSectionsCacheKey,
  removeEventSectionCacheValue,
  reorderEventSectionsCacheValue,
  upsertEventSectionCacheValue,
} from '@/lib/event-section-cache'
import type { EventSection } from '@/models/EventSection'
import { describe, expect, it } from 'vitest'

function section(id: string, patch: Partial<EventSection> = {}): EventSection {
  return {
    id,
    event_id: 'event-1',
    created_at: '2026-03-01T12:00:00.000Z',
    updated_at: '2026-03-01T12:00:00.000Z',
    name: `Section ${id}`,
    component_type: 'MomentWall',
    order: 1,
    is_visible: true,
    config: { title: `Title ${id}` },
    ...patch,
  }
}

describe('isEventSectionsCacheKey', () => {
  it('matches only the exact event sections key', () => {
    expect(isEventSectionsCacheKey('/events/event-1/sections', 'event-1')).toBe(true)
    expect(isEventSectionsCacheKey('/events/event-1/config', 'event-1')).toBe(false)
    expect(isEventSectionsCacheKey('/events/event-2/sections', 'event-1')).toBe(false)
  })
})

describe('upsertEventSectionCacheValue', () => {
  it('upserts sections in direct arrays', () => {
    expect(upsertEventSectionCacheValue([section('section-a')], section('section-b', { order: 2 }))).toEqual([
      section('section-a'),
      section('section-b', { order: 2 }),
    ])
  })

  it('keeps upserted sections sorted by render order', () => {
    expect(
      upsertEventSectionCacheValue(
        [section('section-c', { order: 3 }), section('section-a', { order: 1 })],
        section('section-b', { order: 2 })
      )
    ).toEqual([
      section('section-a', { order: 1 }),
      section('section-b', { order: 2 }),
      section('section-c', { order: 3 }),
    ])

    expect(
      upsertEventSectionCacheValue(
        [section('section-a', { order: 1 }), section('section-b', { order: 2 })],
        section('section-b', { order: 0 })
      )
    ).toEqual([section('section-b', { order: 0 }), section('section-a', { order: 1 })])
  })

  it('merges backend updates without dropping config aliases', () => {
    expect(
      upsertEventSectionCacheValue(
        [
          section('section-a', {
            config: { title: 'Original' },
            content_json: { title: 'Legacy' },
          }),
        ],
        section('section-a', { is_visible: false, config: undefined })
      )
    ).toEqual([
      section('section-a', {
        is_visible: false,
        config: { title: 'Original' },
        content_json: { title: 'Legacy' },
      }),
    ])
  })

  it('normalizes aliased section fields when inserting into empty caches', () => {
    const result = upsertEventSectionCacheValue(undefined, {
      ID: 'section-a',
      EventID: 'event-1',
      Key: 'agenda-main',
      Name: 'Agenda',
      ComponentType: 'AgendaSection',
      Config: '{"title":"Programa"}',
      Order: '3',
      IsVisible: false,
    } as unknown as EventSection) as EventSection[]

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'section-a',
      event_id: 'event-1',
      key: 'agenda-main',
      name: 'Agenda',
      component_type: 'AgendaSection',
      order: 3,
      is_visible: false,
      config: { title: 'Programa' },
    })
  })

  it('normalizes Pascal EventSection fields when inserting into empty caches', () => {
    const result = upsertEventSectionCacheValue(undefined, {
      ID: 'section-pascal',
      EventID: 'event-1',
      Key: 'rsvp-main',
      Title: 'Confirmacion',
      ComponentType: 'RSVPConfirmation',
      ContentJSON: '{"welcome_message":"Hola"}',
      SortOrder: '5',
      IsVisible: false,
    } as unknown as EventSection) as EventSection[]

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'section-pascal',
      event_id: 'event-1',
      key: 'rsvp-main',
      name: 'Confirmacion',
      title: 'Confirmacion',
      component_type: 'RSVPConfirmation',
      order: 5,
      is_visible: false,
      content_json: { welcome_message: 'Hola' },
    })
  })

  it('falls back to section aliases when canonical fields are blank', () => {
    const result = upsertEventSectionCacheValue(undefined, {
      id: ' ',
      ID: 'section-alias',
      event_id: ' ',
      EventID: 'event-1',
      key: ' ',
      Key: 'agenda-main',
      name: ' ',
      Name: 'Agenda',
      title: ' ',
      Title: 'Programa',
      component_type: ' ',
      ComponentType: 'AgendaSection',
      type: ' ',
      Type: 'AgendaSection',
      order: ' ',
      SortOrder: '7',
      is_visible: ' ',
      IsVisible: false,
      config: ' ',
      Config: { title: 'Programa' },
      content_json: ' ',
      ContentJSON: { subtitle: 'Itinerario' },
    } as unknown as EventSection) as EventSection[]

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'section-alias',
      event_id: 'event-1',
      key: 'agenda-main',
      name: 'Agenda',
      title: 'Programa',
      component_type: 'AgendaSection',
      type: 'AgendaSection',
      order: 7,
      is_visible: false,
      config: { title: 'Programa' },
      content_json: { subtitle: 'Itinerario' },
    })
  })

  it('normalizes aliased section fields when merging partial updates', () => {
    const result = upsertEventSectionCacheValue([section('section-a')], {
      id: 'section-a',
      componentType: 'LegacyGallery',
      contentJson: '{"subtitle":"Fotos"}',
      sortOrder: '2',
      isVisible: 'false',
    } as unknown as EventSection) as EventSection[]

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'section-a',
      component_type: 'LegacyGallery',
      order: 2,
      is_visible: false,
      config: { title: 'Title section-a' },
      content_json: { subtitle: 'Fotos' },
    })
  })

  it('allows empty Config aliases to clear stale canonical config', () => {
    const result = upsertEventSectionCacheValue([section('section-a', { config: { title: 'Old' } })], {
      id: 'section-a',
      Config: {},
    } as unknown as EventSection) as EventSection[]

    expect(result[0]?.config).toEqual({})
  })

  it('preserves envelope metadata and adjusts totals when inserting', () => {
    expect(
      upsertEventSectionCacheValue(
        {
          status: 200,
          message: 'Sections loaded',
          data: { items: [section('section-a')], total: 1 },
        },
        section('section-b', { order: 2 })
      )
    ).toEqual({
      status: 200,
      message: 'Sections loaded',
      data: { items: [section('section-a'), section('section-b', { order: 2 })], total: 2 },
    })
  })

  it('preserves Pascal-cased envelope metadata and totals when inserting', () => {
    expect(
      upsertEventSectionCacheValue(
        {
          Status: 200,
          Message: 'Sections loaded',
          Data: { Items: [section('section-a')], Total: 1 },
        },
        section('section-b', { order: 2 })
      )
    ).toEqual({
      Status: 200,
      Message: 'Sections loaded',
      Data: { Items: [section('section-a'), section('section-b', { order: 2 })], Total: 2 },
    })
  })

  it('updates the effective Data alias when canonical data is null', () => {
    expect(
      upsertEventSectionCacheValue(
        {
          Status: 200,
          Message: 'Sections loaded',
          data: null,
          Data: { Items: [section('section-a')], Total: 1 },
        },
        section('section-b', { order: 2 })
      )
    ).toEqual({
      Status: 200,
      Message: 'Sections loaded',
      data: null,
      Data: { Items: [section('section-a'), section('section-b', { order: 2 })], Total: 2 },
    })
  })

  it('updates non-empty section list aliases before empty canonical list aliases', () => {
    expect(
      upsertEventSectionCacheValue(
        {
          status: 200,
          message: 'Sections loaded',
          data: {
            data: [],
            Items: [section('section-a')],
            Total: 1,
          },
        },
        section('section-b', { order: 2 })
      )
    ).toMatchObject({
      data: {
        data: [],
        Items: [
          expect.objectContaining({ id: 'section-a' }),
          expect.objectContaining({ id: 'section-b' }),
        ],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data section pages before empty canonical containers', () => {
    expect(
      upsertEventSectionCacheValue(
        {
          data: { items: [] },
          Data: { Items: [section('section-a')], Total: 1 },
        },
        section('section-b', { order: 2 })
      )
    ).toEqual({
      data: { items: [] },
      Data: { Items: [section('section-a'), section('section-b', { order: 2 })], Total: 2 },
    })
  })

  it('seeds empty or envelope-only caches', () => {
    expect(upsertEventSectionCacheValue(undefined, section('section-a'))).toEqual([section('section-a')])
    expect(upsertEventSectionCacheValue({ status: 200, message: 'No data loaded' }, section('section-a'))).toEqual({
      status: 200,
      message: 'No data loaded',
      data: [section('section-a')],
    })
    expect(upsertEventSectionCacheValue({ Status: 200, Message: 'No data loaded' }, section('section-a'))).toEqual({
      Status: 200,
      Message: 'No data loaded',
      Data: [section('section-a')],
    })
  })
})

describe('removeEventSectionCacheValue', () => {
  it('removes sections from direct arrays', () => {
    expect(removeEventSectionCacheValue([section('section-a'), section('section-b')], 'section-a')).toEqual([
      section('section-b'),
    ])
  })

  it('preserves envelope metadata and adjusts totals when removing', () => {
    expect(
      removeEventSectionCacheValue(
        {
          status: 200,
          message: 'Sections loaded',
          data: { items: [section('section-a'), section('section-b')], total: 2 },
        },
        'section-b'
      )
    ).toEqual({
      status: 200,
      message: 'Sections loaded',
      data: { items: [section('section-a')], total: 1 },
    })
  })

  it('preserves Pascal-cased envelope metadata and adjusts totals when removing', () => {
    expect(
      removeEventSectionCacheValue(
        {
          Status: 200,
          Message: 'Sections loaded',
          Data: { Items: [section('section-a'), section('section-b')], Total: 2 },
        },
        'section-b'
      )
    ).toEqual({
      Status: 200,
      Message: 'Sections loaded',
      Data: { Items: [section('section-a')], Total: 1 },
    })
  })

  it('removes from useful direct Data section pages before empty canonical containers', () => {
    expect(
      removeEventSectionCacheValue(
        {
          data: { items: [] },
          Data: { Items: [section('section-a'), section('section-b')], Total: 2 },
        },
        'section-b'
      )
    ).toEqual({
      data: { items: [] },
      Data: { Items: [section('section-a')], Total: 1 },
    })
  })
})

describe('reorderEventSectionsCacheValue', () => {
  it('updates orders and keeps sections sorted by the public render order', () => {
    expect(
      reorderEventSectionsCacheValue(
        [section('section-a', { order: 1 }), section('section-b', { order: 2 }), section('section-c', { order: 3 })],
        [
          { id: 'section-a', order: 3 },
          { id: 'section-c', order: 1 },
        ]
      )
    ).toEqual([
      section('section-c', { order: 1 }),
      section('section-b', { order: 2 }),
      section('section-a', { order: 3 }),
    ])
  })

  it('uses section id as a stable tie-break when orders match', () => {
    expect(
      reorderEventSectionsCacheValue(
        [section('section-c', { order: 1 }), section('section-a', { order: 2 }), section('section-b', { order: 3 })],
        [
          { id: 'section-c', order: 2 },
          { id: 'section-a', order: 2 },
          { id: 'section-b', order: 2 },
        ]
      )
    ).toEqual([
      section('section-a', { order: 2 }),
      section('section-b', { order: 2 }),
      section('section-c', { order: 2 }),
    ])
  })

  it('works with envelope list payloads', () => {
    expect(
      reorderEventSectionsCacheValue(
        {
          status: 200,
          message: 'Sections loaded',
          data: { data: [section('section-a', { order: 1 }), section('section-b', { order: 2 })], total: 2 },
        },
        [
          { id: 'section-a', order: 2 },
          { id: 'section-b', order: 1 },
        ]
      )
    ).toEqual({
      status: 200,
      message: 'Sections loaded',
      data: { data: [section('section-b', { order: 1 }), section('section-a', { order: 2 })], total: 2 },
    })
  })
})
