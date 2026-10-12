// @vitest-environment node

import { eventRoleLabel, organizationRoleLabel } from '@/lib/role-labels'
import { describe, expect, it } from 'vitest'

describe('organizationRoleLabel', () => {
  it.each([
    ['OWNER', 'Propietario'],
    ['ADMIN', 'Administrador'],
    ['EVENT_MANAGER', 'Gestor de eventos'],
    ['EDITOR', 'Editor'],
    ['CHECKIN', 'Check-in'],
    ['ANALYST', 'Analista'],
    ['MEMBER', 'Colaborador'],
    ['GUEST', 'Solo lectura'],
    ['VIEWER', 'Solo lectura'],
    ['EVENT_CLIENT', 'Cliente del evento'],
    ['PLATFORM', 'Plataforma'],
  ])('labels %s in Spanish', (code, label) => {
    expect(organizationRoleLabel(code)).toBe(label)
  })

  it('accepts the mixed-case codes the session returns', () => {
    expect(organizationRoleLabel('Owner')).toBe('Propietario')
    expect(organizationRoleLabel('Admin')).toBe('Administrador')
    expect(organizationRoleLabel('event_manager')).toBe('Gestor de eventos')
    expect(organizationRoleLabel('  Member ')).toBe('Colaborador')
  })

  it('marks inherited roles', () => {
    expect(organizationRoleLabel('INHERITED_ADMIN')).toBe('Administrador (heredado)')
    expect(organizationRoleLabel('inherited_owner')).toBe('Propietario (heredado)')
  })

  it('falls back to the raw code for unknown roles', () => {
    expect(organizationRoleLabel('SOMMELIER')).toBe('SOMMELIER')
    expect(organizationRoleLabel('INHERITED_SOMMELIER')).toBe('INHERITED_SOMMELIER')
    expect(organizationRoleLabel('')).toBe('')
    expect(organizationRoleLabel(undefined)).toBe('')
  })
})

describe('eventRoleLabel', () => {
  it.each([
    ['EVENT_OWNER', 'Responsable del evento'],
    ['MANAGER', 'Gestor del evento'],
    ['EDITOR', 'Editor'],
    ['CHECKIN', 'Check-in'],
    ['ANALYST', 'Analista'],
    ['VIEWER', 'Solo lectura'],
  ])('labels %s in Spanish', (code, label) => {
    expect(eventRoleLabel(code)).toBe(label)
  })

  it('is case-insensitive and falls back to the raw code', () => {
    expect(eventRoleLabel('event_owner')).toBe('Responsable del evento')
    expect(eventRoleLabel('Manager')).toBe('Gestor del evento')
    expect(eventRoleLabel('CATERING')).toBe('CATERING')
    expect(eventRoleLabel(null)).toBe('')
  })
})
