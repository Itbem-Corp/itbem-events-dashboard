/**
 * Host guest write refusals from the backend (POST /guests, POST /guests/batch, PUT /guests/:id).
 *
 * 400 `{message (Spanish), error: code}` with code one of guest_field_too_long, invalid_rsvp_status,
 * invalid_party_size or party_size_exceeds_max_guests; on a batch the message starts with
 * "Invitado N: " (1-based row). A seated guest whose party grows past the table gets 409
 * table_over_capacity. Limits mirror models/GuestLimits.go and guest_write_validation.go.
 */

export const GUEST_PARTY_SIZE_MAX = 100

export const GUEST_TEXT_LIMITS = {
  first_name: 200,
  last_name: 200,
  nickname: 120,
  email: 254,
  phone: 50,
  role: 120,
  headline: 300,
  signature: 300,
  bio: 4000,
  image_url: 2048,
  dietary_restrictions: 255,
  notes: 2000,
} as const

export type GuestTextField = keyof typeof GUEST_TEXT_LIMITS
export type GuestWriteField = GuestTextField | 'guests_count' | 'max_guests'

export function tooLongMessage(max: number): string {
  return `Máximo ${max} caracteres`
}

// Backend labels (models/GuestLimits.go) of the fields the dashboard edits.
const LABEL_TO_FIELD: Record<string, GuestTextField> = {
  nombre: 'first_name',
  apellido: 'last_name',
  apodo: 'nickname',
  correo: 'email',
  telefono: 'phone',
  rol: 'role',
  encabezado: 'headline',
  firma: 'signature',
  biografia: 'bio',
  imagen: 'image_url',
  'restricciones alimentarias': 'dietary_restrictions',
  notas: 'notes',
}

const DEFAULT_MESSAGES: Record<string, string> = {
  guest_field_too_long: 'Un campo supera el largo permitido.',
  invalid_rsvp_status: 'Estado de confirmación inválido. Usa pendiente, confirmado o declinado.',
  invalid_party_size: `El número de invitados debe estar entre 0 y ${GUEST_PARTY_SIZE_MAX}.`,
  party_size_exceeds_max_guests: 'Los asistentes superan el máximo de invitados.',
  table_over_capacity: 'La mesa del invitado no tiene lugar suficiente para ese número de asistentes.',
}

export interface GuestWriteError {
  code: string
  /** Spanish message without the batch "Invitado N: " prefix. */
  message: string
  field?: GuestWriteField
  /** 1-based row of a batch import, when the server named it. */
  row?: number
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function readGuestWriteError(error: unknown): GuestWriteError | null {
  if (!error || typeof error !== 'object') return null
  const response = (error as { response?: { status?: unknown; data?: unknown } }).response
  const status = response?.status
  const data = response?.data
  if ((status !== 400 && status !== 409) || !data || typeof data !== 'object') return null
  const payload = data as Record<string, unknown>
  const code = [payload.code, payload.error].find((value) => typeof value === 'string' && value in DEFAULT_MESSAGES) as
    string | undefined
  if (!code) return null
  if (status === 409 && code !== 'table_over_capacity') return null

  let message = typeof payload.message === 'string' ? payload.message.trim() : ''
  let row: number | undefined
  const prefix = /^Invitado (\d+):\s*/.exec(message)
  if (prefix) {
    row = Number(prefix[1])
    message = message.slice(prefix[0].length)
  }
  if (!message) message = DEFAULT_MESSAGES[code]

  let field: GuestWriteField | undefined
  if (code === 'guest_field_too_long') {
    const label = /«([^»]+)»/.exec(message)?.[1]
    field = label ? LABEL_TO_FIELD[normalize(label)] : undefined
  } else if (code === 'invalid_party_size') {
    field = /m[aá]ximo de invitados/i.test(message) ? 'max_guests' : 'guests_count'
  } else if (code === 'party_size_exceeds_max_guests' || code === 'table_over_capacity') {
    field = 'guests_count'
  }
  return { code, message, field, row }
}
