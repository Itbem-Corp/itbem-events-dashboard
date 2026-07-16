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
  inventory: {
    organizations: number
    users: number
    events: number
  }
}
