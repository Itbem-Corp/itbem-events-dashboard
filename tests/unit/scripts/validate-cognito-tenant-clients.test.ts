import { describe, expect, it } from 'vitest'

import { validateTenantClientIds } from '../../../scripts/validate-cognito-tenant-clients.mjs'

const valid = {
  COGNITO_EVENTIAPP_CLIENT_ID: 'a'.repeat(26),
  COGNITO_ITBEM_CLIENT_ID: 'b'.repeat(26),
  COGNITO_CAFETTONHOUSE_CLIENT_ID: 'c'.repeat(26),
}

describe('tenant Cognito client validation', () => {
  it('accepts three valid distinct clients', () => {
    expect(validateTenantClientIds(valid)).toEqual(valid)
  })

  it('rejects a shared client across tenant entry points', () => {
    expect(() => validateTenantClientIds({
      ...valid,
      COGNITO_ITBEM_CLIENT_ID: valid.COGNITO_EVENTIAPP_CLIENT_ID,
    })).toThrow(/distinct/)
  })

  it('rejects malformed client IDs', () => {
    expect(() => validateTenantClientIds({
      ...valid,
      COGNITO_ITBEM_CLIENT_ID: 'not-a-client',
    })).toThrow(/valid Cognito app client ID/)
  })
})
