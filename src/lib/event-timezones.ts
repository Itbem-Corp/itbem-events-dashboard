import { toRFC3339 } from '@/lib/date-time'

export interface EventTimezoneOption {
  value: string
  label: string
}

/**
 * Time zones offered in the event form. Labels name the official Mexican zone
 * (Centro, Sureste, Pacífico, Noroeste) and its standard UTC offset so an
 * organizer in Mazatlán or Tijuana can tell them apart. Any IANA zone stored on
 * an event is still accepted (see `eventTimezoneOptions`).
 */
export const EVENT_TIMEZONES: readonly EventTimezoneOption[] = [
  { value: 'America/Mexico_City', label: 'México – Centro (CDMX, Guadalajara) · UTC-6' },
  { value: 'America/Monterrey', label: 'México – Centro (Monterrey) · UTC-6' },
  { value: 'America/Cancun', label: 'México – Sureste (Cancún, Quintana Roo) · UTC-5' },
  { value: 'America/Mazatlan', label: 'México – Pacífico (Mazatlán, La Paz, Tepic) · UTC-7' },
  { value: 'America/Hermosillo', label: 'México – Sonora (Hermosillo) · UTC-7, sin horario de verano' },
  { value: 'America/Tijuana', label: 'México – Noroeste (Tijuana, Mexicali) · UTC-8' },
  { value: 'America/New_York', label: 'EE.UU. (Este)' },
  { value: 'America/Chicago', label: 'EE.UU. (Centro)' },
  { value: 'America/Denver', label: 'EE.UU. (Montaña)' },
  { value: 'America/Los_Angeles', label: 'EE.UU. (Pacífico)' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Lima', label: 'Perú' },
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
]

/**
 * Options for the select. When an existing event uses a zone outside the list,
 * it is added first so editing never silently swaps it for the first option.
 */
export function eventTimezoneOptions(current?: string | null): EventTimezoneOption[] {
  const value = current?.trim()
  if (!value || EVENT_TIMEZONES.some((tz) => tz.value === value)) return [...EVENT_TIMEZONES]
  return [{ value, label: value }, ...EVENT_TIMEZONES]
}

/** True when a `datetime-local` value, read in the event's time zone, is already in the past. */
export function isLocalDateTimeInPast(localDateTime: string | undefined, timeZone: string, now = new Date()): boolean {
  if (!localDateTime) return false
  const time = Date.parse(toRFC3339(localDateTime, timeZone))
  return !Number.isNaN(time) && time < now.getTime()
}
