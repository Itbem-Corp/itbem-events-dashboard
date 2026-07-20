import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { organizationContextPath } from '@/lib/api-paths'
import type { OrganizationContextCredential } from '@/lib/request-context'

interface OrganizationContextResponse {
  token: string
  organization_id: string
  expires_at: string
}

const pendingByOrganization = new Map<string, Promise<OrganizationContextCredential>>()

export function issueOrganizationContext(organizationId: string): Promise<OrganizationContextCredential> {
  const pending = pendingByOrganization.get(organizationId)
  if (pending) return pending

  const request = api
    .post(organizationContextPath(), { organization_id: organizationId })
    .then((response) => {
      const context = readApiData<OrganizationContextResponse>(response.data)
      if (!context?.token || context.organization_id !== organizationId || !context.expires_at) {
        throw new Error('The organization context response is incomplete')
      }
      return {
        token: context.token,
        organizationId: context.organization_id,
        expiresAt: context.expires_at,
      }
    })
    .finally(() => pendingByOrganization.delete(organizationId))

  pendingByOrganization.set(organizationId, request)
  return request
}
