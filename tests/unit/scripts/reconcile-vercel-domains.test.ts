import { describe, expect, it, vi } from 'vitest'

import { configuredDomains, reconcileDomains } from '../../../scripts/reconcile-vercel-domains.mjs'

const env = {
  VERCEL_TOKEN: 'token',
  VERCEL_ORG_ID: 'team',
  VERCEL_PROJECT_ID: 'project',
  VERCEL_PRODUCTION_DOMAINS: 'dashboard.eventiapp.com.mx',
}

describe('Vercel domain reconciliation', () => {
  it('normalizes and deduplicates configured domains', () => {
    expect(configuredDomains(' Dashboard.EventiApp.com.mx, dashboard.eventiapp.com.mx ')).toEqual([
      'dashboard.eventiapp.com.mx',
    ])
  })

  it('fails closed when an attached domain is not verified', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ verified: false }), { status: 200 }))
    await expect(reconcileDomains({ env, fetchImpl, logger: { log: vi.fn() } })).rejects.toThrow(/not verified/)
  })

  it('accepts an attached and verified domain', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ verified: true }), { status: 200 }))
    await expect(reconcileDomains({ env, fetchImpl, logger: { log: vi.fn() } })).resolves.toBeUndefined()
  })
})
