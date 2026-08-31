import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { cleanupEphemeralAuthState, localAuthTargets, requireEphemeralIDToken } from '../../e2e/fixtures/local-auth'

describe('ephemeral local E2E authentication', () => {
  it('accepts only loopback dashboard and backend URLs', () => {
    expect(localAuthTargets('http://dashboard.itbem.localhost:3000', 'http://127.0.0.1:8081')).toMatchObject({
      dashboard: { hostname: 'dashboard.itbem.localhost' },
      backend: { hostname: '127.0.0.1' },
    })
  })

  const credentialBearingDashboard = new URL('http://localhost:3000')
  credentialBearingDashboard.username = 'fixture-user'
  credentialBearingDashboard.password = 'fixture-password'

  it.each([
    ['https://dashboard.example.com', 'http://127.0.0.1:8081'],
    ['http://localhost:3000', 'https://api.example.com'],
    [credentialBearingDashboard.toString(), 'http://127.0.0.1:8081'],
    ['http://localhost:3000?unsafe=1', 'http://127.0.0.1:8081'],
  ])('rejects non-isolated targets: %s / %s', (dashboard, backend) => {
    expect(() => localAuthTargets(dashboard, backend)).toThrow(/loopback/)
  })

  it('validates compact JWT shape without exposing its value', () => {
    expect(requireEphemeralIDToken('header.payload.signature')).toBe('header.payload.signature')
    expect(() => requireEphemeralIDToken('not-a-jwt')).toThrow('non-empty compact JWT')
  })

  it('removes only ephemeral auth state during teardown', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'itbem-auth-state-'))
    const authFile = path.join(directory, 'session.json')
    fs.writeFileSync(authFile, 'sensitive')
    expect(cleanupEphemeralAuthState(undefined, authFile)).toBe(false)
    expect(fs.existsSync(authFile)).toBe(true)
    expect(cleanupEphemeralAuthState('header.payload.signature', authFile)).toBe(true)
    expect(fs.existsSync(authFile)).toBe(false)
    fs.rmSync(directory, { recursive: true, force: true })
  })
})
