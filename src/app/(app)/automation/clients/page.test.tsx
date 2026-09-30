import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeliveryClientsPage from './page'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { put: vi.fn() }, localSessionRecoveryMessage: () => null }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const clients = [{ client: { id: 'client-1', name: 'ITBEM' }, project_count: 1, conversation_count: 0 }]

function portfolio(unpricedLast30Days?: number) {
  const totals = {
    cost_last_30_days_microusd: 12500,
    ...(unpricedLast30Days === undefined ? {} : { unpriced_executions_last_30_days: unpricedLast30Days }),
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-26T12:00:00.000Z',
    revision: `portfolio-${unpricedLast30Days ?? 'unknown'}`,
    totals: {
      projects: 1, workItems: 0, activeWorkItems: 0, decisionsRequired: 0, blockedWorkItems: 0,
      automationTasks: 0, queuedTasks: 0, runningTasks: 0, attentionTasks: 0,
      costLast30DaysMicros: totals.cost_last_30_days_microusd,
      ...(unpricedLast30Days === undefined ? {} : { unpricedExecutionsLast30Days: unpricedLast30Days }),
    },
    projects: [{
      id: 'project-1', clientId: 'client-1', name: 'Agent Studio', status: 'active', updatedAt: '2026-09-26T11:00:00.000Z',
      client: { id: 'client-1', name: 'ITBEM' }, workItemCount: 0, activeWorkItems: 0, decisionsRequired: 0,
      blockedWorkItems: 0, automationTasks: 0, queuedTasks: 0, runningTasks: 0, attentionTasks: 0,
      costLast30DaysMicros: totals.cost_last_30_days_microusd,
      ...(unpricedLast30Days === undefined ? {} : { unpricedExecutionsLast30Days: unpricedLast30Days }),
      technologyTags: [], runtimeHints: [], workItemsTruncated: false, workItems: [],
    }],
  }
}

function configureSWR(unpricedLast30Days?: number) {
  let call = 0
  mocks.useSWR.mockImplementation(() => {
    const currentCall = call++
    if (currentCall === 0) return { data: clients, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    if (currentCall === 1) return { data: portfolio(unpricedLast30Days), error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
  })
}

describe('DeliveryClientsPage cost coverage', () => {
  beforeEach(() => {
    configureSWR(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it.each([
    { name: 'complete', unpriced: 0, status: 'complete' },
    { name: 'partial', unpriced: 3, status: 'partial' },
    { name: 'unknown', unpriced: undefined, status: 'unknown' },
  ])('renders $name global and per-client coverage without calling the subtotal free', ({ unpriced, status }) => {
    configureSWR(unpriced)

    render(<DeliveryClientsPage />)

    if (status === 'complete') {
      expect(screen.getAllByText(/0\.0125/).length).toBeGreaterThan(0)
      expect(screen.queryByText(/cobertura de precios no confirmada/i)).not.toBeInTheDocument()
    } else {
      expect(screen.getAllByText(/Subtotal USD verificable:/).length).toBeGreaterThan(0)
      if (status === 'partial') {
        expect(screen.getAllByText(/3 ejecuciones sin precio USD verificable/).length).toBeGreaterThan(0)
      } else {
        expect(screen.getAllByText(/el total puede ser mayor o desconocido/i).length).toBeGreaterThan(0)
      }
    }
  })
})
