import type { AccessProfile } from '@/lib/access-profile'
import { organizationWorkspaceCopy } from '@/features/workspace/workspace-copy'
import { describe, expect, it } from 'vitest'

const profile = (overrides: Partial<AccessProfile>): AccessProfile =>
  ({
    isPlatformContext: false,
    isOrganizationContext: true,
    platformLevel: null,
    organizationRole: null,
    ...overrides,
  }) as AccessProfile

describe('organizationWorkspaceCopy', () => {
  it('prioritizes root scope over the organization role', () => {
    expect(organizationWorkspaceCopy(profile({ platformLevel: 'root_2', organizationRole: 'OWNER' }), 'Acme')).toEqual({
      eyebrow: 'Soporte operativo',
      title: 'Acme',
      description: 'Asistencia a invitados, check-in y analítica sin cambios estructurales.',
    })
  })

  it('maps an organization role to its product language', () => {
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'INHERITED_CHECKIN' }))).toMatchObject({
      eyebrow: 'Operación de acceso',
      title: 'Check-in sin fricción',
    })
  })

  it('keeps the original Admin and read-only eyebrows without localized role labels (Cafetton, ITBEM)', () => {
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'Admin' })).eyebrow).toBe('Administración')
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'GUEST' })).eyebrow).toBe('Vista de consulta')
  })

  it('names the role in the eyebrow with localized role labels (EventiApp)', () => {
    const options = { localizedRoleLabels: true }
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'Admin' }), 'Acme', options).eyebrow).toBe(
      'Administrador'
    )
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'INHERITED_ADMIN' }), 'Acme', options).eyebrow).toBe(
      'Administrador'
    )
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'GUEST' }), 'Acme', options).eyebrow).toBe(
      'Solo lectura'
    )
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'VIEWER' }), 'Acme', options).eyebrow).toBe(
      'Solo lectura'
    )
    // Unknown roles keep the neutral eyebrow.
    expect(organizationWorkspaceCopy(profile({ organizationRole: undefined }), 'Acme', options).eyebrow).toBe(
      'Vista de consulta'
    )
  })
})
