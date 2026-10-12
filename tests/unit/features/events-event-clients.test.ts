import {
  eventClientAssignmentDelta,
  eventClientErrorMessage,
  eventClientRejectedEventIds,
  isEventClientAccessDisabled,
} from '@/features/events/event-clients'
import { describe, expect, it } from 'vitest'

const apiError = (status: number, error: string, data?: unknown) => ({
  response: { status, data: { status, message: 'x', error, ...(data ? { data } : {}) } },
})

describe('eventClientErrorMessage', () => {
  it.each([
    [409, 'event_client_unavailable', 'No podemos asignar esta cuenta como cliente. Verifica el correo o contacta a soporte.'],
    [409, 'event_client_is_org_member', 'Esta persona pertenece o perteneció a la organización del evento. Gestiona su acceso desde Equipo.'],
    [409, 'event_client_self', 'No puedes asignarte a ti mismo como cliente.'],
    [404, 'event_client_not_found', 'Ese cliente ya no tiene acceso a este evento.'],
    [422, 'event_outside_organization', 'Uno o más eventos no pertenecen a esta organización.'],
  ])('%s %s', (status, code, message) => {
    expect(eventClientErrorMessage(apiError(status, code))).toBe(message)
  })

  it('maps 429 to the rate-limit copy', () => {
    expect(eventClientErrorMessage({ response: { status: 429, data: { message: 'Too many requests, please slow down' } } })).toBe(
      'Demasiados intentos. Espera un momento.'
    )
  })

  it('falls back to the API message, then to the fallback', () => {
    expect(eventClientErrorMessage(apiError(403, 'Your organization role cannot perform this action'), 'f')).toBe('x')
    expect(eventClientErrorMessage(new Error(''), 'Fallback')).toBe('Fallback')
  })
})

describe('event client helpers', () => {
  it('detects the flag-off 404', () => {
    expect(isEventClientAccessDisabled(apiError(404, 'event_client_access_disabled'))).toBe(true)
    expect(isEventClientAccessDisabled(apiError(404, 'event_client_not_found'))).toBe(false)
  })

  it('reads the rejected event ids of a 422', () => {
    expect(eventClientRejectedEventIds(apiError(422, 'event_outside_organization', { event_ids: ['e-2', 3] }))).toEqual(['e-2'])
    expect(eventClientRejectedEventIds(apiError(409, 'event_client_self'))).toEqual([])
  })

  it('sends only the delta', () => {
    const original = new Map([
      ['e-1', true],
      ['e-2', false],
      ['e-3', true],
    ])
    const selected = new Map([
      ['e-1', true],
      ['e-2', true],
      ['e-3', false],
      ['e-4', false],
    ])
    expect(eventClientAssignmentDelta(original, selected)).toEqual({ assign: ['e-2'], unassign: ['e-3'] })
  })
})
