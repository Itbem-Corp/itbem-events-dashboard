export interface ClientMemberUser {
  id: string
  first_name: string
  last_name: string
  email: string
  profile_image?: string
  is_active?: boolean
}

export interface ClientMember {
  id: string
  user_id: string
  client_id: string
  first_name?: string
  last_name?: string
  email?: string
  profile_image?: string
  role_id: string
  role_code?: string
  role?: string
  role_name?: string
  joined_at?: string
  user?: ClientMemberUser
}

export interface ClientMemberLinkResponse {
  user_id: string
  client_id: string
  role_id: string
  email?: string
}

export interface ClientMembersPage {
  data: ClientMember[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ClientMemberApplicationAccess {
  code: string
  name: string
  is_active: boolean
  is_enabled: boolean
}
