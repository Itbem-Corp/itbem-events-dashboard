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
