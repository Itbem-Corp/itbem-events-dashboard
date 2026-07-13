import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from '@/lib/api-error'

describe('getApiErrorMessage', () => {
  it('prefers legacy detail fields when present', () => {
    const error = { response: { data: { detail: 'legacy detail', error: 'api error', message: 'api message' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('legacy detail')
  })

  it('reads the backend APIResponse error field', () => {
    const error = { response: { data: { status: 400, message: 'Invalid data', error: 'email already exists' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('email already exists')
  })

  it('uses backend details for generic controller messages', () => {
    const error = {
      response: {
        data: {
          status: 400,
          message: 'Invalid event config field',
          error: 'unknown event config field: hero_color',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('unknown event config field: hero_color')
  })

  it('uses backend details for generic RSVP validation messages', () => {
    const error = {
      response: {
        data: {
          status: 400,
          message: 'Invalid RSVP request',
          error: 'guest count (5) exceeds allowed max (3)',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('guest count (5) exceeds allowed max (3)')
  })

  it('uses backend details for generic logo validation messages', () => {
    const error = {
      response: {
        data: {
          status: 400,
          message: 'Invalid logo',
          error: 'unsupported image type: video/mp4',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('unsupported image type: video/mp4')
  })

  it('uses backend details for generic image processing messages', () => {
    const error = {
      response: {
        data: {
          status: 400,
          message: 'Error processing image',
          error: 'avatar processing failed: unsupported image type: audio/mpeg',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('avatar processing failed: unsupported image type: audio/mpeg')
  })

  it('uses backend details for generic public access and upload messages', () => {
    const cases = [
      {
        message: 'Invalid cursor',
        error: 'cursor is missing required fields',
        expected: 'cursor is missing required fields',
      },
      {
        message: 'Invalid invitation token',
        error: 'token does not belong to this event',
        expected: 'token does not belong to this event',
      },
      {
        message: 'Invalid preview token',
        error: 'invalid preview token',
        expected: 'invalid preview token',
      },
      {
        message: 'Invalid upload key',
        error: 'object key does not belong to this event',
        expected: 'object key does not belong to this event',
      },
      {
        message: 'Invalid file',
        error: 'unsupported file type for moments: image/svg+xml',
        expected: 'unsupported file type for moments: image/svg+xml',
      },
      {
        message: 'Failed to upload cover',
        error: 'unsupported image type: video/mp4',
        expected: 'unsupported image type: video/mp4',
      },
      {
        message: 'Failed to upload resources',
        error: 'unsupported file type: application/x-msdownload',
        expected: 'unsupported file type: application/x-msdownload',
      },
    ]

    for (const item of cases) {
      expect(getApiErrorMessage({ response: { data: { status: 400, ...item } } }, 'fallback')).toBe(item.expected)
    }
  })

  it('uses backend details for generic RSVP confirmation failures', () => {
    const error = {
      response: {
        data: {
          status: 401,
          message: 'RSVP confirmation failed',
          error: 'invalid or expired token',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('invalid or expired token')
  })

  it('does not apply APIResponse message precedence to non-HTTP domain status fields', () => {
    const error = { response: { data: { status: 1, message: 'queued', error: 'domain detail' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('domain detail')
  })

  it('prefers the backend APIResponse message when it is specific', () => {
    const error = { response: { data: { status: 401, message: 'Invalid or expired token', error: 'record not found' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Invalid or expired token')
  })

  it('reads Pascal-cased backend APIResponse messages', () => {
    const error = { response: { data: { Status: 403, Message: 'Uploads disabled', Error: 'forbidden' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Uploads disabled')
  })

  it('falls back to later error aliases when canonical fields are null', () => {
    const error = {
      response: {
        data: {
          status: null,
          Status: 403,
          message: null,
          Message: 'Uploads disabled',
          error: null,
          Error: 'forbidden',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Uploads disabled')
  })

  it('falls back to later error aliases when canonical fields are blank', () => {
    const error = {
      response: {
        data: {
          status: '',
          Status: 403,
          message: ' ',
          Message: 'Uploads disabled',
          error: '',
          Error: 'forbidden',
        },
      },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Uploads disabled')
  })

  it('reads direct backend APIResponse payloads', () => {
    const payload = { status: 409, message: 'Validation error', error: 'guest already checked in' }

    expect(getApiErrorMessage(payload, 'fallback')).toBe('guest already checked in')
  })

  it('reads fetch-style errors with status and payload', () => {
    const error = {
      status: 403,
      payload: { status: 403, message: 'Access Denied', error: 'event is private' },
    }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Access Denied')
  })

  it('prefers Pascal-cased details when present', () => {
    const error = { response: { data: { Status: 400, Message: 'Invalid data', Detail: 'Token invalido' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Token invalido')
  })

  it('falls back to the backend APIResponse message', () => {
    const error = { response: { data: { status: 403, message: 'Access Denied' } } }

    expect(getApiErrorMessage(error, 'fallback')).toBe('Access Denied')
  })

  it('uses Error.message when no API payload exists', () => {
    expect(getApiErrorMessage(new Error('network failed'), 'fallback')).toBe('network failed')
  })

  it('uses the provided fallback when no message is available', () => {
    expect(getApiErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback')
    expect(getApiErrorMessage({ response: { data: { status: 429 } } }, 'fallback')).toBe('fallback')
  })
})
