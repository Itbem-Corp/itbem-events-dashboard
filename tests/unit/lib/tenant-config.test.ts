import { tenantCodeForHostname, tenantForHostname, tenantPresentationForHostname } from '@/lib/tenant-config'
import { describe, expect, it } from 'vitest'

describe('tenant configuration', () => {
  it('binds each production hostname to a separate Cognito audience', () => {
    const env = {
      COGNITO_EVENTIAPP_CLIENT_ID: 'eventi-client',
      COGNITO_ITBEM_CLIENT_ID: 'itbem-client',
    }
    expect(tenantForHostname('dashboard.eventiapp.com.mx', env).clientId).toBe('eventi-client')
    expect(tenantForHostname('dashboard.itbem.com', env).clientId).toBe('itbem-client')
  })

  it('exposes only operational modules on the ITBEM entry point', () => {
    expect(tenantCodeForHostname('DASHBOARD.ITBEM.COM:443')).toBe('itbem')
    expect(tenantPresentationForHostname('dashboard.itbem.com').modules).toEqual(['home', 'events'])
  })

  it('fails closed when no app client is configured', () => {
    expect(() => tenantForHostname('dashboard.itbem.com', {})).toThrow(/Missing Cognito app client/)
  })
})
