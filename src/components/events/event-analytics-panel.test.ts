import { describe, expect, it } from 'vitest'
import { normalizeEventAnalyticsPayload } from './event-analytics-panel'

describe('normalizeEventAnalyticsPayload performance metrics', () => {
  it('keeps bounded numeric percentile data and rejects malformed rows', () => {
    const analytics = normalizeEventAnalyticsPayload({
      status: 200,
      message: 'Analytics loaded',
      data: {
        event_id: 'event-1',
        guests: {},
        performance: [
          {
            route: 'event', metric: 'lcp', sample_count: 42,
            average: 1825.4, minimum: 320, maximum: 6200,
            p75: 2500, p95: 4000, rating: 'good',
          },
          { route: '', metric: 'inp', p75: 200 },
        ],
      },
    })

    expect(analytics?.performance).toEqual([
      {
        route: 'event', metric: 'lcp', sample_count: 42,
        average: 1825.4, minimum: 320, maximum: 6200,
        p75: 2500, p95: 4000, rating: 'good',
      },
    ])
  })
})
