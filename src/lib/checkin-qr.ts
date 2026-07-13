import { PUBLIC_INVITATION_TOKEN_QUERY_KEYS } from '@/lib/public-access-params'
import type { Guest } from '@/models/Guest'

const LEGACY_INVITATION_PREFIX = 'invitation_'
const TOKEN_FIELD_KEYS = [
  ...PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  'rsvp_token_id',
  'rsvpTokenId',
  'rsvpTokenID',
  'RSVPTokenID',
  'RSVPTokenId',
] as const
const GUEST_ID_FIELD_KEYS = ['id', 'ID', 'Id', 'guest_id', 'guestId', 'GuestID', 'GuestId'] as const

export type CheckinQrPayload = {
  raw: string
  token: string
  guestId: string
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function cleanRecordString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function firstRecordString(source: unknown, keys: readonly string[]): string {
  if (source === null || typeof source !== 'object') return ''
  const record = source as Record<string, unknown>
  for (const key of keys) {
    const value = cleanRecordString(record[key])
    if (value) return value
  }
  return ''
}

function recordStringValues(source: unknown, keys: readonly string[]): string[] {
  if (source === null || typeof source !== 'object') return []
  const record = source as Record<string, unknown>
  const values: string[] = []
  for (const key of keys) {
    const value = cleanRecordString(record[key])
    if (value && !values.includes(value)) values.push(value)
  }
  return values
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null
  try {
    return asObjectRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function nestedRecord(source: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const record = asObjectRecord(source[key])
    if (record) return record
  }
  return null
}

function jsonRecordCandidates(source: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!source) return []

  const data = nestedRecord(source, 'data', 'Data')
  const candidates = [
    source,
    data,
    nestedRecord(source, 'guest', 'Guest'),
    nestedRecord(source, 'invitation', 'Invitation'),
    data ? nestedRecord(data, 'guest', 'Guest') : null,
    data ? nestedRecord(data, 'invitation', 'Invitation') : null,
  ]

  return candidates.filter((candidate, index): candidate is Record<string, unknown> => {
    return Boolean(candidate) && candidates.indexOf(candidate) === index
  })
}

function firstCandidateString(candidates: Record<string, unknown>[], keys: readonly string[]): string {
  for (const candidate of candidates) {
    const value = firstRecordString(candidate, keys)
    if (value) return value
  }
  return ''
}

function tokenFromSearchParams(searchParams: URLSearchParams): string {
  for (const key of PUBLIC_INVITATION_TOKEN_QUERY_KEYS) {
    const token = clean(searchParams.get(key))
    if (token) return token
  }
  return ''
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function tokenFromUrlPath(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean)
  const tokenIndex = segments.findIndex((segment) => segment.toLowerCase() === 'bytoken')
  return tokenIndex >= 0 && segments[tokenIndex + 1] ? decodePathSegment(segments[tokenIndex + 1]).trim() : ''
}

function tokenFromUrl(value: string): string {
  try {
    const url = new URL(value)
    return tokenFromSearchParams(url.searchParams) || tokenFromUrlPath(url)
  } catch {
    try {
      const url = new URL(value, 'https://eventiapp.local')
      return tokenFromSearchParams(url.searchParams) || tokenFromUrlPath(url)
    } catch {
      return ''
    }
  }
}

export function parseCheckinQrPayload(raw: string): CheckinQrPayload {
  const scanned = raw.trim()
  const jsonCandidates = jsonRecordCandidates(parseJsonRecord(scanned))
  const token =
    tokenFromUrl(scanned) ||
    firstCandidateString(jsonCandidates, TOKEN_FIELD_KEYS) ||
    scanned
  const guestIdFromPayload = firstCandidateString(jsonCandidates, GUEST_ID_FIELD_KEYS)
  const guestId =
    guestIdFromPayload ||
    (token.startsWith(LEGACY_INVITATION_PREFIX) ? token.slice(LEGACY_INVITATION_PREFIX.length).trim() : token)

  return { raw: scanned, token, guestId }
}

export function findGuestByCheckinQr(guests: Guest[], raw: string): { guest?: Guest; payload: CheckinQrPayload } {
  const payload = parseCheckinQrPayload(raw)
  const scannedLower = payload.raw.toLowerCase()
  const nameKey = scannedLower.replace(/\s+/g, '-')

  const guest = guests.find((g) => {
    const guestId = firstRecordString(g, GUEST_ID_FIELD_KEYS)
    const tokens = recordStringValues(g, TOKEN_FIELD_KEYS)
    const email = firstRecordString(g, ['email', 'Email'])
    const firstName = firstRecordString(g, ['first_name', 'firstName', 'FirstName'])
    const lastName = firstRecordString(g, ['last_name', 'lastName', 'LastName'])
    const fullName = `${firstName}-${lastName}`.toLowerCase()
    return (
      guestId === payload.guestId ||
      tokens.includes(payload.token) ||
      email.toLowerCase() === scannedLower ||
      fullName === nameKey
    )
  })

  return { guest, payload }
}
