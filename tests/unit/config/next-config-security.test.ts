import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard CSP tenant boundaries', () => {
  it('allows every branded API selected dynamically at runtime', () => {
    const config = fs.readFileSync('next.config.mjs', 'utf8')

    expect(config).toContain('https://api.eventiapp.com.mx')
    expect(config).toContain('https://api.itbem.com.mx')
    expect(config).toContain('https://api.cafettonhouse.com')
    expect(config).toContain("connect-src 'self' ${backendUrl} ${brandedApiSources}")
  })
})
