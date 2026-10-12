import { describe, expect, it } from 'vitest'

import { readGuestWriteError } from '@/components/guests/forms/guest-write-errors'

function badRequest(error: string, message?: string, status = 400) {
  return { response: { status, data: { status, error, ...(message ? { message } : {}) } } }
}

describe('readGuestWriteError', () => {
  it('maps guest_field_too_long to the field named in the message', () => {
    expect(
      readGuestWriteError(badRequest('guest_field_too_long', 'El campo «Teléfono» admite máximo 50 caracteres.'))
    ).toEqual({
      code: 'guest_field_too_long',
      message: 'El campo «Teléfono» admite máximo 50 caracteres.',
      field: 'phone',
      row: undefined,
    })
    expect(
      readGuestWriteError(
        badRequest('guest_field_too_long', 'El campo «Restricciones alimentarias» admite máximo 255 caracteres.')
      )?.field
    ).toBe('dietary_restrictions')
  })

  it('maps party size errors to max_guests or guests_count', () => {
    expect(
      readGuestWriteError(badRequest('invalid_party_size', 'El máximo de invitados admite hasta 100 personas.'))?.field
    ).toBe('max_guests')
    expect(
      readGuestWriteError(badRequest('invalid_party_size', 'Los asistentes admiten hasta 100 personas.'))?.field
    ).toBe('guests_count')
    expect(
      readGuestWriteError(
        badRequest('party_size_exceeds_max_guests', 'Los asistentes (5) superan el máximo de invitados (3).')
      )
    ).toMatchObject({ field: 'guests_count', message: 'Los asistentes (5) superan el máximo de invitados (3).' })
  })

  it('keeps invalid_rsvp_status as a form-level Spanish message', () => {
    expect(readGuestWriteError(badRequest('invalid_rsvp_status'))).toEqual({
      code: 'invalid_rsvp_status',
      message: 'Estado de confirmación inválido. Usa pendiente, confirmado o declinado.',
      field: undefined,
      row: undefined,
    })
  })

  it('reads the batch row prefix', () => {
    expect(
      readGuestWriteError(
        badRequest('guest_field_too_long', 'Invitado 2: El campo «Nombre» admite máximo 200 caracteres.')
      )
    ).toMatchObject({
      row: 2,
      field: 'first_name',
      message: 'El campo «Nombre» admite máximo 200 caracteres.',
    })
  })

  it('maps a 409 table_over_capacity on a guest write to the party size', () => {
    expect(
      readGuestWriteError(
        badRequest('table_over_capacity', 'La mesa «Mesa 1» (9 de 8 lugares) no tiene lugar suficiente.', 409)
      )
    ).toMatchObject({ field: 'guests_count' })
  })

  it('ignores unrelated errors', () => {
    expect(readGuestWriteError(badRequest('table_outside_event', 'Mesa inválida'))).toBeNull()
    expect(readGuestWriteError(badRequest('invalid_party_size', 'x', 500))).toBeNull()
    expect(readGuestWriteError(new Error('boom'))).toBeNull()
  })
})
