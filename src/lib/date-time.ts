export const GO_ZERO_RFC3339 = '0001-01-01T00:00:00Z'
const DAY_MS = 24 * 60 * 60 * 1000

export function isGoZeroDate(value?: string | null): boolean {
  return !value || value.startsWith('0001-')
}

function validTimeZone(timeZone?: string | null): string | undefined {
  const trimmed = timeZone?.trim()
  if (!trimmed) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date(0))
    return trimmed
  } catch {
    return undefined
  }
}

function calendarDayNumber(date: Date, timeZone?: string | null): number | null {
  const normalizedTimeZone = validTimeZone(timeZone)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    ...(normalizedTimeZone ? { timeZone: normalizedTimeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

export function getCalendarDaysUntil(
  value?: string | null,
  timeZone?: string | null,
  now = new Date()
): number | null {
  if (!value || isGoZeroDate(value)) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime()) || Number.isNaN(now.getTime())) return null

  const currentDay = calendarDayNumber(now, timeZone)
  const targetDay = calendarDayNumber(target, timeZone)
  if (currentDay === null || targetDay === null) return null
  return targetDay - currentDay
}

export function toDateTimeLocalValue(value?: string | null, timeZone?: string | null): string {
  if (!value || isGoZeroDate(value)) return ''
  if (timeZone) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return new Intl.DateTimeFormat('sv-SE', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(' ', 'T')
  }
  return value.slice(0, 16)
}

function parseLocalDateTime(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hour, minute, second = '00'] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

export function addDaysToLocalDateTime(value: string, days: number): string {
  const localMs = parseLocalDateTime(value)
  if (localMs === null) return value

  const date = new Date(localMs)
  date.setUTCDate(date.getUTCDate() + Math.trunc(days))

  return date.toISOString().slice(0, value.length >= 19 ? 19 : 16)
}

export function isLocalDateTimeRangeInvalid(start: string, end: string): boolean {
  if (!start || !end) return false
  const startMs = parseLocalDateTime(start)
  const endMs = parseLocalDateTime(end)
  if (startMs === null || endMs === null) return false
  return endMs <= startMs
}

function offsetMinutesForTimeZone(date: Date, timeZone: string): number | null {
  const formatted = date.toLocaleString('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  })
  const match = formatted.match(/\bGMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const [, signToken, hoursToken, minutesToken] = match
  if (!signToken) return 0

  const hours = Number(hoursToken)
  const minutes = Number(minutesToken ?? '0')
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  const sign = signToken === '-' ? -1 : 1
  return sign * (hours * 60 + minutes)
}

function timezoneOffsetForLocalDateTime(localDateTime: string, timeZone: string): string | null {
  const localMs = parseLocalDateTime(localDateTime)
  if (localMs === null) return null

  let offset = offsetMinutesForTimeZone(new Date(localMs), timeZone)
  if (offset === null) return null

  for (let i = 0; i < 3; i += 1) {
    const candidate = new Date(localMs - offset * 60_000)
    const nextOffset = offsetMinutesForTimeZone(candidate, timeZone)
    if (nextOffset === null || nextOffset === offset) break
    offset = nextOffset
  }

  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

export function toRFC3339(localDateTime: string, timeZone: string): string {
  if (!localDateTime) return localDateTime

  const withSeconds = localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime
  const offset = timezoneOffsetForLocalDateTime(withSeconds, timeZone)
  if (!offset) return `${withSeconds}Z`

  return `${withSeconds}${offset}`
}
