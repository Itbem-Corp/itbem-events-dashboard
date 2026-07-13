import axios, { type AxiosProgressEvent, type AxiosRequestConfig } from 'axios'

import { getApiErrorMessage } from '@/lib/api-error'

export const UPLOAD_TIMEOUT_MS = 4 * 60 * 1000

export type UploadRequestConfig = Pick<AxiosRequestConfig, 'signal' | 'timeout' | 'onUploadProgress'>

export function uploadRequestConfig(
  signal: AbortSignal,
  onProgress: (percentage: number | null) => void
): UploadRequestConfig {
  return {
    signal,
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (!event.total || event.total <= 0) {
        onProgress(null)
        return
      }

      onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))))
    },
  }
}

export function isUploadCanceled(error: unknown): boolean {
  return axios.isCancel(error) || (error instanceof DOMException && error.name === 'AbortError')
}

function uploadStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const response = (error as { response?: { status?: unknown } }).response
  return typeof response?.status === 'number' ? response.status : undefined
}

function uploadCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

export function getUploadErrorMessage(error: unknown, fallback: string): string {
  if (isUploadCanceled(error)) return 'Carga cancelada. El archivo no se guardó.'

  const status = uploadStatus(error)
  if (status === 413) return 'El archivo supera el límite permitido por el servidor.'
  if (status === 415) return 'El servidor no admite este formato de archivo.'
  if (status === 429) return 'Hay demasiadas cargas en curso. Espera un momento e inténtalo de nuevo.'

  const code = uploadCode(error)
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return 'La carga tardó demasiado. Revisa tu conexión y vuelve a intentarlo.'
  }

  const rawMessage = getApiErrorMessage(error, fallback)
  if (
    /PermanentRedirect|specified endpoint|S3:\s*PutObject|bucket.*endpoint|failed to upload cover|failed to upload resources/i.test(
      rawMessage
    )
  ) {
    return 'El almacenamiento no pudo recibir el archivo. Reintenta; si continúa, contacta a soporte.'
  }

  if (status && status >= 500) {
    return 'El servicio de archivos no está disponible por el momento. Reintenta en unos segundos.'
  }

  return rawMessage
}
