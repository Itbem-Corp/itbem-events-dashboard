import { describe, expect, it } from 'vitest'

import { validateE2EEnvironment } from '../../../scripts/validate-e2e-environment.mjs'

const valid = {
  E2E_BACKEND_URL: 'https://api.staging.example.com',
  PRODUCTION_BACKEND_URL: 'https://api.example.com',
  COGNITO_AWS_REGION: 'us-east-2',
  COGNITO_USER_POOL_ID: 'us-east-2_example',
  COGNITO_EVENTIAPP_CLIENT_ID: 'a'.repeat(26),
  COGNITO_DOMAIN: 'auth.example.com',
  TEST_EMAIL: 'qa@example.com',
  TEST_PASSWORD: ['fixture', 'value'].join('-'),
}

function credentialBearingURL() {
  const value = new URL('https://api.staging.example.com')
  value.username = 'fixture-user'
  value.password = 'fixture-value'
  return value.toString()
}

describe('authenticated E2E environment validation', () => {
  it('accepts an isolated HTTPS backend', () => {
    expect(validateE2EEnvironment(valid)).toEqual({
      e2eBackend: 'https://api.staging.example.com',
      productionBackend: 'https://api.example.com',
    })
  })

  it('rejects production as the E2E mutation target', () => {
    expect(() => validateE2EEnvironment({
      ...valid,
      E2E_BACKEND_URL: 'https://API.example.com/',
    })).toThrow(/isolated non-production backend/)
  })

  it('rejects a missing secret without echoing another value', () => {
    expect(() => validateE2EEnvironment({ ...valid, TEST_PASSWORD: '' })).toThrow(
      'Missing required E2E configuration: TEST_PASSWORD',
    )
  })

  it.each([
    'http://api.staging.example.com',
    credentialBearingURL(),
    'https://api.staging.example.com?target=production',
  ])('rejects an unsafe E2E URL: %s', value => {
    expect(() => validateE2EEnvironment({ ...valid, E2E_BACKEND_URL: value })).toThrow(/absolute HTTPS URL/)
  })
})
