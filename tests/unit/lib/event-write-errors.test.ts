import { describe, expect, it } from 'vitest'

import { eventWriteFieldError } from '@/lib/event-write-errors'

const axiosError = (data: unknown) => ({ response: { status: 409, data } })

describe('eventWriteFieldError', () => {
  it('maps the backend codes to form fields', () => {
    expect(eventWriteFieldError(axiosError({ status: 409, message: 'Ya existe…', error: 'event_name_taken' }))).toEqual({
      field: 'name',
      message: 'Ya existe…',
    })
    expect(eventWriteFieldError(axiosError({ status: 409, error: 'event_identifier_taken' }))?.field).toBe('identifier')
    expect(eventWriteFieldError({ response: { status: 400, data: { error: 'event_name_too_long' } } })).toEqual({
      field: 'name',
      message: 'El nombre del evento admite máximo 120 caracteres.',
    })
    expect(eventWriteFieldError({ payload: { status: 400, error: 'invalid_timezone' }, status: 400 })).toEqual({
      field: 'timezone',
      message: 'Zona horaria inválida',
    })
  })

  it('ignores other errors', () => {
    expect(eventWriteFieldError(axiosError({ status: 500, error: 'boom' }))).toBeNull()
    expect(eventWriteFieldError(new Error('offline'))).toBeNull()
    expect(eventWriteFieldError(null)).toBeNull()
  })
})
