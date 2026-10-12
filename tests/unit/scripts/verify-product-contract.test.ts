import { describe, expect, it } from 'vitest'

import { verifyProductContract } from '../../../scripts/verify-product-contract.mjs'

const product = {
  code: 'eventiapp',
  identity: { name: 'EventiApp', productLabel: 'Event operations', accent: '#818cf8' },
  deployment: {
    dashboardHostname: 'dashboard.example.test',
    dashboardHostnames: ['dashboard.example.test'],
    localDashboardHostnames: ['localhost'],
    apiHostname: 'api.example.test',
    cognitoClientEnv: 'COGNITO_EVENTIAPP_CLIENT_ID',
    ownedDomains: ['example.test'],
    publicExperience: { enabled: false },
  },
}

const catalog = {
  eventiapp: {
    identity: product.identity,
    deployment: {
      organizationCode: 'eventiapp',
      hostname: 'dashboard.example.test',
      hostnames: ['dashboard.example.test'],
      localHostnames: ['localhost'],
      apiHostname: 'api.example.test',
      clientIdEnv: 'COGNITO_EVENTIAPP_CLIENT_ID',
      ownedDomains: ['example.test'],
      publicExperience: { enabled: false },
    },
  },
}

function requestContext(rules: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    headers: {
      applicationCode: 'X-Application-Code',
      workspaceMode: 'X-Workspace-Mode',
      organizationId: 'X-Organization-ID',
      organizationContext: 'X-Organization-Context',
    },
    workspaceModes: ['organization', 'platform'],
    rules: {
      bootstrapHeaders: ['applicationCode'],
      platformForbidsOrganizationId: true,
      headersAreAuthorization: false,
      ...rules,
    },
  }
}

const callerAccess = requestContext({
  organizationRequiresOrganizationId: false,
  organizationWithoutIdScope: 'caller-access',
})

type VerifyInput = {
  contract: unknown
  catalog: unknown
  requestContext: unknown
  localRequestContext: unknown
}

function verify(overrides: Partial<VerifyInput> = {}) {
  return () =>
    verifyProductContract({
      contract: { schemaVersion: 1, products: [product] },
      catalog,
      requestContext: callerAccess,
      localRequestContext: callerAccess,
      ...overrides,
    })
}

describe('pinned product contract verification', () => {
  it('accepts a pin that declares the caller-access scope the dashboard sends', () => {
    expect(verify()).not.toThrow()
  })

  it('rejects a pin that still requires an organization ID in organization mode', () => {
    // The caller-access workspace sends X-Workspace-Mode: organization with no
    // X-Organization-ID. A contract that forbids it invites a "fix" that would
    // lock members and event clients out (spec D15), so the gate stays red
    // until the contract change is merged and re-pinned.
    const legacy = requestContext({ organizationRequiresOrganizationId: true })
    expect(verify({ requestContext: legacy, localRequestContext: legacy })).toThrow(
      /organizationWithoutIdScope='caller-access'/
    )
  })

  it('rejects a pin that drops the scope name even when the organization ID is optional', () => {
    const unnamed = requestContext({ organizationRequiresOrganizationId: false })
    expect(verify({ requestContext: unnamed, localRequestContext: unnamed })).toThrow(/caller-access/)
  })

  it('rejects a local request-context copy that differs from the pin', () => {
    expect(verify({ localRequestContext: requestContext({ organizationRequiresOrganizationId: true }) })).toThrow(
      /request context must match the pinned product contract/
    )
  })

  it('rejects a catalog that differs from the pinned products', () => {
    expect(
      verify({ catalog: { eventiapp: { ...catalog.eventiapp, identity: { ...product.identity, name: 'Otro' } } } })
    ).toThrow(/catalog must match the pinned product contract/)
  })
})
