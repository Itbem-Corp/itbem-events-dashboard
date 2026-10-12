import {
  canManageClientMember,
  isPlatformRootAccount,
  isPrimaryRootAccount,
  memberAccessDenialMessage,
} from '@/lib/member-management'
import { describe, expect, it } from 'vitest'

const assignable = new Set(['role-editor', 'role-member', 'role-checkin'])
const owner = { id: 'me', is_root: false }

function denial(reason: string) {
  return { response: { status: 403, data: { status: 403, message: 'Permission Denied', error: reason } } }
}

describe('isPrimaryRootAccount', () => {
  it('treats root_level 1 and the legacy is_root shape as Root 1', () => {
    expect(isPrimaryRootAccount({ root_level: 1 })).toBe(true)
    expect(isPrimaryRootAccount({ root_level: 1, is_root: false })).toBe(true)
    expect(isPrimaryRootAccount({ is_root: true })).toBe(true)
    expect(isPrimaryRootAccount({ is_root: true, root_level: 0 })).toBe(true)
  })

  it('does not treat Root 2 or regular users as Root 1', () => {
    expect(isPrimaryRootAccount({ is_root: true, root_level: 2 })).toBe(false)
    expect(isPrimaryRootAccount({ is_root: false })).toBe(false)
    expect(isPrimaryRootAccount(null)).toBe(false)
  })

  it('isPlatformRootAccount covers both root levels', () => {
    expect(isPlatformRootAccount({ root_level: 2 })).toBe(true)
    expect(isPlatformRootAccount({ is_root: true })).toBe(true)
    expect(isPlatformRootAccount({ is_root: false })).toBe(false)
  })
})

describe('canManageClientMember', () => {
  it('allows a member ranked below the caller (assignable role)', () => {
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-editor', role_code: 'EDITOR' },
        assignableRoleIds: assignable,
        requester: owner,
      })
    ).toBe(true)
  })

  it('hides actions for equal or higher roles (not assignable)', () => {
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-admin', role_code: 'ADMIN' },
        assignableRoleIds: assignable,
        requester: owner,
      })
    ).toBe(false)
  })

  it('never offers Owner rows, by code or by name, nor inherited access', () => {
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-member', role_code: 'Owner' },
        assignableRoleIds: assignable,
        requester: { id: 'root', is_root: true, root_level: 1 },
      })
    ).toBe(false)
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-member', role_name: 'owner' },
        assignableRoleIds: assignable,
        requester: owner,
      })
    ).toBe(false)
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-member', role_code: 'INHERITED_ADMIN' },
        assignableRoleIds: assignable,
        requester: owner,
      })
    ).toBe(false)
  })

  it('hides self-management for organization managers but not for platform roots', () => {
    const self = { user_id: 'me', role_id: 'role-member', role_code: 'MEMBER' }
    expect(canManageClientMember({ member: self, assignableRoleIds: assignable, requester: owner })).toBe(false)
    expect(
      canManageClientMember({
        member: self,
        assignableRoleIds: assignable,
        requester: { id: 'me', is_root: true, root_level: 1 },
      })
    ).toBe(true)
  })

  it('accepts a plain array of role ids', () => {
    expect(
      canManageClientMember({
        member: { user_id: 'u2', role_id: 'role-member' },
        assignableRoleIds: ['role-member'],
        requester: owner,
      })
    ).toBe(true)
  })
})

describe('memberAccessDenialMessage', () => {
  it('maps the backend hierarchy denials to Spanish', () => {
    expect(
      memberAccessDenialMessage(
        denial('permission denied: you cannot change the access of a member with equal or higher hierarchy')
      )
    ).toContain('rol igual o superior al tuyo')
    expect(
      memberAccessDenialMessage(denial("permission denied: the organization owner's access cannot be changed"))
    ).toBe('El acceso del Propietario de la organización no se puede cambiar.')
    expect(
      memberAccessDenialMessage(denial('permission denied: platform-root accounts are managed only by a primary root'))
    ).toBe('Las cuentas de plataforma solo las administra un Root 1.')
    expect(memberAccessDenialMessage(denial('Operational roots cannot modify platform-root accounts'))).toBe(
      'Las cuentas de plataforma solo las administra un Root 1.'
    )
    expect(
      memberAccessDenialMessage(denial('permission denied: you cannot assign a role equal or higher than your own'))
    ).toBe('No puedes asignar un rol igual o superior al tuyo.')
  })

  it('returns null for unrelated errors', () => {
    expect(memberAccessDenialMessage(denial('something else'))).toBeNull()
    expect(memberAccessDenialMessage(new Error('Network Error'))).toBeNull()
    expect(memberAccessDenialMessage(undefined)).toBeNull()
  })
})
