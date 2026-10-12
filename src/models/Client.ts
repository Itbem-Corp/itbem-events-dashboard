import { BaseEntity } from './BaseEntity'
import { ClientType } from './ClientType'

export interface Client extends BaseEntity {
  name: string
  code: string
  address?: string
  phone?: string
  logo?: string
  website?: string
  is_active?: boolean
  /** Rol directo del usuario autenticado en esta organización. */
  access_role?: string
  /**
   * In a user's memberships list: true when the access comes from a membership
   * in a parent organization (access_role INHERITED_*), not a direct one.
   */
  inherited?: boolean

  // Relations
  client_type_id: string
  client_type?: ClientType
  parent_id?: string
  parent?: ClientSummary
  children?: ClientSummary[]
}

export interface ClientSummary extends BaseEntity {
  name: string
  code: string
  logo?: string
  is_active?: boolean
  access_role?: string
  client_type_id: string
  client_type?: ClientType
  parent_id?: string
}

export interface ClientsPageResponse {
  data: Client[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
