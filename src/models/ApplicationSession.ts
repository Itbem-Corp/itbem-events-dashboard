import type { Client } from '@/models/Client'
import type { UserProfileResponse } from '@/models/User'
import type { TenantModule } from '@/lib/tenant-config'

export interface ApplicationDefinition {
  id: string
  code: string
  name: string
  product_label: string
  modules: TenantModule[]
  allows_platform_admin: boolean
  is_active: boolean
}

export interface ApplicationOrganization
  extends Pick<Client, 'id' | 'name' | 'code' | 'logo' | 'access_role'> {
  capabilities: string[]
}

/**
 * Event-level access granted directly to the user (event clients). Present
 * only when the backend has EVENT_CLIENT_ACCESS on, the product has events,
 * the user is not a root and holds an active grant. Absent or null means no
 * grants, so the dashboard behaves exactly as before.
 */
export interface ApplicationEventAccess {
  assigned_events: number
  capabilities: string[]
}

export interface ApplicationSession {
  application: ApplicationDefinition
  user: UserProfileResponse
  organizations: ApplicationOrganization[]
  /** Top-level union; already includes event_access.capabilities. */
  capabilities: string[]
  event_access?: ApplicationEventAccess | null
}
