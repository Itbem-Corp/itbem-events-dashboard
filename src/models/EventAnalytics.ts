export interface EventAnalytics {
  id: string
  event_id: string
  views: number
  rsvp_confirmed: number
  rsvp_declined: number
  moment_uploads: number
  moment_comments: number
  moment_total?: number
  moment_approved?: number
  moment_pending?: number
  created_at?: string
  updated_at?: string
  guests: EventGuestAnalyticsSummary
  performance: PerformanceMetricSummary[]
}

export interface PerformanceMetricSummary {
  route: string
  metric: string
  sample_count: number
  average: number
  minimum: number
  maximum: number
  p75: number
  p95: number
  rating?: 'good' | 'needs_improvement' | 'poor' | string
}

export interface AnalyticsCount { name: string; value: number }
export interface EventGuestAnalyticsSummary {
  total_guests: number
  confirmed: number
  declined: number
  pending: number
  total_companions: number
  estimated_attendees: number
  dietary: AnalyticsCount[]
  methods: AnalyticsCount[]
  roles: AnalyticsCount[]
  tables: AnalyticsCount[]
  timeline: Array<{ date: string; confirmed: number; declined: number }>
  top_companions: Array<{ id: string; first_name: string; last_name: string; role: string; companion_count: number }>
}

export type EventAnalyticsResponse = EventAnalytics
