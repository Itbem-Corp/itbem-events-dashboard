import { describe, expect, it } from 'vitest'

import {
  momentSummaryPathsForEventIds,
  momentSummaryPendingMap,
  normalizeMomentSummaryList,
} from '@/lib/moment-summary'

describe('moment summary helpers', () => {
  it('normalizes backend envelopes and casing variants', () => {
    expect(
      normalizeMomentSummaryList({
        Status: 200,
        Message: 'Moment summaries loaded',
        Data: [
          { EventID: 'event-1', PendingCount: '2' },
          { eventId: 'event-2', pendingCount: -3 },
        ],
      })
    ).toEqual([
      { event_id: 'event-1', pending_count: 2 },
      { event_id: 'event-2', pending_count: 0 },
    ])
  })

  it('builds a pending count map from multiple batch payloads', () => {
    expect(
      momentSummaryPendingMap([
        [{ event_id: 'event-1', pending_count: 1 }],
        { data: { items: [{ EventID: 'event-2', PendingCount: 4 }] } },
      ])
    ).toEqual({
      'event-1': 1,
      'event-2': 4,
    })
  })

  it('chunks event ids to match the backend summary limit', () => {
    expect(momentSummaryPathsForEventIds(['event-1', 'event-2', 'event-1', '', null], 1)).toEqual([
      '/moments/summary?event_ids=event-1',
      '/moments/summary?event_ids=event-2',
    ])
  })
})
