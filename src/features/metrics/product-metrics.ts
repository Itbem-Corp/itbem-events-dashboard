import type { ProductMetricSummary, ProductMetricTotal, ProductMetricsPortfolio } from '@/models/ProductMetrics'

export type ProductMetricRow = ProductMetricSummary & {
  /**
   * True when active_users is the sum of each organization's distinct users:
   * a person active in two organizations counts twice. Used only while the
   * API does not send product_totals.
   */
  active_users_is_sum?: boolean
}

/**
 * Groups organization rows into one row per product. When the API sends the
 * distinct per-product count (product_totals) it replaces the sum.
 */
export function productMetricRows(
  rows: ProductMetricSummary[],
  productTotals?: ProductMetricTotal[] | null,
  scopeLabel = 'Todas las organizaciones'
): ProductMetricRow[] {
  const distinctActiveUsers = new Map<string, number>()
  for (const total of productTotals ?? []) {
    if (total && typeof total.active_users === 'number' && Number.isFinite(total.active_users)) {
      distinctActiveUsers.set(total.tenant_code, total.active_users)
    }
  }
  const grouped = new Map<string, ProductMetricRow>()
  for (const row of rows) {
    const current = grouped.get(row.tenant_code) ?? {
      tenant_code: row.tenant_code,
      client_id: row.tenant_code,
      client_name: scopeLabel,
      requests: 0,
      mutations: 0,
      errors: 0,
      duration_ms: 0,
      request_bytes: 0,
      active_users: 0,
    }
    current.requests += row.requests
    current.mutations += row.mutations
    current.errors += row.errors
    current.duration_ms += row.duration_ms
    current.request_bytes += row.request_bytes
    current.active_users += row.active_users
    grouped.set(row.tenant_code, current)
  }
  for (const row of grouped.values()) {
    const distinct = distinctActiveUsers.get(row.tenant_code)
    if (distinct !== undefined) row.active_users = distinct
    else row.active_users_is_sum = true
  }
  return [...grouped.values()].sort((left, right) => right.requests - left.requests)
}

export function activeUsersLabel(row: ProductMetricRow): string {
  const count = `${row.active_users.toLocaleString('es-MX')} ${row.active_users === 1 ? 'activo' : 'activos'}`
  return row.active_users_is_sum ? `${count} (suma por organización)` : count
}

/**
 * An organization workspace belongs to one product (the dashboard's host), so
 * its metrics must not show another product's traffic for the same
 * organization. Platform portfolios keep every product.
 */
export function scopePortfolioToProduct(
  portfolio: ProductMetricsPortfolio | undefined,
  productCode: string | null | undefined
): ProductMetricsPortfolio | undefined {
  if (!portfolio || !productCode) return portfolio
  const matches = (row: { tenant_code: string }) => row.tenant_code === productCode
  return {
    ...portfolio,
    summaries: (portfolio.summaries ?? []).filter(matches),
    timeline: (portfolio.timeline ?? []).filter(matches),
    product_totals: portfolio.product_totals?.filter(matches),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SERIES_DAYS = 366

function utcDayKey(value: string): string | null {
  const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
  const date = new Date(plainDate)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/**
 * Requests per UTC day across the whole selected period, with empty days as 0,
 * so the chart axis starts at the period start instead of the first data point.
 */
export function dailyActivitySeries(
  timeline: Array<{ day: string; requests: number }>,
  from?: string | null,
  to?: string | null
): Array<[string, number]> {
  const byDay = new Map<string, number>()
  for (const point of timeline) {
    const key = utcDayKey(point.day)
    if (key) byDay.set(key, (byDay.get(key) ?? 0) + point.requests)
  }
  const start = from ? utcDayKey(from) : null
  const end = to ? utcDayKey(to) : null
  if (!start || !end || start > end) {
    return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))
  }
  const series: Array<[string, number]> = []
  const endTime = Date.parse(`${end}T00:00:00Z`)
  for (
    let time = Date.parse(`${start}T00:00:00Z`);
    time <= endTime && series.length < MAX_SERIES_DAYS;
    time += DAY_MS
  ) {
    const key = new Date(time).toISOString().slice(0, 10)
    series.push([key, byDay.get(key) ?? 0])
  }
  return series
}

/**
 * Daily points are UTC-midnight timestamps (or plain YYYY-MM-DD). Formatting
 * them in the browser's zone shows the previous day west of UTC, so the label
 * is always rendered in UTC.
 */
export function formatMetricDay(day: string, options: Intl.DateTimeFormatOptions = {}): string {
  const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00Z` : day
  const date = new Date(plainDate)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('es-MX', { ...options, timeZone: 'UTC' })
}
