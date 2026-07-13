import { describe, expect, it } from 'vitest'
import {
  isApiEnvelope,
  mapApiList,
  mapApiListItems,
  readApiData,
  readApiList,
  readApiListPage,
  withApiData,
} from '@/lib/api-envelope'

describe('api-envelope', () => {
  it('unwraps backend APIResponse payloads', () => {
    const payload = {
      status: 200,
      message: 'ok',
      data: [{ id: 'event-1' }],
    }

    expect(isApiEnvelope(payload)).toBe(true)
    expect(readApiData(payload)).toEqual([{ id: 'event-1' }])
  })

  it('unwraps Pascal-cased APIResponse payloads from adapters', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      Data: { Items: [{ id: 'event-1' }], Total: 1 },
    }

    expect(isApiEnvelope(payload)).toBe(true)
    expect(readApiData(payload)).toEqual({ Items: [{ id: 'event-1' }], Total: 1 })
    expect(readApiList(payload)).toEqual([{ id: 'event-1' }])
  })

  it('uses defined envelope data aliases before null canonical keys', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      data: null,
      Data: { id: 'event-1' },
    }

    expect(readApiData(payload)).toEqual({ id: 'event-1' })
  })

  it('uses defined envelope data aliases before blank canonical keys', () => {
    expect(
      readApiData({
        Status: 200,
        Message: 'ok',
        data: ' ',
        Data: { id: 'event-1' },
      })
    ).toEqual({ id: 'event-1' })

    expect(
      readApiData({
        status: 200,
        message: 'ok',
        data: ' ',
      })
    ).toBe(' ')
  })

  it('uses defined envelope data aliases before empty canonical array keys', () => {
    expect(
      readApiData({
        Status: 200,
        Message: 'ok',
        data: [],
        Data: { Items: [{ id: 'event-1' }] },
      })
    ).toEqual({ Items: [{ id: 'event-1' }] })

    expect(
      readApiData({
        status: 200,
        message: 'ok',
        data: [],
      })
    ).toEqual([])
  })

  it('uses defined envelope data aliases before empty canonical object keys', () => {
    expect(
      readApiData({
        Status: 200,
        Message: 'ok',
        data: {},
        Data: { id: 'event-1' },
      })
    ).toEqual({ id: 'event-1' })

    expect(
      readApiData({
        status: 200,
        message: 'ok',
        data: {},
      })
    ).toEqual({})
  })

  it('uses useful nested list aliases before empty canonical object list aliases', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      data: { items: [], total: 0 },
      Data: { Items: [{ id: 'event-1' }], Total: 1 },
    }

    expect(readApiData(payload)).toEqual({ Items: [{ id: 'event-1' }], Total: 1 })
    expect(readApiList(payload)).toEqual([{ id: 'event-1' }])
  })

  it('unwraps backend APIResponse payloads when data is omitted', () => {
    const payload = {
      status: 200,
      message: 'deleted',
    }

    expect(isApiEnvelope(payload)).toBe(true)
    expect(readApiData(payload)).toBeUndefined()
  })

  it('does not unwrap direct paginated payloads with their own data field', () => {
    const payload = {
      data: [{ id: 'moment-1' }],
      total: 1,
    }

    expect(isApiEnvelope(payload)).toBe(false)
    expect(readApiData(payload)).toBe(payload)
  })

  it('does not unwrap direct domain payloads with data and message fields but no HTTP status', () => {
    const payload = {
      data: [{ id: 'moment-1' }],
      message: 'domain metadata',
      total: 1,
    }

    expect(isApiEnvelope(payload)).toBe(false)
    expect(readApiData(payload)).toBe(payload)
    expect(readApiList(payload)).toEqual([{ id: 'moment-1' }])
  })

  it('returns direct payloads unchanged', () => {
    const payload = { id: 'client-1', name: 'ITBEM' }

    expect(readApiData(payload)).toBe(payload)
  })

  it('writes mapped data back using the original envelope data key', () => {
    expect(withApiData({ status: 200, data: { id: 'event-1' } }, { id: 'event-2' })).toEqual({
      status: 200,
      data: { id: 'event-2' },
    })
    expect(withApiData({ Status: 200, Message: 'ok', Data: { id: 'event-1' } }, { id: 'event-2' })).toEqual({
      Status: 200,
      Message: 'ok',
      Data: { id: 'event-2' },
    })
  })

  it('does not unwrap direct domain objects that have numeric status fields', () => {
    const payload = { id: 'job-1', status: 1 }

    expect(isApiEnvelope(payload)).toBe(false)
    expect(readApiData(payload)).toBe(payload)
  })

  it('does not unwrap domain payloads with non-HTTP numeric status fields', () => {
    const payload = {
      id: 'job-1',
      status: 1,
      message: 'queued',
      data: [{ id: 'step-1' }],
    }

    expect(isApiEnvelope(payload)).toBe(false)
    expect(readApiData(payload)).toBe(payload)
  })

  it('reads arrays from direct, paginated, and enveloped list payloads', () => {
    const direct = [{ id: 'guest-1' }]
    const paginated = { data: [{ id: 'guest-2' }], total: 1 }
    const enveloped = { status: 200, message: 'ok', data: [{ id: 'guest-3' }] }
    const envelopedPaginated = {
      status: 200,
      message: 'ok',
      data: { data: [{ id: 'guest-4' }], total: 1 },
    }
    const itemsPage = { items: [{ id: 'guest-5' }], total: 1 }
    const envelopedItemsPage = {
      status: 200,
      message: 'ok',
      data: { items: [{ id: 'guest-6' }], total: 1 },
    }

    expect(readApiList(direct)).toEqual([{ id: 'guest-1' }])
    expect(readApiList(paginated)).toEqual([{ id: 'guest-2' }])
    expect(readApiList(enveloped)).toEqual([{ id: 'guest-3' }])
    expect(readApiList(envelopedPaginated)).toEqual([{ id: 'guest-4' }])
    expect(readApiList(itemsPage)).toEqual([{ id: 'guest-5' }])
    expect(readApiList(envelopedItemsPage)).toEqual([{ id: 'guest-6' }])
    expect(readApiList({ Data: [{ id: 'guest-7' }], Total: 1 })).toEqual([{ id: 'guest-7' }])
    expect(readApiList({ Items: [{ id: 'guest-8' }], Total: 1 })).toEqual([{ id: 'guest-8' }])
  })

  it('reads useful nested direct list aliases before empty canonical containers', () => {
    expect(
      readApiList({
        data: {},
        Data: { Items: [{ id: 'guest-1' }], Total: 1 },
      })
    ).toEqual([{ id: 'guest-1' }])

    expect(
      readApiList({
        data: { items: [] },
        Data: { Items: [{ id: 'guest-2' }], Total: 1 },
      })
    ).toEqual([{ id: 'guest-2' }])
  })

  it('returns the effective list page source with the selected items', () => {
    const payload = {
      data: { items: [], total: 0 },
      Data: { Items: [{ id: 'guest-1' }], Total: 1 },
    }

    expect(readApiListPage(payload)).toEqual({
      data: payload,
      source: payload.Data,
      items: [{ id: 'guest-1' }],
    })
  })

  it('supports domain-specific list aliases when selecting list pages', () => {
    const payload = {
      Status: 200,
      Message: 'Resources loaded',
      data: { resources: [] },
      Data: { Resources: [{ id: 'resource-1' }], Total: 1 },
    }

    expect(readApiListPage(payload, { listKeys: ['resources', 'Resources'] })).toEqual({
      data: payload.Data,
      source: payload.Data,
      items: [{ id: 'resource-1' }],
    })
  })

  it('uses non-empty list aliases before empty canonical list aliases', () => {
    expect(
      readApiList({
        data: [],
        Items: [{ id: 'guest-1' }],
        total: 1,
      })
    ).toEqual([{ id: 'guest-1' }])
  })

  it('returns an empty array when a list payload is absent or malformed', () => {
    expect(readApiList(undefined)).toEqual([])
    expect(readApiList({ data: null })).toEqual([])
    expect(readApiList({ id: 'event-1' })).toEqual([])
  })

  it('maps direct, paginated, and enveloped list payloads without dropping metadata', () => {
    const patch = (item: { id: string; is_active: boolean }) =>
      item.id === 'user-1' ? { ...item, is_active: false } : item

    expect(mapApiList([{ id: 'user-1', is_active: true }], patch)).toEqual([{ id: 'user-1', is_active: false }])
    expect(mapApiList({ data: [{ id: 'user-1', is_active: true }], total: 1, page: 1 }, patch)).toEqual({
      data: [{ id: 'user-1', is_active: false }],
      total: 1,
      page: 1,
    })
    expect(
      mapApiList(
        {
          status: 200,
          message: 'ok',
          data: { data: [{ id: 'user-1', is_active: true }], total_pages: 1 },
        },
        patch
      )
    ).toEqual({
      status: 200,
      message: 'ok',
      data: { data: [{ id: 'user-1', is_active: false }], total_pages: 1 },
    })
    expect(mapApiList({ items: [{ id: 'user-1', is_active: true }], total: 1 }, patch)).toEqual({
      items: [{ id: 'user-1', is_active: false }],
      total: 1,
    })
    expect(
      mapApiList(
        {
          status: 200,
          message: 'ok',
          data: { items: [{ id: 'user-1', is_active: true }], total: 1 },
        },
        patch
      )
    ).toEqual({
      status: 200,
      message: 'ok',
      data: { items: [{ id: 'user-1', is_active: false }], total: 1 },
    })
    expect(
      mapApiList(
        {
          Status: 200,
          Message: 'ok',
          Data: { Items: [{ id: 'user-1', is_active: true }], Total: 1 },
        },
        patch
      )
    ).toEqual({
      Status: 200,
      Message: 'ok',
      Data: { Items: [{ id: 'user-1', is_active: false }], Total: 1 },
    })
    expect(
      mapApiList(
        {
          status: 200,
          message: 'ok',
          data: { items: [] },
          Data: { Items: [{ id: 'user-1', is_active: true }], Total: 1 },
        },
        patch
      )
    ).toEqual({
      status: 200,
      message: 'ok',
      data: { items: [] },
      Data: { Items: [{ id: 'user-1', is_active: false }], Total: 1 },
    })
  })

  it('maps whole list payloads and adjusts totals at the effective list container', () => {
    expect(
      mapApiListItems(
        {
          data: { items: [] },
          Data: { Items: [{ id: 'section-1' }], Total: 1 },
        },
        (items: Array<{ id: string }>) => [...items, { id: 'section-2' }],
        { adjustTotal: true }
      )
    ).toEqual({
      data: { items: [] },
      Data: { Items: [{ id: 'section-1' }, { id: 'section-2' }], Total: 2 },
    })
  })
})
