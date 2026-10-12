// Pure helpers for the metrics daily-activity chart. Each `day` from
// GET /api/metrics/portfolio is a UTC midnight (backend
// models/ProductMetricDaily.go), so dates are formatted in UTC: formatting in
// the viewer's zone shows the previous day anywhere west of UTC (Mexico).

export type DailyActivityPoint = readonly [day: string, requests: number]

const SHORT_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }
const LONG_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }

export function formatUtcDay(day: string, style: 'short' | 'long' = 'short'): string {
  const date = new Date(day)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('es-MX', style === 'long' ? LONG_DAY : SHORT_DAY)
}

export function formatRequests(value: number): string {
  return value.toLocaleString('es-MX')
}

export type DailyActivitySummary = {
  max: number
  maxDay: string | null
  /** First, middle and last day (deduplicated) for the X axis. */
  axisDays: string[]
  ariaLabel: string
}

export function summarizeDailyActivity(activity: readonly DailyActivityPoint[]): DailyActivitySummary {
  let max = 0
  let maxDay: string | null = null
  for (const [day, requests] of activity) {
    if (maxDay === null || requests > max) {
      max = requests
      maxDay = day
    }
  }

  const axisIndexes = activity.length ? [0, Math.floor((activity.length - 1) / 2), activity.length - 1] : []
  const axisDays = [...new Set(axisIndexes)].map((index) => activity[index][0])

  const dayCount = activity.length
  const ariaLabel = maxDay
    ? `Actividad diaria: ${dayCount} ${dayCount === 1 ? 'día' : 'días'}; máximo ${formatRequests(max)} ${
        max === 1 ? 'solicitud' : 'solicitudes'
      } el ${formatUtcDay(maxDay, 'long')}`
    : 'Actividad diaria: sin datos'

  return { max, maxDay, axisDays, ariaLabel }
}
