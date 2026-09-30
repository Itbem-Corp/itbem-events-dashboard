import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AutomationDispatchPage from './page'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  useSWRInfinite: vi.fn(),
  useStore: vi.fn(),
  queuePage: {
    schema_version: 1,
    generated_at: '2026-09-26T12:00:00.000Z',
    items: [
      {
        assignment_id: 'assignment-1',
        execution_id: 'execution-1',
        step_id: 'step-1',
        step_key: 'implement',
        step_title: 'Implementar integración',
        step_status: 'ready',
        assignment_status: 'queued',
        work_item_id: 'work-item-1',
        work_item_title: 'Conectar API y panel',
        work_item_state: 'in_progress',
        project_id: 'project-1',
        project_name: 'Agent Studio',
        client_id: 'client-1',
        client_name: 'ITBEM',
        target_agent_key: 'qa/reviewer' as string | null,
        target_machine_id: 'machine-1',
        target_availability: 'available',
        target_concurrency: 2,
        target_active_runs: 0,
        target_available_slots: 2,
        target_last_seen_at: null,
        queued_at: null,
        dispatched_at: null,
        started_at: null,
        created_at: '2026-09-26T12:00:00.000Z',
        is_ready: true,
      },
    ],
  },
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/store/useStore', () => ({ useStore: mocks.useStore }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherScope: () => (key: unknown) => key }))
vi.mock('@/features/automation/use-agent-directory-stream', () => ({ useAgentDirectoryStream: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('AutomationDispatchPage assignment drill-down', () => {
  beforeEach(() => {
    mocks.queuePage.items[0].target_agent_key = 'qa/reviewer'
    mocks.useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() })
    mocks.useSWRInfinite.mockReturnValue({
      data: [mocks.queuePage],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
      setSize: vi.fn(),
      size: 1,
    })
    mocks.useStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ workspaceMode: 'platform', currentClient: null })
    )
  })

  afterEach(() => cleanup())

  it('links an assignment to its task, project, and payload-identified agent profile', () => {
    render(<AutomationDispatchPage />)

    expect(screen.getByRole('link', { name: 'Conectar API y panel' })).toHaveAttribute(
      'href',
      '/automation/work-items/work-item-1'
    )
    expect(screen.getByRole('link', { name: 'Agent Studio' })).toHaveAttribute(
      'href',
      '/automation/projects/project-1'
    )
    expect(screen.getByRole('link', { name: 'qa/reviewer' })).toHaveAttribute(
      'href',
      '/automation/agents/qa%2Freviewer'
    )
  })

  it.each([null, ''])('does not create an agent profile link when the payload has no agent key (%s)', (agentKey) => {
    mocks.queuePage.items[0].target_agent_key = agentKey
    render(<AutomationDispatchPage />)

    expect(screen.getByText('Sin agente asignado')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sin agente asignado' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conectar API y panel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agent Studio' })).toBeInTheDocument()
  })
})
