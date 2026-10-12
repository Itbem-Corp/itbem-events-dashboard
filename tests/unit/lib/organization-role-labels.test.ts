// @vitest-environment node
import { organizationRoleLabel } from '@/lib/organization-role-labels'
import { describe, expect, it } from 'vitest'

// QA ROLES-89: the members modal showed "Owner, Administrator, Event manager…".
describe('organizationRoleLabel', () => {
  it('translates codes and English catalog names', () => {
    expect(organizationRoleLabel('OWNER', 'Owner')).toBe('Propietario')
    expect(organizationRoleLabel(undefined, 'Administrator')).toBe('Administrador')
    expect(organizationRoleLabel('EVENT_MANAGER', 'Event manager')).toBe('Gestor de eventos')
    expect(organizationRoleLabel(null, 'Event manager')).toBe('Gestor de eventos')
    expect(organizationRoleLabel('INHERITED_ANALYST')).toBe('Analista')
    expect(organizationRoleLabel('VIEWER', 'Viewer')).toBe('Solo lectura')
  })

  it('falls back to the given name for unknown roles', () => {
    expect(organizationRoleLabel('CUSTOM', 'Coordinación local')).toBe('Coordinación local')
    expect(organizationRoleLabel(undefined, undefined)).toBe('Miembro')
  })
})
