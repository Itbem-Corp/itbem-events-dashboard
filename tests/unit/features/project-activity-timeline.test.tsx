import {
  PROJECT_ACTIVITY_PAGE_SIZE,
  ProjectActivityTimeline,
  parseProjectActivityPage,
  projectActivityPath,
  type ProjectActivityItem,
  type ProjectActivityPage,
} from '@/features/automation/project-activity-timeline'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetcher: vi.fn() }))

vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))

const projectId = '10000000-0000-4000-8000-000000000001'
const epicId = '20000000-0000-4000-8000-000000000001'
const workItemId = '30000000-0000-4000-8000-000000000001'
const activityId = '40000000-0000-4000-8000-000000000001'

const event: ProjectActivityItem = {
  id: activityId,
  kind: 'step',
  event_type: 'status_transitioned',
  from_status: 'planned',
  to_status: 'ready',
  summary: 'Step status changed',
  client_id: '11000000-0000-4000-8000-000000000001',
  project_id: projectId,
  epic_id: epicId,
  work_item_id: workItemId,
  plan_id: '12000000-0000-4000-8000-000000000001',
  plan_version: 2,
  step_id: '13000000-0000-4000-8000-000000000001',
  automation_task_id: '14000000-0000-4000-8000-000000000001',
  run_id: '50000000-0000-4000-8000-000000000001',
  worker_id: '60000000-0000-4000-8000-000000000001',
  agent_key: 'builder',
  machine_id: '70000000-0000-4000-8000-000000000001',
  agent_instance_id: '80000000-0000-4000-8000-000000000001',
  occurred_at: '2026-09-24T10:15:00Z',
}

function page(overrides: Partial<ProjectActivityPage> = {}): ProjectActivityPage {
  return { project_id: projectId, items: [event], next_cursor: null, ...overrides }
}

function renderTimeline(fixedEpicId?: string) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ProjectActivityTimeline projectId={projectId} fixedEpicId={fixedEpicId} workItems={[{ id: workItemId, title: 'Preparar el módulo' }]} />
    </SWRConfig>,
  )
}

