// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  activeUsersLabel,
  dailyActivitySeries,
  formatMetricDay,
  productMetricRows,
  scopePortfolioToProduct,
} from '@/features/metrics/product-metrics'
import type { ProductMetricSummary } from '@/models/ProductMetrics'

function row(tenant: string, client: string, activeUsers: number, requests = 10): ProductMetricSummary {
  return {
    tenant_code: tenant,
    client_id: client,
    client_name: client,
    requests,
    mutations: 1,
    errors: 0,
    duration_ms: 100,
    request_bytes: 10,
    active_users: activeUsers,
  }
}

describe('formatMetricDay', () => {
  it('keeps the UTC calendar day whatever the browser zone is', () => {
    expect(formatMetricDay('2026-10-11T00:00:00Z', { day: 'numeric', month: 'short', year: 'numeric' })).toMatch(/11/)
    expect(formatMetricDay('2026-10-11', { day: 'numeric' })).toBe('11')
    expect(formatMetricDay('2026-01-01T00:00:00Z', { day: 'numeric', month: 'numeric' })).toBe('1/1')
  })

  it('returns the raw value when it is not a date', () => {
    expect(formatMetricDay('no-date')).toBe('no-date')
  })
})

describe('productMetricRows', () => {
  const rows = [row('eventiapp', 'org-a', 3), row('eventiapp', 'org-b', 2), row('itbem', 'org-c', 4, 5)]

  it('uses the distinct per-product count when the API sends it', () => {
    const products = productMetricRows(rows, [
      { tenant_code: 'eventiapp', active_users: 4 },
      { tenant_code: 'itbem', active_users: 4 },
    ])
    const eventiapp = products.find((item) => item.tenant_code === 'eventiapp')!
    expect(eventiapp.active_users).toBe(4)
    expect(eventiapp.active_users_is_sum).toBeUndefined()
    expect(activeUsersLabel(eventiapp)).toBe('4 activos')
  })

  it('labels the per-organization sum when the distinct count is missing', () => {
    const eventiapp = productMetricRows(rows).find((item) => item.tenant_code === 'eventiapp')!
    expect(eventiapp.active_users).toBe(5)
    expect(eventiapp.active_users_is_sum).toBe(true)
    expect(activeUsersLabel(eventiapp)).toBe('5 activos (suma por organización)')
  })

  it('sums traffic and sorts by requests', () => {
    const products = productMetricRows(rows)
    expect(products.map((item) => item.tenant_code)).toEqual(['eventiapp', 'itbem'])
    expect(products[0].requests).toBe(20)
  })
})

// QA ROLES-113: an EventiApp organization workspace showed an ITBEM product card.
describe('scopePortfolioToProduct', () => {
  it('keeps only the dashboard product rows', () => {
    const portfolio = {
      from: '2026-10-06',
      to: '2026-10-12',
      summaries: [row('eventiapp', 'org-a', 1), row('itbem', 'org-a', 1)],
      timeline: [
        { day: '2026-10-12', tenant_code: 'eventiapp', requests: 3, mutations: 0, errors: 0, duration_ms: 0, request_bytes: 0, active_users: 1 },
        { day: '2026-10-12', tenant_code: 'itbem', requests: 2, mutations: 0, errors: 0, duration_ms: 0, request_bytes: 0, active_users: 1 },
      ],
      product_totals: [
        { tenant_code: 'eventiapp', active_users: 1 },
        { tenant_code: 'itbem', active_users: 1 },
      ],
      inventory: { organizations: 1, users: 1, events: 1 },
    }
    const scoped = scopePortfolioToProduct(portfolio, 'eventiapp')!
    expect(scoped.summaries.map((item) => item.tenant_code)).toEqual(['eventiapp'])
    expect(scoped.timeline.map((item) => item.tenant_code)).toEqual(['eventiapp'])
    expect(scoped.product_totals?.map((item) => item.tenant_code)).toEqual(['eventiapp'])
    expect(scopePortfolioToProduct(portfolio, undefined)).toBe(portfolio)
  })

  it('labels the product card with the selected organization', () => {
    expect(productMetricRows([row('eventiapp', 'org-a', 1)], null, 'Acme')[0].client_name).toBe('Acme')
  })

  it('uses the singular for one active user', () => {
    expect(activeUsersLabel(productMetricRows([row('eventiapp', 'org-a', 1)], [{ tenant_code: 'eventiapp', active_users: 1 }])[0])).toBe('1 activo')
  })
})

// QA ROLES-112: the axis started at the first data point, not the period start.
describe('dailyActivitySeries', () => {
  it('spans the whole period and fills empty days with zero', () => {
    const series = dailyActivitySeries(
      [
        { day: '2026-10-12T00:00:00Z', requests: 4 },
        { day: '2026-10-12', requests: 1 },
      ],
      '2026-10-06T00:00:00Z',
      '2026-10-12T23:59:59Z'
    )
    expect(series).toHaveLength(7)
    expect(series[0]).toEqual(['2026-10-06', 0])
    expect(series.at(-1)).toEqual(['2026-10-12', 5])
  })

  it('falls back to the data points without a valid period', () => {
    expect(dailyActivitySeries([{ day: '2026-10-12', requests: 2 }], null, 'nope')).toEqual([['2026-10-12', 2]])
  })
})
