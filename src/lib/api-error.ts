import axios from 'axios'

/**
 * One place that turns API, transport and browser failures into Spanish copy.
 *
 * Rules:
 * - A typed backend `code` wins (stable contract, never English text).
 * - Known backend English messages are translated.
 * - Backend text is shown as-is only when it is already Spanish.
 * - Otherwise the status class decides, then the caller's Spanish fallback.
 * - Axios/fetch English (`Network Error`, `Request failed with status code
 *   500`, `canceled`, `Failed to fetch`) and raw Go/Cognito text never reach
 *   the screen.
 */

type ResponseLike = {
  response?: {
    data?: unknown
    status?: unknown
  }
}

type ApiFetchErrorLike = {
  payload: unknown
  status: number
}

export const NETWORK_ERROR_MESSAGE = 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
export const FORBIDDEN_MESSAGE = 'No tienes permiso para realizar esta acción.'
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Inicia sesión de nuevo.'
export const CANCELED_MESSAGE = 'La operación se canceló.'
export const ORGANIZATION_HAS_CHILDREN_MESSAGE =
  'No puedes eliminar esta organización porque tiene suborganizaciones. Elimínalas o muévelas primero.'

// Stable error codes the backend sends (in `code`, `error_code`, `data.code`
// or as the whole `error` value). Add new codes here, never in components.
const CODE_MESSAGES: Record<string, string> = {
  table_over_capacity: 'La mesa ya alcanzó su capacidad. Elige otra mesa o libera un lugar.',
  rsvp_closed: 'La confirmación de asistencia ya está cerrada para este evento.',
  // Events (create, update, duplicate)
  event_name_taken: 'Ya existe un evento con ese nombre en esta organización.',
  event_identifier_taken: 'Esa URL del evento ya está en uso. Elige otra.',
  invalid_timezone: 'La zona horaria no es válida. Elige una de la lista.',
  event_not_found: 'Evento no encontrado.',
  // Guests
  guest_field_too_long: 'Uno de los campos del invitado es demasiado largo.',
  invalid_rsvp_status: 'El estado de confirmación no es válido.',
  invalid_party_size: 'El número de asistentes no es válido.',
  party_size_exceeds_max_guests: 'El número de asistentes supera el máximo permitido para este invitado.',
  // Seating
  seating_plan_stale: 'El plan de mesas cambió; recarga para continuar.',
  // Public access codes that can reach the dashboard
  event_password_required: 'Este evento está protegido con contraseña.',
  too_many_attempts: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  event_gone: 'Este evento ya no está disponible.',
  organization_has_children: ORGANIZATION_HAS_CHILDREN_MESSAGE,
  client_has_children: ORGANIZATION_HAS_CHILDREN_MESSAGE,
  // Admin mutation guards (backend fix/core-admin-mutation-guards). The API
  // also sends a Spanish `message`, which is preferred (see below).
  client_permission_denied: 'No tienes permiso para modificar esta organización.',
  client_not_found: 'La organización no existe.',
  // Organization creation (backend w2/be-admin-orgs-users). The Spanish `message` wins when present.
  client_hierarchy_limit: 'No se pueden crear sub-organizaciones aquí.',
  client_type_not_allowed: 'Ese tipo de organización no se puede crear en este nivel.',
  client_type_invalid: 'El tipo de organización no es válido.',
  client_name_required: 'Escribe el nombre de la organización.',
  client_parent_not_found: 'La organización superior ya no existe.',
  client_code_conflict: 'Ya existe una organización con ese identificador. Intenta con otro nombre.',
  client_create_failed: 'No pudimos crear la organización. Intenta de nuevo.',
  user_self_action: 'No puedes realizar esta acción sobre tu propia cuenta.',
  user_primary_root_protected: 'Una cuenta raíz principal no puede eliminarse ni desactivarse.',
  user_has_active_memberships:
    'El usuario todavía pertenece a una o más organizaciones. Quítalo de ellas antes de eliminarlo.',
  user_not_found: 'Usuario no encontrado.',
  usernameexistsexception: 'Ya existe una cuenta con ese correo.',
  usernotfoundexception: 'No encontramos una cuenta con ese correo.',
  notauthorizedexception: 'Correo o contraseña incorrectos.',
  limitexceededexception: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  toomanyrequestsexception: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  codemismatchexception: 'El código no es correcto.',
  expiredcodeexception: 'El código expiró. Solicita uno nuevo.',
  invalidpasswordexception: 'La contraseña no cumple los requisitos de seguridad.',
}

