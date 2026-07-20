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
      { hostname: 'dashboard.eventiapp.com.mx', brand: 'EventiApp', apiOrigin: 'https://api.eventiapp.com.mx' },
      { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM', apiOrigin: 'https://api.itbem.com.mx' },
      { hostname: 'dashboard.itbem.com', brand: 'ITBEM', apiOrigin: 'https://api.itbem.com.mx' },
      { hostname: 'dashboard.cafettonhouse.com', brand: 'Cafetton House', apiOrigin: 'https://api.cafettonhouse.com' },
    ])
  })

  it('accepts a correctly branded login with its own API CSP boundary', () => {
    expect(() =>
      validateLoginResponse(
        { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM', apiOrigin: 'https://api.itbem.com.mx' },
        response({
          'content-security-policy':
            "default-src 'self'; connect-src 'self' https://api.itbem.com.mx; frame-ancestors 'none'",
        }),
        '<html><title>ITBEM</title></html>',
      ),
    ).not.toThrow()
  })

  it('fails when the assigned API origin disappears from CSP', () => {
    expect(() =>
      validateLoginResponse(
        { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM', apiOrigin: 'https://api.itbem.com.mx' },
        response({
          'content-security-policy':
            "default-src 'self'; connect-src 'self' https://api.eventiapp.com.mx; frame-ancestors 'none'",
        }),
        '<html><title>ITBEM</title></html>',
      ),
    ).toThrow(/api\.itbem\.com\.mx/)
  })

  it('fails when a product login can connect to another product API', () => {
    expect(() =>
      validateLoginResponse(
        { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM', apiOrigin: 'https://api.itbem.com.mx' },
        response({
          'content-security-policy':
            "default-src 'self'; connect-src 'self' https://api.itbem.com.mx https://api.eventiapp.com.mx; frame-ancestors 'none'",
        }),
        '<html><title>ITBEM</title></html>',
      ),
    ).toThrow(/must not allow another product API/)
  })
})
