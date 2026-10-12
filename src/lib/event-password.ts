export const EVENT_PASSWORD_MIN_LENGTH = 6
export const EVENT_PASSWORD_MAX_LENGTH = 128

/**
 * Mirrors the backend rule: a new or changed event password must be 6 to 128
 * characters (runes). Clearing it, or re-sending an unchanged legacy short
 * password, is still allowed.
 */
export function eventPasswordError(next: string, stored: string | null | undefined): string | null {
  const value = next.trim()
  if (!value) return null
  if (value === (stored ?? '').trim()) return null
  const length = Array.from(value).length
  if (length < EVENT_PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${EVENT_PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (length > EVENT_PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede tener más de ${EVENT_PASSWORD_MAX_LENGTH} caracteres.`
  }
  return null
}
