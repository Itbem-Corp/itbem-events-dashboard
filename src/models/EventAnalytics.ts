export interface EventAnalytics {
  id: string
  event_id: string
  views: number
  rsvp_confirmed: number
  rsvp_declined: number
  moment_uploads: number
  moment_comments: number
  created_at?: string
  updated_at?: string
}
