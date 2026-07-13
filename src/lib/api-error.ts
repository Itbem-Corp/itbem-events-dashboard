type ResponseLike = {
  response?: {
    data?: unknown
  }
}

type ApiFetchErrorLike = {
  payload: unknown
  status: number
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function isHttpStatus(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
}

const GENERIC_API_MESSAGES = new Set([
  'error',
  'error preparing multipart upload',
  'error uploading file',
  'error processing image',
  'failed to upload cover',
  'failed to upload resources',
  'invalid data',
  'invalid event config field',
  'invalid event id',
  'invalid event uuid',
  'invalid file',
  'invalid cursor',
  'invalid id',
  'invalid invitation token',
  'invalid logo',
  'invalid preview token',
  'invalid request body',
  'invalid rsvp request',
  'invalid section config',
  'invalid section uuid',
  'invalid upload key',
  'invalid uuid',
  'operation failed',
  'registration failed',
  'rsvp confirmation failed',
  'update error',
  'validation error',
])

function isGenericApiMessage(message: string): boolean {
  return GENERIC_API_MESSAGES.has(message.trim().toLowerCase())
}

function firstValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (!(key in source)) continue

    const candidate = source[key]
    if (candidate === undefined || candidate === null) continue
    if (typeof candidate === 'string' && !candidate.trim()) continue

    return candidate
  }
  return undefined
}

function messageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null

  const data = payload as Record<string, unknown>
  const detail = stringOrNull(firstValue(data, ['detail', 'Detail']))
  if (detail) return detail

  const message = stringOrNull(firstValue(data, ['message', 'Message']))
  const error = stringOrNull(firstValue(data, ['error', 'Error']))

  if (isHttpStatus(firstValue(data, ['status', 'Status']))) {
    if (message && (!error || !isGenericApiMessage(message))) return message
    return error ?? message
  }

  return error ?? message
}

function isApiFetchErrorLike(error: unknown): error is ApiFetchErrorLike {
  return (
    !!error &&
    typeof error === 'object' &&
    'payload' in error &&
    isHttpStatus((error as Record<string, unknown>).status)
  )
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isApiFetchErrorLike(error)) {
    const payloadMessage = messageFromPayload(error.payload)
    if (payloadMessage) return payloadMessage
  }

  const responseMessage = messageFromPayload((error as ResponseLike)?.response?.data)
  if (responseMessage) return responseMessage

  const directMessage = messageFromPayload(error)
  if (directMessage) return directMessage

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
