import type { AccessProfile } from '@/lib/access-profile'
import { operationalRootSupportCopy, organizationWorkspaceCopy } from '@/features/workspace/workspace-copy'
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

// QA ROLES-119 / ROLES-85: ITBEM and Cafetton House have no events module.
describe('product-aware workspace copy', () => {
  it('never talks about events for products without the events module', () => {
    for (const role of ['OWNER', 'EVENT_MANAGER', 'EDITOR', 'CHECKIN', 'ANALYST', 'MEMBER', 'VIEWER']) {
      const copy = organizationWorkspaceCopy(profile({ organizationRole: role }), undefined, { productHasEvents: false })
      expect(`${copy.eyebrow} ${copy.title} ${copy.description}`).not.toMatch(/evento|invitado/i)
    }
    const root = organizationWorkspaceCopy(profile({ platformLevel: 'root_2' }), 'Acme', { productHasEvents: false })
    expect(root.description).not.toMatch(/invitado|check-in/i)
  })

  it('keeps the event language for EventiApp', () => {
    expect(organizationWorkspaceCopy(profile({ organizationRole: 'MEMBER' })).title).toBe('Tus eventos asignados')
  })

  it('only promises user support where the product has a users module', () => {
    expect(operationalRootSupportCopy({ productHasEvents: true, productHasUsers: false })).toMatch(
      /^Este nivel puede asistir invitados y check-in\./
    )
    expect(operationalRootSupportCopy({ productHasEvents: false, productHasUsers: true })).toMatch(
      /^Este nivel puede asistir usuarios\. Los usuarios root/
    )
  })
})
