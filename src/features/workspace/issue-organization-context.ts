import { issueOrganizationContextCredential } from '@/lib/api'
import type { OrganizationContextCredential } from '@/lib/request-context'

// The credential exchange lives next to the API client so the request
// interceptor and the workspace selector share one in-flight issuance per
// organization (see ensureOrganizationContext in src/lib/api.ts).
export function issueOrganizationContext(organizationId: string): Promise<OrganizationContextCredential> {
  return issueOrganizationContextCredential(organizationId)
}
