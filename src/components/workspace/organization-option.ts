export interface OrganizationOption {
  id: string
  name: string
  code: string
  logo?: string
  access_role?: string
  client_type?: { code: string }
}
