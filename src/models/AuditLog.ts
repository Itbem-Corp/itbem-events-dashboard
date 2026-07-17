export interface AuditLog {
  id: string
  occurred_at: string
  actor_user_id?: string
  tenant_code: string
  method: string
  route: string
  resource_type?: string
  resource_id?: string
  status: number
  succeeded: boolean
  request_id: string
  client_ip: string
  user_agent: string
}

export interface AuditLogPage {
  data: AuditLog[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
