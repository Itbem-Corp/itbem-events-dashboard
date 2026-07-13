import { describe, expect, it } from 'vitest'

import { PUBLIC_GUEST_ROLES, isHostGuestRole, normalizePublicGuestRole } from '@/lib/public-guest-roles'

describe('public-guest-roles', () => {
  it('keeps dashboard role values aligned with public attendee filters', () => {
    expect(PUBLIC_GUEST_ROLES.map((role) => role.value)).toEqual([
      'guest',
      'graduate',
      'host',
      'vip',
      'speaker',
      'staff',
    ])
  })

  it('detects host role values before submitting guests', () => {
    expect(isHostGuestRole('host')).toBe(true)
    expect(isHostGuestRole(' HOST ')).toBe(true)
    expect(isHostGuestRole('hosts')).toBe(true)
    expect(isHostGuestRole('co-host')).toBe(true)
    expect(isHostGuestRole('co_hosts')).toBe(true)
    expect(isHostGuestRole('Anfitri\u00f3n')).toBe(true)
    expect(isHostGuestRole('anfitriona')).toBe(true)
    expect(isHostGuestRole('anfitriones')).toBe(true)
    expect(isHostGuestRole('graduate')).toBe(false)
    expect(isHostGuestRole(null)).toBe(false)
  })

  it('normalizes public role aliases like the backend attendee filter', () => {
    expect(normalizePublicGuestRole(' Co-Host ')).toBe('cohost')
    expect(normalizePublicGuestRole('Anfitri\u00f3n')).toBe('anfitrion')
    expect(normalizePublicGuestRole('graduate')).toBe('graduate')
    expect(normalizePublicGuestRole(undefined)).toBe('')
  })
})
