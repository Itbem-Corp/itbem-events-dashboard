const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(\.\d+)?)?$/

/**
 * The Countdown section's own `targetDate`. A value with no zone is read by
 * the backend in the event's time zone; an empty or missing value means the
 * countdown uses the event date.
 */
export function countdownTargetDateInputValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = value.trim().match(LOCAL_DATE_TIME)
  return match ? match[1] : ''
}

export function hasCountdownTargetDate(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}
