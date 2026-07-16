import { backendBaseUrlForHostname, tenantCodeForHostname, tenantForHostname, tenantPresentationForHostname } from '@/lib/tenant-config'
import { describe, expect, it } from 'vitest'

describe('tenant configuration', () => {
  it('binds each production hostname to a separate Cognito audience', () => {
    const env = {
      COGNITO_EVENTIAPP_CLIENT_ID: 'eventi-client',
      COGNITO_ITBEM_CLIENT_ID: 'itbem-client',
      COGNITO_CAFETTONHOUSE_CLIENT_ID: 'cafetton-client',
    }
    expect(tenantForHostname('dashboard.eventiapp.com.mx', env).clientId).toBe('eventi-client')
    expect(tenantForHostname('dashboard.itbem.com.mx', env).clientId).toBe('itbem-client')
    expect(tenantForHostname('dashboard.cafettonhouse.com', env).clientId).toBe('cafetton-client')
  })

  it('keeps the multitenant modules on the ITBEM entry point', () => {
    expect(tenantCodeForHostname('DASHBOARD.ITBEM.COM:443')).toBe('itbem')
    expect(tenantPresentationForHostname('dashboard.itbem.com').modules).toEqual(['home', 'events', 'users', 'organizations'])
  })

  it('limits organization switching in the Cafetton House app', () => {
    expect(tenantPresentationForHostname('dashboard.cafettonhouse.com').modules).not.toContain('organizations')
  })

  it('supports all local apps without editing the hosts file', () => {
    expect(tenantCodeForHostname('dashboard.eventiapp.localhost:3000')).toBe('eventiapp')
    expect(tenantCodeForHostname('dashboard.itbem.localhost:3000')).toBe('itbem')
    expect(tenantCodeForHostname('dashboard.cafettonhouse.localhost:3000')).toBe('cafettonhouse')
  })

  it('fails closed for unknown custom domains', () => {
    expect(() => tenantCodeForHostname('malicious.example.com')).toThrow(/Unknown dashboard hostname/)
  })

  it('routes each production app to its branded API and keeps local on one server', () => {
    expect(backendBaseUrlForHostname('dashboard.itbem.com.mx', 'http://localhost:8080')).toBe('https://api.itbem.com.mx')
    expect(backendBaseUrlForHostname('dashboard.cafettonhouse.com', 'http://localhost:8080')).toBe('https://api.cafettonhouse.com')
    expect(backendBaseUrlForHostname('dashboard.itbem.localhost', 'http://localhost:8080/')).toBe('http://localhost:8080')
  })

  it('fails closed when no app client is configured', () => {
    expect(() => tenantForHostname('dashboard.itbem.com', {})).toThrow(/Missing Cognito app client/)
  })
})
