import { describe, expect, it } from 'vitest'
import { assertStorageStateTarget, storageStateTargetIssues } from '../e2e/fixtures/auth-state-target'

const itbemOrigin = 'http://dashboard.itbem.localhost:3017'

describe('Playwright auth storage target guard', () => {
  it('allows the configured dashboard plus an external Cognito origin', () => {
    expect(
      storageStateTargetIssues(
        {
          origins: [
            { origin: itbemOrigin },
            { origin: 'https://stagingauth.eventiapp.com.mx' },
          ],
          cookies: [{ domain: 'dashboard.itbem.localhost' }],
        },
        itbemOrigin,
      ),
    ).toEqual([])
  })

  it('rejects the stale localhost session from the other dashboard', () => {
    const state = {
      origins: [
        { origin: 'http://localhost:3000' },
        { origin: 'https://stagingauth.eventiapp.com.mx' },
      ],
      cookies: [{ domain: 'localhost' }, { domain: 'stagingauth.eventiapp.com.mx' }],
    }

    expect(storageStateTargetIssues(state, itbemOrigin)).toEqual([
      'local storage origin http://localhost:3000 does not match http://dashboard.itbem.localhost:3017',
      'local cookie domain localhost does not match dashboard.itbem.localhost',
      'storage state has no session scoped to http://dashboard.itbem.localhost:3017',
    ])
    expect(() => assertStorageStateTarget(state, itbemOrigin)).toThrow(/cross-tenant/)
  })

  it('rejects a state that contains only external authentication data', () => {
    expect(
      storageStateTargetIssues(
        { origins: [{ origin: 'https://stagingauth.eventiapp.com.mx' }] },
        itbemOrigin,
      ),
    ).toEqual([`storage state has no session scoped to ${itbemOrigin}`])
  })

  it('rejects a broad localhost parent cookie that could cross tenants', () => {
    expect(
      storageStateTargetIssues(
        { origins: [{ origin: itbemOrigin }], cookies: [{ domain: '.localhost' }] },
        itbemOrigin,
      ),
    ).toEqual(['local cookie domain .localhost does not match dashboard.itbem.localhost'])
  })

  it('supports a plain localhost target when explicitly configured', () => {
    expect(
      storageStateTargetIssues(
        { origins: [{ origin: 'http://localhost:3000' }], cookies: [{ domain: 'localhost' }] },
        'http://localhost:3000',
      ),
    ).toEqual([])
  })
})
