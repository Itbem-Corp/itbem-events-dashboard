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
})
