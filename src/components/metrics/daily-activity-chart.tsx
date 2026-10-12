'use client'

import {
  formatRequests,
  formatUtcDay,
  summarizeDailyActivity,
  type DailyActivityPoint,
} from '@/lib/daily-activity-chart'

type Props = {
  activity: readonly DailyActivityPoint[]
  /** shell.accessibleShell: values, axes, a text alternative and UTC dates. */
  accessible?: boolean
}

/**
 * Bars of completed requests per day on /metrics. Without `accessible` it
 * renders the original markup unchanged (Cafetton House); EventiApp opts in
 * through its product shell.
 */
export function DailyActivityChart({ activity, accessible = false }: Props) {
  if (!activity.length) return null
  return accessible ? <AccessibleDailyActivityChart activity={activity} /> : <LegacyDailyActivityChart activity={activity} />
}

function LegacyDailyActivityChart({ activity }: { activity: readonly DailyActivityPoint[] }) {
  const maxDailyRequests = Math.max(1, ...activity.map(([, requests]) => requests))
  return (
    <>
      <div className="mt-7 flex h-36 items-end gap-1.5" aria-label="Actividad diaria">
        {activity.map(([day, requests]) => (
          <div
            key={day}
            title={`${new Date(day).toLocaleDateString('es-MX')}: ${requests.toLocaleString('es-MX')}`}
            className="group relative flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-md bg-(--tenant-accent)/45 transition-colors group-hover:bg-(--tenant-accent)"
              style={{ height: `${Math.max(4, (requests / maxDailyRequests) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-muted">
        <span>{new Date(activity[0][0]).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(activity.at(-1)![0]).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
      </div>
    </>
  )
}

function AccessibleDailyActivityChart({ activity }: { activity: readonly DailyActivityPoint[] }) {
  const { max, axisDays, ariaLabel } = summarizeDailyActivity(activity)
  const scale = Math.max(1, max)

  return (
    <div className="mt-7">
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="flex h-36 w-10 shrink-0 flex-col justify-between text-right text-xs text-ink-muted tabular-nums"
          data-testid="daily-activity-y-axis"
        >
          <span>{formatRequests(max)}</span>
          <span>0</span>
        </div>
        <div
          role="img"
          aria-label={ariaLabel}
          className="relative flex h-36 min-w-0 flex-1 items-end gap-1 border-b border-l border-border-subtle sm:gap-1.5"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border-subtle" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border-subtle" />
          {activity.map(([day, requests]) => (
            <div
              key={day}
              title={`${formatUtcDay(day, 'long')}: ${formatRequests(requests)} solicitudes`}
              className="group relative flex h-full min-w-0 flex-1 items-end"
            >
              <div
                className="w-full rounded-t-md bg-(--tenant-accent)/60 transition-colors group-hover:bg-(--tenant-accent)"
                style={{ height: `${requests > 0 ? Math.max(4, (requests / scale) * 100) : 0}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between pl-12 text-xs text-ink-muted" data-testid="daily-activity-x-axis">
        {axisDays.map((day) => (
          <span key={day}>{formatUtcDay(day)}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Solicitudes completadas por día</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Solicitudes</th>
          </tr>
        </thead>
        <tbody>
          {activity.map(([day, requests]) => (
            <tr key={day}>
              <td>{formatUtcDay(day, 'long')}</td>
              <td>{formatRequests(requests)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
