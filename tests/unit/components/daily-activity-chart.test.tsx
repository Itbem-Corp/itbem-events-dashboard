import { render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DailyActivityChart } from '@/components/metrics/daily-activity-chart'
import { formatUtcDay, summarizeDailyActivity } from '@/lib/daily-activity-chart'

const activity = [
  ['2026-10-01T00:00:00Z', 120],
  ['2026-10-02T00:00:00Z', 480],
  ['2026-10-03T00:00:00Z', 0],
  ['2026-10-04T00:00:00Z', 60],
  ['2026-10-05T00:00:00Z', 300],
] as const

const originalTz = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/Mexico_City'
})

afterAll(() => {
  process.env.TZ = originalTz
})

describe('daily activity helpers', () => {
  it('formats a UTC-midnight day as that calendar day in Mexico', () => {
    expect(formatUtcDay('2026-10-01T00:00:00Z')).toMatch(/^1 oct/)
    expect(formatUtcDay('2026-10-01T00:00:00Z', 'long')).toContain('1 de octubre de 2026')
  })

  it('summarizes the maximum and the axis days', () => {
    const summary = summarizeDailyActivity(activity)
    expect(summary.max).toBe(480)
    expect(summary.maxDay).toBe('2026-10-02T00:00:00Z')
    expect(summary.axisDays).toEqual(['2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z', '2026-10-05T00:00:00Z'])
    expect(summary.ariaLabel).toBe('Actividad diaria: 5 días; máximo 480 solicitudes el 2 de octubre de 2026')
  })

  it('deduplicates the axis for one day', () => {
    expect(summarizeDailyActivity([['2026-10-01T00:00:00Z', 1]]).axisDays).toEqual(['2026-10-01T00:00:00Z'])
  })
})

describe('DailyActivityChart', () => {
  it('EventiApp (accessible) renders a labelled image, a data table and axes', () => {
    const { container } = render(<DailyActivityChart activity={activity} accessible />)

    const chart = screen.getByRole('img')
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('máximo 480 solicitudes'))

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(activity.length + 1)
    expect(within(table).getByRole('columnheader', { name: 'Día' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Solicitudes' })).toBeInTheDocument()

    const yAxis = screen.getByTestId('daily-activity-y-axis')
    expect(yAxis.firstElementChild).toHaveTextContent('480')
    expect(yAxis.lastElementChild).toHaveTextContent('0')

    const xAxis = screen.getByTestId('daily-activity-x-axis')
    expect(xAxis.firstElementChild?.textContent).toMatch(/^1 oct/)
    expect(xAxis.lastElementChild?.textContent).toMatch(/^5 oct/)
    expect(container.innerHTML).not.toContain('text-[10px]')
  })

  it('Cafetton (default) keeps the original markup', () => {
    const { container } = render(<DailyActivityChart activity={activity} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-label="Actividad diaria"]')).not.toBeNull()
    expect(container.innerHTML).toContain('text-[10px]')
    expect(container.innerHTML).toContain('bg-(--tenant-accent)/45')
  })

  it('renders nothing without data', () => {
    const { container } = render(<DailyActivityChart activity={[]} accessible />)
    expect(container).toBeEmptyDOMElement()
  })
})