// Known backend English messages. Each pattern is matched against the
// lowercased text; the first match wins.
const MESSAGE_PATTERNS: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/usernameexistsexception|email already exists|user already exists|already registered/, CODE_MESSAGES.usernameexistsexception],
  [/has (sub-?organizations|children|child (clients|organizations))|child organizations exist/, CODE_MESSAGES.organization_has_children],
  [/table (is )?(over|at|exceeds?) capacity|table is full/, CODE_MESSAGES.table_over_capacity],
  [/rsvp (is )?closed|rsvp window (is )?closed/, CODE_MESSAGES.rsvp_closed],
  [/^invite failed/, 'No se pudo enviar la invitación.'],
  [/^error updating user/, 'No se pudo actualizar el usuario.'],
  [/^error deleting user/, 'No se pudo eliminar el usuario.'],
  [/^user not found/, 'No encontramos el usuario.'],
  [/^(client|organization) not found/, 'No encontramos la organización.'],
  [/^event not found/, 'No encontramos el evento.'],
  [/^guest not found/, 'No encontramos el invitado.'],
  [/guest already checked in/, 'Este invitado ya registró su entrada.'],
  [/guest count \((\d+)\) exceeds allowed max \((\d+)\)/, (m) => `El número de asistentes (${m[1]}) supera el máximo permitido (${m[2]}).`],
  [/invalid or expired token|token (is )?expired/, 'El enlace no es válido o ya expiró.'],
  [/invalid preview token/, 'El enlace de vista previa no es válido o ya expiró.'],
  [/token does not belong to this event/, 'El enlace no corresponde a este evento.'],
  [/object key does not belong to this event/, 'El archivo no corresponde a este evento.'],
  [/unknown event config field/, 'La configuración incluye un campo que no se reconoce.'],
  [/unsupported image type/, 'El tipo de imagen no es compatible. Usa JPG, PNG o WebP.'],
  [/unsupported file type/, 'El tipo de archivo no es compatible.'],
  [/uploads? (are )?disabled/, 'Las subidas están desactivadas para este evento.'],
  [/^permission denied|^access denied|^forbidden|^insufficient permissions?/, FORBIDDEN_MESSAGE],
  [/^unauthorized|^missing or invalid token|^invalid token/, SESSION_EXPIRED_MESSAGE],
  [/too many requests|rate limit/, 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.'],
]

const SPANISH_MARKS = /[áéíóúñü¿¡]/i
const SPANISH_WORDS =
  /\b(de|del|la|las|los|el|se|en|para|con|una|por|que|es|esta|este|debe|puede|ya|al|su|sin|no|un|lo|le|hay)\b/gi
const ENGLISH_WORDS =
  /\b(the|is|are|was|were|be|been|not|does|do|did|with|in|of|to|for|on|by|an|failed|fail|failure|invalid|denied|permission|exception|required|must|cannot|unable|unauthorized|forbidden|record|records|exceeds|already|found|request|error|errors|missing|unknown|unsupported|disabled|enabled|conflict|bad|internal|server|timeout|unavailable|gateway|rows|duplicate|violates|key|field|value|user|users|client|event|guest|token|file|upload|uploads|access)\b/i
// Go/driver prefixes such as "pq: ...", "sql: ...", "rpc error: ...".
const RAW_ERROR_PREFIX = /^[a-z0-9_.]+( error)?: /i

/** True when backend text is already Spanish and safe to show verbatim. */
export function isSpanishMessage(text: string): boolean {
  const value = text.trim()
  if (!value || RAW_ERROR_PREFIX.test(value)) return false
  // A bare code such as CLIENT_HAS_CHILDREN is not copy.
  if (value.includes('_') && /^[a-z0-9_.:-]+$/i.test(value)) return false
  const spanishWords = new Set((value.match(SPANISH_WORDS) ?? []).map((word) => word.toLowerCase()))
  if (!ENGLISH_WORDS.test(value)) return true
  // Mixed vocabulary ("Token inválido", "Error al guardar la mesa"): only
  // accept it when the Spanish evidence is strong.
  return SPANISH_MARKS.test(value) || spanishWords.size >= 2
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isHttpStatus(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
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

function isApiFetchErrorLike(error: unknown): error is ApiFetchErrorLike {
  return (
    !!error &&
    typeof error === 'object' &&
    'payload' in error &&
    isHttpStatus((error as Record<string, unknown>).status)
  )
}

function payloadOf(error: unknown): Record<string, unknown> | null {
  const candidates = [
    isApiFetchErrorLike(error) ? error.payload : undefined,
    (error as ResponseLike | null)?.response?.data,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate as Record<string, unknown>
  }
  // A bare APIResponse envelope passed directly (not an Error instance).
  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const direct = error as Record<string, unknown>
    if (['message', 'Message', 'error', 'Error', 'detail', 'Detail', 'code'].some((key) => key in direct)) return direct
  }
  return null
}

/** HTTP status of an axios, apiFetch or envelope error; undefined without a response. */
export function apiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const responseStatus = (error as ResponseLike).response?.status
  if (isHttpStatus(responseStatus)) return responseStatus
  if (isApiFetchErrorLike(error)) return error.status
  const payload = payloadOf(error)
  const payloadStatus = payload ? firstValue(payload, ['status', 'Status']) : undefined
  return isHttpStatus(payloadStatus) ? payloadStatus : undefined
}

