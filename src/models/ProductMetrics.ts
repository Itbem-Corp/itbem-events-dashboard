export interface ProductMetricSummary {
  tenant_code: string
  client_id: string
  client_name: string
  requests: number
  mutations: number
  errors: number
  duration_ms: number
  request_bytes: number
  active_users: number
}

export interface ProductMetricTotal {
  tenant_code: string
  active_users: number
}

export interface ProductMetricDailyPoint {
  day: string
  tenant_code: string
  requests: number
  mutations: number
  errors: number
  duration_ms: number
  request_bytes: number
  active_users: number
}

export interface ProductMetricsPortfolio {
  from: string
  to: string
  summaries: ProductMetricSummary[]
  timeline: ProductMetricDailyPoint[]
  /**
   * Distinct active users per product over the window (one COUNT(DISTINCT)
   * per tenant). Sent by the backend from fix/core-admin-mutation-guards on;
   * older APIs omit it and the page labels the per-organization sum.
   */
  product_totals?: ProductMetricTotal[]
  inventory: {
    organizations: number
    users: number
    events: number
  }
}
