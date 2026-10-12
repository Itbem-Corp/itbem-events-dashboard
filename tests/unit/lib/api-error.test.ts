// @vitest-environment node

import { AxiosError, CanceledError } from 'axios'
import { describe, expect, it } from 'vitest'
import {
  apiErrorCode,
  apiErrorStatus,
  FORBIDDEN_MESSAGE,
  getApiErrorMessage,
  isCanceledRequest,
  isNetworkFailure,
  isSpanishMessage,
  NETWORK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/api-error'

function axiosResponseError(status: number, data: unknown) {
  const error = new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE')
  error.response = { status, data, statusText: '', headers: {}, config: {} as never }
  return error
}

describe('getApiErrorMessage', () => {
  it('shows Spanish backend text verbatim', () => {
    const error = { response: { status: 400, data: { status: 400, message: 'Invalid data', error: 'El nombre es obligatorio' } } }
    expect(getApiErrorMessage(error, 'fallback')).toBe('El nombre es obligatorio')

    const detail = { response: { data: { Status: 400, Message: 'Invalid data', Detail: 'Token inválido' } } }
    expect(getApiErrorMessage(detail, 'fallback')).toBe('Token inválido')
  })

  it('maps the new backend codes to Spanish', () => {
    expect(
      getApiErrorMessage(axiosResponseError(409, { status: 409, message: 'Conflict', code: 'table_over_capacity' }), 'x')
    ).toMatch(/mesa ya alcanzó su capacidad/)
    expect(getApiErrorMessage(axiosResponseError(409, { status: 409, error: 'rsvp_closed' }), 'x')).toMatch(
      /confirmación de asistencia ya está cerrada/
    )
    expect(getApiErrorMessage(axiosResponseError(409, { data: { code: 'TABLE_OVER_CAPACITY' } }), 'x')).toMatch(
      /mesa ya alcanzó/
    )
  })

  it('prefers the Spanish backend message for admin guard codes', () => {
    const children = axiosResponseError(409, {
      status: 409,
      message: 'No se puede eliminar una organización que tiene sub-organizaciones. Elimina o mueve primero sus sub-organizaciones.',
      error: 'CLIENT_HAS_CHILDREN',
    })
    expect(getApiErrorMessage(children, 'x')).toMatch(/^No se puede eliminar una organización/)

    const memberships = axiosResponseError(409, { status: 409, message: 'Conflict', error: 'USER_HAS_ACTIVE_MEMBERSHIPS' })
    expect(getApiErrorMessage(memberships, 'x')).toMatch(/Quítalo de ellas antes de eliminarlo/)

    for (const code of ['USER_SELF_ACTION', 'USER_PRIMARY_ROOT_PROTECTED', 'USER_NOT_FOUND', 'CLIENT_PERMISSION_DENIED', 'CLIENT_NOT_FOUND']) {
      const message = getApiErrorMessage(axiosResponseError(409, { status: 409, error: code }), 'x')
      expect(message).not.toBe(code)
      expect(message).not.toBe('x')
    }
  })

  it('maps event, guest, seating and public codes from `code` or `error`', () => {
    const cases: Array<[number, string, RegExp]> = [
      [409, 'event_name_taken', /Ya existe un evento con ese nombre/],
      [409, 'event_identifier_taken', /URL del evento ya está en uso/],
      [400, 'invalid_timezone', /zona horaria no es válida/],
      [400, 'guest_field_too_long', /demasiado largo/],
      [400, 'invalid_rsvp_status', /estado de confirmación no es válido/],
      [400, 'invalid_party_size', /número de asistentes no es válido/],
      [400, 'party_size_exceeds_max_guests', /supera el máximo permitido/],
      [409, 'seating_plan_stale', /El plan de mesas cambió; recarga para continuar/],
      [409, 'table_over_capacity', /mesa ya alcanzó su capacidad/],
      [401, 'event_password_required', /protegido con contraseña/],
      [429, 'too_many_attempts', /demasiados intentos/],
      [410, 'event_gone', /ya no está disponible/],
    ]
    for (const [status, code, expected] of cases) {
      expect(getApiErrorMessage(axiosResponseError(status, { status, message: 'Conflict', code }), 'x')).toMatch(expected)
      expect(getApiErrorMessage(axiosResponseError(status, { status, message: 'Bad Request', error: code }), 'x')).toMatch(expected)
    }
  })

  it('prefers the Spanish backend message for any known code', () => {
    const error = axiosResponseError(409, {
      status: 409,
      message: 'Ya existe un evento con ese nombre en esta organización: Boda Ana.',
      error: 'event_name_taken',
    })
    expect(getApiErrorMessage(error, 'x')).toBe('Ya existe un evento con ese nombre en esta organización: Boda Ana.')
  })

  it('shows the Spanish 404 text for a missing event', () => {
    expect(getApiErrorMessage(axiosResponseError(404, { status: 404, message: 'Evento no encontrado' }), 'x')).toBe(
      'Evento no encontrado'
    )
  })

  it('never shows an unknown bare code', () => {
    expect(getApiErrorMessage(axiosResponseError(400, { status: 400, error: 'SOMETHING_NEW' }), 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })

  it('maps an organization with children (409) to Spanish', () => {
    expect(
      getApiErrorMessage(axiosResponseError(409, { status: 409, code: 'organization_has_children' }), 'x')
    ).toMatch(/tiene suborganizaciones/)
    expect(
      getApiErrorMessage(
        axiosResponseError(409, { status: 409, message: 'Conflict', error: 'organization has sub-organizations' }),
        'x'
      )
    ).toMatch(/tiene suborganizaciones/)
  })

  it('translates known backend English messages', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ status: 400, message: 'Invalid data', error: 'email already exists' }, /Ya existe una cuenta/],
      [{ status: 409, message: 'Validation error', error: 'guest already checked in' }, /ya registró su entrada/],
      [{ status: 400, message: 'Invalid RSVP request', error: 'guest count (5) exceeds allowed max (3)' }, /\(5\) supera el máximo permitido \(3\)/],
      [{ status: 401, message: 'RSVP confirmation failed', error: 'invalid or expired token' }, /no es válido o ya expiró/],
      [{ status: 400, message: 'Invalid logo', error: 'unsupported image type: video/mp4' }, /tipo de imagen no es compatible/],
      [{ status: 500, message: 'Invite failed', error: 'UsernameExistsException: An account with the given email already exists.' }, /Ya existe una cuenta/],
      [{ status: 500, message: 'Error updating user', error: 'pq: duplicate key' }, /No se pudo actualizar el usuario/],
      [{ status: 404, message: 'User not found' }, /No encontramos el usuario/],
      [{ status: 403, message: 'Access Denied', error: 'permission denied: users:delete' }, /No tienes permiso/],
    ]
    for (const [data, expected] of cases) {
      expect(getApiErrorMessage({ response: { data } }, 'fallback')).toMatch(expected)
    }
  })

  it('never returns raw Go or Cognito English text', () => {
    const error = axiosResponseError(400, { status: 400, message: 'Invalid data', error: 'cursor is missing required fields' })
    expect(getApiErrorMessage(error, 'No se pudo cargar la lista.')).toBe('No se pudo cargar la lista.')

    const go = axiosResponseError(500, { status: 500, message: 'Operation failed', error: 'sql: no rows in result set' })
    expect(getApiErrorMessage(go, 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })

  it('maps status classes to Spanish', () => {
    expect(getApiErrorMessage(axiosResponseError(403, { status: 403, message: 'Forbidden' }), 'fallback')).toBe(FORBIDDEN_MESSAGE)
    expect(getApiErrorMessage(axiosResponseError(401, {}), 'fallback')).toBe(SESSION_EXPIRED_MESSAGE)
    expect(getApiErrorMessage(axiosResponseError(429, {}), 'fallback')).toMatch(/Demasiadas solicitudes/)
    expect(getApiErrorMessage(axiosResponseError(413, {}), 'fallback')).toMatch(/tamaño permitido/)
    expect(getApiErrorMessage(axiosResponseError(502, '<html>Bad gateway</html>'), 'No se pudo guardar.')).toBe('No se pudo guardar.')
    expect(getApiErrorMessage(axiosResponseError(404, {}), 'No encontramos el evento.')).toBe('No encontramos el evento.')
  })

  it('never returns axios English messages', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(getApiErrorMessage(network, 'fallback')).toBe(NETWORK_ERROR_MESSAGE)

    const bare = new AxiosError('Request failed with status code 500')
    expect(getApiErrorMessage(bare, 'fallback')).not.toMatch(/Request failed/)

    expect(getApiErrorMessage(new CanceledError(), 'fallback')).toBe('La operación se canceló.')
    expect(getApiErrorMessage(new TypeError('Failed to fetch'), 'fallback')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('keeps Spanish messages thrown by our own code and drops English ones', () => {
    expect(getApiErrorMessage(new Error('El servidor no confirmó la nueva foto.'), 'fallback')).toBe(
      'El servidor no confirmó la nueva foto.'
    )
    expect(getApiErrorMessage(new Error('network failed'), 'fallback')).toBe('fallback')
  })

  it('uses the fallback when there is nothing usable', () => {
    expect(getApiErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback')
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('error helpers', () => {
  it('reads status and code from every error shape', () => {
    expect(apiErrorStatus(axiosResponseError(409, {}))).toBe(409)
    expect(apiErrorStatus({ status: 403, payload: {} })).toBe(403)
    expect(apiErrorStatus({ status: 404, message: 'x' })).toBe(404)
    expect(apiErrorStatus(new Error('x'))).toBeUndefined()
    expect(apiErrorCode({ response: { data: { error_code: 'RSVP_CLOSED' } } })).toBe('rsvp_closed')
    expect(apiErrorCode({ response: { data: { error: 'some free text' } } })).toBeNull()
  })

  it('tells cancellations apart from network failures', () => {
    expect(isCanceledRequest(new CanceledError())).toBe(true)
    expect(isCanceledRequest(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isNetworkFailure(new CanceledError())).toBe(false)
    expect(isNetworkFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true)
    expect(isNetworkFailure(axiosResponseError(500, {}))).toBe(false)
  })

  it('recognises Spanish text', () => {
    expect(isSpanishMessage('No se pudo guardar el evento')).toBe(true)
    expect(isSpanishMessage('Acceso denegado')).toBe(true)
    expect(isSpanishMessage('No autorizado')).toBe(true)
    expect(isSpanishMessage('Uploads disabled')).toBe(false)
    expect(isSpanishMessage('pq: llave duplicada')).toBe(false)
    expect(isSpanishMessage('no rows in result set')).toBe(false)
    expect(isSpanishMessage('Sesión expirada')).toBe(true)
    expect(isSpanishMessage('record not found')).toBe(false)
    expect(isSpanishMessage('Error al guardar: la mesa no existe')).toBe(true)
  })
})
