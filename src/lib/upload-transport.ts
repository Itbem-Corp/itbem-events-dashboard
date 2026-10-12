import axios, { type AxiosProgressEvent, type AxiosRequestConfig } from 'axios'

import { getApiErrorMessage, hasKnownApiErrorCode } from '@/lib/api-error'

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

// Only used to classify storage failures; never shown to the user.
function rawErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const data = (error as { response?: { data?: unknown } }).response?.data
  const message = error instanceof Error ? error.message : ''
  try {
    return `${message} ${typeof data === 'string' ? data : JSON.stringify(data ?? '')}`
  } catch {
    return message
  }
}

// The backend rejects a file it cannot read (e.g. a text file renamed to
// .png) with 400/422 and an English reason. Map the known reasons; anything
// else goes through the shared Spanish error mapping.
const INVALID_FILE_MESSAGE = 'El archivo no es una imagen válida o está dañado. Elige otro archivo.'
const UNSUPPORTED_FILE_MESSAGE = 'El formato del archivo no es compatible. Usa JPG, PNG o WebP.'

function invalidFileMessage(error: unknown, fallback: string): string {
  const text = rawErrorText(error).toLowerCase()
  if (/unsupported (file|image|media|content) type|content[- ]type|mime/.test(text)) return UNSUPPORTED_FILE_MESSAGE
  if (/invalid image|not a valid image|not an image|unknown format|decode|corrupt|malformed|cannot read image|image: /.test(text)) {
    return INVALID_FILE_MESSAGE
  }
  return getApiErrorMessage(error, fallback || INVALID_FILE_MESSAGE)
}

export function getUploadErrorMessage(error: unknown, fallback: string): string {
  if (isUploadCanceled(error)) return 'Carga cancelada. El archivo no se guardó.'

  const status = uploadStatus(error)
  if (status === 413) return 'El archivo supera el límite permitido por el servidor.'
  if (status === 415) return 'El servidor no admite este formato de archivo.'
  if (status === 429) return 'Hay demasiadas cargas en curso. Espera un momento e inténtalo de nuevo.'
  if (status === 400 || status === 422) return invalidFileMessage(error, fallback)

  const code = uploadCode(error)
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return 'La carga tardó demasiado. Revisa tu conexión y vuelve a intentarlo.'
  }

  if (
    /PermanentRedirect|specified endpoint|S3:\s*PutObject|bucket.*endpoint|failed to upload cover|failed to upload resources/i.test(
      rawErrorText(error)
    )
  ) {
    return 'El almacenamiento no pudo recibir el archivo. Reintenta; si continúa, contacta a soporte.'
  }

  // A typed domain error (e.g. CLIENT_CREATE_FAILED) is not a file-service outage.
  if (hasKnownApiErrorCode(error)) return getApiErrorMessage(error, fallback)

  if (status && status >= 500) {
    return 'El servicio de archivos no está disponible por el momento. Reintenta en unos segundos.'
  }

  return getApiErrorMessage(error, fallback)
}
