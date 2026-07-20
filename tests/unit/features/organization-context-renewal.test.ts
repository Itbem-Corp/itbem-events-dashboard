import { organizationContextRefreshDelay } from '@/features/workspace/use-organization-context-renewal'
import { describe, expect, it } from 'vitest'

describe('organization context renewal', () => {
  it('renews forty-five seconds before expiration', () => {
    expect(organizationContextRefreshDelay(new Date(300_000).toISOString(), 0)).toBe(255_000)
  })

  it('renews immediately when missing, invalid, or already inside the safety window', () => {
    expect(organizationContextRefreshDelay(undefined, 0)).toBe(0)
    expect(organizationContextRefreshDelay('invalid', 0)).toBe(0)
    expect(organizationContextRefreshDelay(new Date(30_000).toISOString(), 0)).toBe(0)
  })
})