/** Stable backend error code, lowercased, when the API sent one. */
export function apiErrorCode(error: unknown): string | null {
  const payload = payloadOf(error)
  if (!payload) return null
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null
  const explicit =
    stringOrNull(firstValue(payload, ['code', 'Code', 'error_code', 'errorCode'])) ??
    (data ? stringOrNull(firstValue(data, ['code', 'error_code'])) : null)
  if (explicit) return explicit.toLowerCase()
  const errorField = stringOrNull(firstValue(payload, ['error', 'Error']))
  if (errorField && /^[a-z][a-z0-9_]*$/i.test(errorField) && errorField.toLowerCase() in CODE_MESSAGES) {
    return errorField.toLowerCase()
  }
  return null
}

/** True when the API sent a stable code this module has Spanish copy for. */
export function hasKnownApiErrorCode(error: unknown): boolean {
  const code = apiErrorCode(error)
  return Boolean(code && CODE_MESSAGES[code])
}

/** A request the user or the app cancelled (AbortController, axios cancel). */
export function isCanceledRequest(error: unknown): boolean {
  if (axios.isCancel(error)) return true
  if (!error || typeof error !== 'object') return false
  const named = error as { name?: unknown; code?: unknown }
  return named.name === 'AbortError' || named.name === 'CanceledError' || named.code === 'ERR_CANCELED'
}

/** A transport failure: no HTTP response reached the browser. */
export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object' || isCanceledRequest(error)) return false
  if (apiErrorStatus(error) !== undefined) return false
  const candidate = error as { code?: unknown; message?: unknown; isAxiosError?: unknown; name?: unknown }
  if (candidate.code === 'ERR_NETWORK' || candidate.code === 'ECONNREFUSED') return true
  if (candidate.isAxiosError === true) return true
  return candidate.name === 'TypeError' && typeof candidate.message === 'string' && /fetch|network|load failed/i.test(candidate.message)
}

function translateKnownMessage(text: string): string | null {
  const lowered = text.toLowerCase()
  if (lowered in CODE_MESSAGES) return CODE_MESSAGES[lowered]
  for (const [pattern, replacement] of MESSAGE_PATTERNS) {
    const match = lowered.match(pattern)
    if (match) return typeof replacement === 'function' ? replacement(match) : replacement
  }
  return null
}

function payloadTexts(payload: Record<string, unknown> | null): string[] {
  if (!payload) return []
  return [
    stringOrNull(firstValue(payload, ['detail', 'Detail'])),
    stringOrNull(firstValue(payload, ['error', 'Error'])),
    stringOrNull(firstValue(payload, ['message', 'Message'])),
  ].filter((value): value is string => Boolean(value))
}

function statusMessage(status: number | undefined, fallback: string): string | null {
  if (status === undefined) return null
  if (status === 401) return SESSION_EXPIRED_MESSAGE
  if (status === 403) return FORBIDDEN_MESSAGE
  if (status === 409) return fallback || 'La información cambió mientras trabajabas. Actualiza e intenta de nuevo.'
  if (status === 413) return 'El archivo supera el tamaño permitido.'
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.'
  if (status >= 500) return fallback || 'El servidor no pudo completar la solicitud. Intenta de nuevo.'
  return null
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isCanceledRequest(error)) return CANCELED_MESSAGE

  const code = apiErrorCode(error)
  // For a known code the backend's `message` is written for the user: show it
  // when it is Spanish, the mapping above otherwise.
  if (code && CODE_MESSAGES[code]) {
    const payload = payloadOf(error)
    const message = payload ? stringOrNull(firstValue(payload, ['message', 'Message'])) : null
    if (message && isSpanishMessage(message)) return message
  }
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]

  const status = apiErrorStatus(error)
  const texts = payloadTexts(payloadOf(error))

  for (const text of texts) {
    const translated = translateKnownMessage(text)
    if (translated) return translated
  }
  for (const text of texts) {
    if (isSpanishMessage(text)) return text
  }

  const byStatus = statusMessage(status, fallback)
  if (byStatus) return byStatus

  if (status === undefined && isNetworkFailure(error)) return NETWORK_ERROR_MESSAGE

  // Errors thrown by our own code carry Spanish copy; anything else
  // (axios, fetch, Cognito SDK) is replaced by the caller's fallback.
  if (status === undefined && error instanceof Error && error.message.trim()) {
    const translated = translateKnownMessage(error.message.trim())
    if (translated) return translated
    if (isSpanishMessage(error.message)) return error.message.trim()
  }

  return fallback
}
