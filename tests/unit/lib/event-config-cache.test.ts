import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  isEventConfigCacheKey,
  patchEventConfigIntoEventCacheValue,
  replaceEventConfigCacheValue,
} from '@/lib/event-config-cache'
import type { EventConfig } from '@/models/EventConfig'
import { describe, expect, it } from 'vitest'

function config(patch: Partial<EventConfig> = {}): EventConfig {
  return {
    id: 'event-1',
    event_id: 'event-1',
    created_at: '2026-03-01T12:00:00.000Z',
    updated_at: '2026-03-01T12:00:00.000Z',
    is_public: true,
    show_header: true,
    ...patch,
  }
}

describe('isEventConfigCacheKey', () => {
  it('matches only the exact event config key', () => {
    expect(isEventConfigCacheKey('/events/event-1/config', 'event-1')).toBe(true)
    expect(isEventConfigCacheKey('/events/event-1/detail', 'event-1')).toBe(false)
    expect(isEventConfigCacheKey('/events/event-2/config', 'event-1')).toBe(false)
  })
})

describe('isEventConfigBackedEventCacheKey', () => {
  it('matches event list and detail keys that carry nested event_config data', () => {
    expect(isEventConfigBackedEventCacheKey('/events', 'event-1')).toBe(true)
    expect(isEventConfigBackedEventCacheKey('/events?client_id=client-1', 'event-1')).toBe(true)
    expect(isEventConfigBackedEventCacheKey('/events/event-1/detail', 'event-1')).toBe(true)
    expect(isEventConfigBackedEventCacheKey('/events/event-1/config', 'event-1')).toBe(false)
  })
})

describe('hasEventConfigCacheIdentity', () => {
  it('accepts backend and adapter identity aliases', () => {
    expect(hasEventConfigCacheIdentity({ id: 'cfg-1' } as EventConfig)).toBe(true)
    expect(hasEventConfigCacheIdentity({ event_id: 'event-1' } as EventConfig)).toBe(true)
    expect(hasEventConfigCacheIdentity({ ID: 'cfg-1' } as unknown as EventConfig)).toBe(true)
    expect(hasEventConfigCacheIdentity({ EventID: 'event-1' } as unknown as EventConfig)).toBe(true)
    expect(hasEventConfigCacheIdentity({ EventId: 'event-1' } as unknown as EventConfig)).toBe(true)
    expect(hasEventConfigCacheIdentity({} as EventConfig)).toBe(false)
    expect(hasEventConfigCacheIdentity(null)).toBe(false)
  })
})

describe('patchEventConfigIntoEventCacheValue', () => {
  it('patches nested event config aliases in event list caches', () => {
    const result = patchEventConfigIntoEventCacheValue(
      [
        config({ event_id: 'event-1', is_public: false, show_header: true }),
        config({ id: 'event-2', event_id: 'event-2', is_public: false }),
      ].map((eventConfig) => ({
        id: eventConfig.event_id,
        name: eventConfig.event_id,
        event_config: eventConfig,
        config: eventConfig,
      })),
      'event-1',
      {
        ID: 'event-1',
        EventID: 'event-1',
        IsPublic: true,
        ShowHeader: false,
      } as unknown as EventConfig
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 'event-1',
        event_config: expect.objectContaining({
          id: 'event-1',
          event_id: 'event-1',
          is_public: true,
          show_header: false,
        }),
        config: expect.objectContaining({
          id: 'event-1',
          event_id: 'event-1',
          is_public: true,
          show_header: false,
        }),
      }),
      expect.objectContaining({
        id: 'event-2',
        event_config: expect.objectContaining({ event_id: 'event-2', is_public: false }),
      }),
    ])
  })

  it('leaves event caches unchanged when the backend response has no config identity', () => {
    const current = { id: 'event-1', name: 'Evento' }

    expect(patchEventConfigIntoEventCacheValue(current, 'event-1', {} as EventConfig)).toBe(current)
  })
})

describe('replaceEventConfigCacheValue', () => {
  it('replaces direct config payloads with the backend reloaded config', () => {
    expect(
      replaceEventConfigCacheValue(
        config({ show_header: true, design_template_id: 'old-template' }),
        config({ show_header: false, design_template_id: 'new-template' })
      )
    ).toEqual(config({ show_header: false, design_template_id: 'new-template' }))
  })

  it('preserves backend envelope metadata', () => {
    expect(
      replaceEventConfigCacheValue(
        {
          status: 200,
          message: 'Event config loaded',
          data: config({ show_header: true }),
        },
        config({ show_header: false, visibility_configured: true })
      )
    ).toEqual({
      status: 200,
      message: 'Event config loaded',
      data: config({ show_header: false, visibility_configured: true }),
    })
  })

  it('preserves Pascal-cased adapter envelope metadata', () => {
    expect(
      replaceEventConfigCacheValue(
        {
          Status: 200,
          Message: 'Event config loaded',
          Data: config({ show_header: true }),
        },
        config({ show_header: false })
      )
    ).toEqual({
      Status: 200,
      Message: 'Event config loaded',
      Data: config({ show_header: false }),
    })
  })

  it('updates the effective Data alias when canonical data is null', () => {
    expect(
      replaceEventConfigCacheValue(
        {
          Status: 200,
          Message: 'Event config loaded',
          data: null,
          Data: config({ show_header: true }),
        },
        config({ show_header: false })
      )
    ).toEqual({
      Status: 200,
      Message: 'Event config loaded',
      data: null,
      Data: config({ show_header: false }),
    })
  })

  it('normalizes raw Go config fields before replacing cache data', () => {
    expect(
      replaceEventConfigCacheValue(config({ show_header: true, design_template_id: 'old-template' }), {
        ID: 'event-1',
        EventID: 'event-1',
        ShowHeader: false,
        DesignTemplateID: 'new-template',
      } as unknown as EventConfig)
    ).toEqual(config({ show_header: false, design_template_id: 'new-template' }))
  })

  it('seeds Pascal-cased envelope-only payloads without adding lowercase data', () => {
    expect(
      replaceEventConfigCacheValue(
        {
          Status: 200,
          Message: 'Event config loaded',
        },
        config({ show_header: false })
      )
    ).toEqual({
      Status: 200,
      Message: 'Event config loaded',
      Data: config({ show_header: false }),
    })
  })

  it('keeps the current payload when the backend response has no config identity', () => {
    const current = config({ show_header: true })

    expect(replaceEventConfigCacheValue(current, undefined)).toBe(current)
    expect(replaceEventConfigCacheValue(current, {} as EventConfig)).toBe(current)
  })
})
