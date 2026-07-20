import { describe, expect, it } from 'vitest'
import { organizationContextHeaders, requestContextHeaders, requestPathFromKey, scopedFetcherKey } from '@/lib/request-context'

const context = { tenantCode: 'itbem', workspaceMode: 'organization', organizationId: 'org-7' } as const

describe('application request context', () => {
  it('isolates identical paths by tenant and organization in SWR', () => {
    expect(scopedFetcherKey('/users?page=1', context)).toEqual([
      '/users?page=1',
      'itbem',
      'organization',
      'org-7',
    ])
    expect(requestPathFromKey(scopedFetcherKey('/users?page=1', context)!)).toBe('/users?page=1')
  })

  it('provides the backend with explicit, auditable scope headers', () => {
    expect(requestContextHeaders(context)).toEqual({
      'X-Application-Code': 'itbem',
      'X-Workspace-Mode': 'organization',
      'X-Organization-ID': 'org-7',
    })
  })

  it('does not leak a retained organization into platform requests', () => {
    expect(requestContextHeaders({ ...context, workspaceMode: 'platform' })).toEqual({
      'X-Application-Code': 'itbem',
      'X-Workspace-Mode': 'platform',
    })
  })

  it('sends only hostname-derived application scope before session resolution', () => {
    expect(requestContextHeaders({ ...context, workspaceMode: 'platform' }, { sessionResolved: false })).toEqual({
      'X-Application-Code': 'itbem',
    })
  })

  it('sends a valid organization credential only for its exact context', () => {
    const credential = { token: 'signed', organizationId: 'org-7', expiresAt: '2099-01-01T00:00:00Z' }
    expect(organizationContextHeaders(context, credential, 0)).toEqual({ 'X-Organization-Context': 'signed' })
    expect(organizationContextHeaders({ ...context, organizationId: 'org-8' }, credential, 0)).toEqual({})
    expect(organizationContextHeaders({ ...context, workspaceMode: 'platform' }, credential, 0)).toEqual({})
  })

  it('stops sending a credential before it expires', () => {
    const expiresAt = new Date(20_000).toISOString()
    expect(organizationContextHeaders(context, { token: 'signed', organizationId: 'org-7', expiresAt }, 5_001)).toEqual({})
  })
})
