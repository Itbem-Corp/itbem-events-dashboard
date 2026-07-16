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

export interface ApplicationSession {
  application: ApplicationDefinition
  user: UserProfileResponse
  organizations: ApplicationOrganization[]
  capabilities: string[]
}