describe('project activity timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetcher.mockImplementation((path: string) => {
      if (path.includes('/activity')) return Promise.resolve(page())
      if (path.includes('/epics?')) return Promise.resolve({ items: [{ id: epicId, title: 'Entrega inicial', status: 'active', task_count: 1, created_at: '', updated_at: '' }], next_cursor: null })
      if (path.includes('/automation/epics/')) return Promise.resolve({
        epic: { id: epicId, project_id: projectId, title: 'Entrega inicial', status: 'active', task_count: 1, created_at: '', updated_at: '' },
        work_items: { items: [{ id: workItemId, title: 'Preparar el módulo', state: 'active', added_at: '', created_at: '', updated_at: '' }], total: 1 },
      })
      throw new Error(`Unexpected request: ${path}`)
    })
  })

  it('builds the authenticated project activity URL with cursor and supported filters', () => {
    expect(PROJECT_ACTIVITY_PAGE_SIZE).toBe(25)
    expect(projectActivityPath(projectId, 'older cursor', {
      epic_id: epicId,
      work_item_id: workItemId,
      agent_key: 'builder',
      agent_instance_id: '80000000-0000-4000-8000-000000000001',
      worker_id: '60000000-0000-4000-8000-000000000001',
      machine_id: '70000000-0000-4000-8000-000000000001',
      run_id: '50000000-0000-4000-8000-000000000001',
      kind: 'assignment',
      action: 'tool',
      status: 'running',
      from: '2026-09-24T10:00:00.000Z',
      to: '2026-09-24T11:00:00.000Z',
    })).toBe(
      `/automation/projects/${projectId}/activity?limit=25&cursor=older+cursor&epic_id=${epicId}&work_item_id=${workItemId}&agent_key=builder&agent_instance_id=80000000-0000-4000-8000-000000000001&worker_id=60000000-0000-4000-8000-000000000001&machine_id=70000000-0000-4000-8000-000000000001&run_id=50000000-0000-4000-8000-000000000001&kind=assignment&action=tool&status=running&from=2026-09-24T10%3A00%3A00.000Z&to=2026-09-24T11%3A00%3A00.000Z`,
    )
  })

  it('parses only the documented project activity allowlist and verifies project scope', () => {
    const unsafe = {
      ...event,
      private_reasoning: 'private-reasoning-canary',
      payload: 'secret-payload-canary',
      prompt: 'private-prompt-canary',
    }
    const parsed = parseProjectActivityPage({ data: { ...page({ items: [unsafe] }) } }, projectId)
    expect(parsed.items[0]).not.toHaveProperty('private_reasoning')
    expect(parsed.items[0]).not.toHaveProperty('payload')
    expect(() => parseProjectActivityPage(page({ project_id: 'other-project' }), projectId)).toThrow('no corresponde')
    expect(() => parseProjectActivityPage(page({ items: [{ ...event, kind: 'reasoning' as ProjectActivityItem['kind'] }] }), projectId)).toThrow('tipo de movimiento')
  })

  it('does not fetch until opened and renders project/task drilldown without private payloads', async () => {
    renderTimeline()
    expect(mocks.fetcher).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }))
    expect(await screen.findByText('Step status changed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preparar el módulo' })).toHaveAttribute('href', `/automation/work-items/${workItemId}`)
    expect(screen.getByText(/builder · 80000000/)).toBeInTheDocument()
    expect(screen.queryByText(/private-reasoning-canary|secret-payload-canary|private-prompt-canary/i)).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledWith(`/automation/projects/${projectId}/activity?limit=25`)
  })

  it('keeps the activity scope locked to a supplied epic when filters are cleared', async () => {
    renderTimeline(epicId)
    expect(mocks.fetcher).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }))
    expect(await screen.findByText('Step status changed')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Épica \(puedes buscar/)).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining(`/activity?limit=25&epic_id=${epicId}`))

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(mocks.fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/activity?limit=25&epic_id=${epicId}`)))
  })

  it('exposes only backend action and status allowlists', async () => {
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }))
    const action = await screen.findByLabelText('Acción') as HTMLSelectElement
    const status = screen.getByLabelText('Estado') as HTMLSelectElement

    expect(Array.from(action.options, (option) => option.value)).toEqual([
      '', 'inference', 'tool', 'file_read', 'file_change', 'command', 'validation', 'evidence',
      'step_ready', 'step_claimed', 'lease_reclaimed', 'lease_renewed', 'status_transitioned',
      'assignment_created', 'status_changed', 'target_changed', 'status_and_target_changed',
    ])
    expect(Array.from(status.options, (option) => option.value)).toEqual([
      '', 'planned', 'ready', 'running', 'blocked', 'completed', 'failed', 'skipped',
      'pending', 'queued', 'dispatched', 'cancelled', 'started',
    ])
  })

  it('applies epic and dependent task filters, then advances by opaque cursor', async () => {
    mocks.fetcher.mockImplementation((path: string) => {
      if (path.includes('/activity')) return Promise.resolve(path.includes('cursor=') ? page({ items: [{ ...event, id: 'next-page-event' }] }) : page({ next_cursor: 'opaque-cursor' }))
      if (path.includes('/epics?')) return Promise.resolve({ items: [{ id: epicId, title: 'Entrega inicial', status: 'active', task_count: 1, created_at: '', updated_at: '' }], next_cursor: null })
      if (path.includes('/automation/epics/')) return Promise.resolve({
        epic: { id: epicId, project_id: projectId, title: 'Entrega inicial', status: 'active', task_count: 1, created_at: '', updated_at: '' },
        work_items: { items: [{ id: workItemId, title: 'Preparar el módulo', state: 'active', added_at: '', created_at: '', updated_at: '' }], total: 1 },
      })
      throw new Error(`Unexpected request: ${path}`)
    })
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }))
    expect(await screen.findByText('Step status changed')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Épica/), { target: { value: epicId } })
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining(`/automation/epics/${epicId}?`)))
    await waitFor(() => expect(document.querySelector(`datalist option[value="${workItemId}"]`)).not.toBeNull())
    fireEvent.change(screen.getByLabelText(/Tarea/), { target: { value: workItemId } })
    fireEvent.change(screen.getByLabelText('Tipo de registro'), { target: { value: 'step' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(mocks.fetcher).toHaveBeenLastCalledWith(
      `/automation/projects/${projectId}/activity?limit=25&epic_id=${epicId}&work_item_id=${workItemId}&kind=step`,
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(mocks.fetcher).toHaveBeenLastCalledWith(
      `/automation/projects/${projectId}/activity?limit=25&cursor=opaque-cursor&epic_id=${epicId}&work_item_id=${workItemId}&kind=step`,
    ))
    expect(await screen.findByText(/Página 2 ·/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByText(/Página 1 ·/)).toBeInTheDocument()
  })
})
