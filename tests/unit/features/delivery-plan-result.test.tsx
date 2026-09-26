import { DeliveryResultPanel } from '@/features/automation/delivery-result-panel'
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { get: mocks.apiGet },
}))

const plan = {
  summary: 'A bounded API and web interface proposal.',
  estimate: '2 days',
  goal_interpretation: 'Build a small API and a web screen that consumes it.',
  autonomy_boundary: 'Planning only; wait for human approval before implementation.',
  context_reviewed: ['Backend workspace', 'Frontend workspace'],
  assumptions: ['Use HTTP and JSON.'],
  implementation_steps: ['Define the health endpoint contract.', 'Build a web screen that reads the endpoint.'],
  files_impacted: ['README.md'],
  risks: ['The deployment target is not configured.'],
  qa_plan: ['Run backend tests.', 'Verify the frontend integration locally.'],
  evidence_plan: ['Keep test output and a browser screenshot.'],
  acceptance_criteria: ['The frontend can read the backend health endpoint.'],
  repository_impact: [
    {
      name: 'Backend local editable',
      reference: 'workspace://itbem-agent-studio-backend',
      revision: '24b00d0',
      role: 'primary',
      impact: 'changes',
      notes: 'Define the HTTP contract.',
    },
    {
      name: 'Frontend local editable',
      reference: 'workspace://itbem-agent-studio-frontend',
      revision: 'a064a7e',
      role: 'supporting',
      impact: 'changes',
      notes: 'Consume the backend contract.',
    },
  ],
  questions: [],
  context_gaps: ['The staging URL has not been registered.'],
  human_decisions: ['Choose whether the first delivery should include a database.'],
  rollback_plan: ['Revert the reviewed changeset.'],
}

function mockPlanResult(structuredResult: unknown) {
  mocks.apiGet.mockResolvedValueOnce({
    data: {
      status: 200,
      message: 'Automation result',
      data: { structured_result: structuredResult },
    },
  })
}

describe('DeliveryResultPanel plan result', () => {
  beforeEach(() => mocks.apiGet.mockReset())

  it('puts the proposed route and open decisions in a readable, navigable summary', async () => {
    mockPlanResult(plan)

    render(<DeliveryResultPanel taskId="11111111-1111-1111-1111-111111111111" onClose={vi.fn()} />)

    const quickRead = await screen.findByRole('article', { name: 'Lectura rápida del plan' })
    expect(Array.from(quickRead.querySelectorAll('dd')).map((value) => value.textContent)).toEqual(['2', '2', '2'])
    expect(screen.getByRole('link', { name: 'Ver repositorios' })).toHaveAttribute('href', '#plan-repository-impact')
    expect(screen.getByRole('link', { name: 'Ver la ruta' })).toHaveAttribute('href', '#plan-implementation-steps')
    expect(screen.getByRole('link', { name: 'Revisar puntos pendientes' })).toHaveAttribute('href', '#plan-open-points')

    const pendingPoints = await screen.findByRole('article', { name: 'Puntos pendientes de la propuesta' })
    expect(within(pendingPoints).getByText('2 elementos')).toBeInTheDocument()
    expect(within(pendingPoints).getByText('The staging URL has not been registered.')).toBeInTheDocument()
    expect(within(pendingPoints).getByText('Choose whether the first delivery should include a database.')).toBeInTheDocument()

    const steps = screen.getByRole('list', { name: 'Ruta de trabajo propuesta' })
    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Define the health endpoint contract.',
      '2Build a web screen that reads the endpoint.',
    ])
    expect(screen.getByText('Resumen propuesto')).toBeInTheDocument()
    expect(screen.getByText('A bounded API and web interface proposal.')).toBeInTheDocument()

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#plan-open-points, #plan-repository-impact, #plan-implementation-steps')).map((element) => element.id)).toEqual([
        'plan-open-points',
        'plan-repository-impact',
        'plan-implementation-steps',
      ])
    })
  })

  it('does not show a dead-end link when the plan has no reported open points', async () => {
    mockPlanResult({ ...plan, context_gaps: [], human_decisions: [] })

    render(<DeliveryResultPanel taskId="11111111-1111-1111-1111-111111111111" onClose={vi.fn()} />)

    await screen.findByRole('article', { name: 'Lectura rápida del plan' })
    expect(screen.queryByRole('article', { name: 'Puntos pendientes de la propuesta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Revisar .*punto pendiente/ })).not.toBeInTheDocument()
  })

  it('rejects malformed optional lists instead of rendering unsafe structures', async () => {
    mockPlanResult({ ...plan, context_gaps: 'not-a-list', human_decisions: 3 })

    render(<DeliveryResultPanel taskId="11111111-1111-1111-1111-111111111111" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Lectura rápida del plan' })).not.toBeInTheDocument())
  })
})
