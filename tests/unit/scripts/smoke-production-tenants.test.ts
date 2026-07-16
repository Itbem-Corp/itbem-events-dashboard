import { describe, expect, it } from 'vitest'

import {
  configuredTenants,
  validateLoginResponse,
} from '../../../scripts/smoke-production-tenants.mjs'

function response(headers: Record<string, string> = {}) {
  return new Response('', {
    status: 200,
    headers: {
      'cache-control': 'private, no-cache, no-store',
      'content-security-policy':
        "default-src 'self'; connect-src 'self' https://api.eventiapp.com.mx https://api.itbem.com.mx https://api.cafettonhouse.com; frame-ancestors 'none'",
      ...headers,
    },
  })
}

describe('production tenant smoke', () => {
  it('covers every branded production entry point by default', () => {
    expect(configuredTenants(undefined)).toEqual([
      { hostname: 'dashboard.eventiapp.com.mx', brand: 'EventiApp' },
      { hostname: 'dashboard.itbem.com', brand: 'ITBEM' },
      { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM' },
      { hostname: 'dashboard.cafettonhouse.com', brand: 'Cafetton House' },
    ])
  })

  it('accepts a correctly branded login with the complete API CSP boundary', () => {
    expect(() =>
      validateLoginResponse(
        { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM' },
        response(),
        '<html><title>ITBEM</title></html>',
      ),
    ).not.toThrow()
  })

  it('fails when one branded API origin disappears from CSP', () => {
    expect(() =>
      validateLoginResponse(
        { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM' },
        response({
          'content-security-policy':
            "default-src 'self'; connect-src 'self' https://api.eventiapp.com.mx; frame-ancestors 'none'",
        }),
        '<html><title>ITBEM</title></html>',
      ),
    ).toThrow(/api\.itbem\.com\.mx/)
  })
})
