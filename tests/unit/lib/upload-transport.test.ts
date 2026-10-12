// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { getUploadErrorMessage, UPLOAD_TIMEOUT_MS, uploadRequestConfig } from '@/lib/upload-transport'

describe('upload transport', () => {
  it('sanitizes storage endpoint errors without leaking AWS request metadata', () => {
    const raw =
      'operation error S3: PutObject, StatusCode: 301, RequestID: SECRET, HostID: SECRET_HOST, api error PermanentRedirect: bucket must use specified endpoint'

    const message = getUploadErrorMessage(
      { response: { status: 500, data: { detail: raw } } },
      'No pudimos subir el archivo'
    )

    expect(message).toBe('El almacenamiento no pudo recibir el archivo. Reintenta; si continúa, contacta a soporte.')
    expect(message).not.toContain('RequestID')
    expect(message).not.toContain('HostID')
  })

  it.each([
    [413, 'El archivo supera el límite permitido por el servidor.'],
    [415, 'El servidor no admite este formato de archivo.'],
    [429, 'Hay demasiadas cargas en curso. Espera un momento e inténtalo de nuevo.'],
  ])('maps HTTP %i to an actionable upload message', (status, expected) => {
    expect(getUploadErrorMessage({ response: { status } }, 'fallback')).toBe(expected)
  })

  it('reports determinate upload progress and applies the upload timeout', () => {
    const progress = vi.fn()
    const config = uploadRequestConfig(new AbortController().signal, progress)

    config.onUploadProgress?.({ loaded: 5, total: 8 } as never)

    expect(config.timeout).toBe(UPLOAD_TIMEOUT_MS)
    expect(progress).toHaveBeenCalledWith(63)
  })
})

// ROLES-103 (backend w2/be-admin-orgs-users): typed organization errors.
describe('organization creation errors', () => {
  it('shows the Spanish message for CLIENT_HIERARCHY_LIMIT', () => {
    const error = {
      response: {
        status: 400,
        data: { error: 'CLIENT_HIERARCHY_LIMIT', message: 'No se pueden crear sub-organizaciones bajo un cliente.' },
      },
    }
    expect(getUploadErrorMessage(error, 'No pudimos guardar la organización')).toBe(
      'No se pueden crear sub-organizaciones bajo un cliente.'
    )
  })

  it('does not call a typed 500 a file-service outage', () => {
    const error = { response: { status: 500, data: { error: 'CLIENT_CREATE_FAILED', message: 'failed' } } }
    expect(getUploadErrorMessage(error, 'No pudimos guardar la organización')).toBe(
      'No pudimos crear la organización. Intenta de nuevo.'
    )
  })
})

describe('upload transport — invalid files', () => {
  it.each([
    ['invalid image: image: unknown format', 'El archivo no es una imagen válida o está dañado. Elige otro archivo.'],
    ['unsupported file type: text/plain', 'El formato del archivo no es compatible. Usa JPG, PNG o WebP.'],
  ])('maps a 400 "%s" to a file problem, not a service outage', (reason, expected) => {
    const message = getUploadErrorMessage({ response: { status: 400, data: { message: reason } } }, 'fallback')
    expect(message).toBe(expected)
  })

  it('keeps a Spanish 422 message from the backend', () => {
    const message = getUploadErrorMessage(
      { response: { status: 422, data: { message: 'La imagen está vacía o no se pudo leer.' } } },
      'fallback'
    )
    expect(message).toBe('La imagen está vacía o no se pudo leer.')
  })
})
