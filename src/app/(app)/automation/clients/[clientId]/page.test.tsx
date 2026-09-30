import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AutomationClientOverviewPage from './page'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('next/navigation', () => ({ useParams: () => ({ clientId: 'client-1' }) }))
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { put: vi.fn() }, localSessionRecoveryMessage: () => null }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock('@/components/button', () => ({
  Button: ({ children, onClick, outline: _outline, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { outline?: boolean }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))
vi.mock('@/components/product/page-header', () => ({
  PageHeader: ({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1><p>{description}</p>{actions}</header>
  ),
}))
vi.mock('@/components/ui/page-transition', () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

const clients = [{ client: { id: 'client-1', name: 'ITBEM' }, project_count: 1, conversation_count: 0 }]

function snapshot(unpricedLast30Days?: number) {
  const project = {
    id: 'project-1', clientId: 'client-1', name: 'Agent Studio', status: 'active', updatedAt: '2026-09-26T11:00:00.000Z',
    client: { id: 'client-1', name: 'ITBEM' }, workItemCount: 0, activeWorkItems: 0, decisionsRequired: 0,
    blockedWorkItems: 0, automationTasks: 0, queuedTasks: 0, runningTasks: 0, attentionTasks: 0,
    costLast30DaysMicros: 12500,
    ...(unpricedLast30Days === undefined ? {} : { unpricedExecutionsLast30Days: unpricedLast30Days }),
    technologyTags: [], runtimeHints: [], workItemsTruncated: false, workItems: [],
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-26T12:00:00.000Z',
    revision: `client-${unpricedLast30Days ?? 'unknown'}`,
    totals: {
      projects: 1, workItems: 0, activeWorkItems: 0, decisionsRequired: 0, blockedWorkItems: 0,
      automationTasks: 0, queuedTasks: 0, runningTasks: 0, attentionTasks: 0,
      costLast30DaysMicros: 12500,
      ...(unpricedLast30Days === undefined ? {} : { unpricedExecutionsLast30Days: unpricedLast30Days }),
    },
    projects: [project],
  }
}

function configureSWR(unpricedLast30Days?: number) {
  let call = 0
  mocks.useSWR.mockImplementation(() => {
    const currentCall = call++
    if (currentCall === 0) return { data: clients, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    if (currentCall === 1) return { data: { snapshot: snapshot(unpricedLast30Days), costsAvailable: true }, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
  })
}

describe('AutomationClientOverviewPage cost coverage', () => {
  beforeEach(() => {
    configureSWR(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it.each([
    { name: 'complete', unpriced: 0, status: 'complete' },
    { name: 'partial', unpriced: 2, status: 'partial' },
    { name: 'unknown', unpriced: undefined, status: 'unknown' },
  ])('renders $name coverage for company total and project card', ({ unpriced, status }) => {
    configureSWR(unpriced)

    render(<AutomationClientOverviewPage />)

    if (status === 'complete') {
      expect(screen.getAllByText(/0\.0125/).length).toBeGreaterThan(0)
      expect(screen.queryByText(/Subtotal USD verificable:/)).not.toBeInTheDocument()
    } else {
      expect(screen.getAllByText(/Subtotal USD verificable:/).length).toBeGreaterThan(0)
      if (status === 'partial') {
        expect(screen.getAllByText(/2 ejecuciones sin precio USD verificable/).length).toBeGreaterThan(0)
      } else {
        expect(screen.getAllByText(/el total puede ser mayor o desconocido/i).length).toBeGreaterThan(0)
      }
    }
  })
})
