import { ProjectEpicsPanel } from '@/features/automation/project-epics-panel'
import type { DeliveryEpicDetail, DeliveryEpicListPage, DeliveryEpicSummary } from '@/features/automation/delivery-epics'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), query: '' }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get, post: mocks.post, delete: mocks.delete } }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }))
vi.mock('@/components/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const epic: DeliveryEpicSummary = {
  id: 'epic-1', project_id: 'project-1', title: 'Agent Studio', summary: 'Consolidar la operación de agentes.',
  status: 'active', task_count: 1, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-22T10:00:00Z',
}

const projectWorkItems: DeliveryWorkItem[] = [
  { id: 'work-1', project_id: 'project-1', title: 'Colas distribuidas', description: 'No debe exponerse desde el endpoint seguro.', expected_outcome: 'Asignación segura', state: 'implementation', created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-21T10:00:00Z' },
  { id: 'work-2', project_id: 'project-1', title: 'Tarea independiente', description: '', expected_outcome: 'Resultado aislado', state: 'planning', created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-21T10:00:00Z' },
]

function listPayload(canManage = true): DeliveryEpicListPage {
  return { can_manage: canManage, items: [epic], limit: 25 }
}

function detailPayload(canManage = true): DeliveryEpicDetail {
  return {
    can_manage: canManage,
    epic,
    work_items: {
      items: [{ id: 'work-1', title: 'Colas distribuidas', state: 'implementation', added_at: '2026-09-21T10:00:00Z', created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-21T10:00:00Z' }],
      total: 1,
      limit: 20,
    },
  }
}

function response(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function renderPanel(canManage = true) {
  mocks.get.mockImplementation((path: string) => {
    if (path.includes('/automation/projects/project-1/epics')) return Promise.resolve(response(listPayload(canManage)))
    if (path.includes('/automation/epics/epic-1')) return Promise.resolve(response(detailPayload(canManage)))
    return Promise.reject(new Error(`Unexpected GET ${path}`))
  })
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ProjectEpicsPanel projectId="project-1" workItems={projectWorkItems} onProjectChanged={vi.fn()} />
    </SWRConfig>
  )
}

describe('project epics panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = ''
  })

  it('renders first-class project epics and a safe paged detail without exposing task descriptions', async () => {
    renderPanel()

    const openEpic = await screen.findByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' })
    expect(screen.getByText('Épicas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver página de épica: Agent Studio' })).toHaveTextContent('1 tarea asociada')
    expect(screen.getByRole('link', { name: 'Ver página de épica: Agent Studio' })).toHaveAttribute('href', '/automation/epics/epic-1')
    fireEvent.click(openEpic)

    expect(await screen.findByRole('heading', { name: 'Tareas de esta épica' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir página completa' })).toHaveAttribute('href', '/automation/epics/epic-1')
    expect(screen.getByRole('link', { name: 'Colas distribuidas' })).toHaveAttribute('href', '/automation/work-items/work-1')
    expect(screen.queryByText('No debe exponerse desde el endpoint seguro.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Asociar tarea' })).toBeInTheDocument()
  })

  it('restores the project epic filter and cursor when returning from a detail route', async () => {
    mocks.query = 'epic_status=blocked&epic_cursor=project-cursor'
    renderPanel()

    const epicLink = await screen.findByRole('link', { name: 'Ver página de épica: Agent Studio' })
    expect(screen.getByLabelText('Filtrar épicas por estado')).toHaveValue('blocked')
    expect(epicLink).toHaveAttribute('href', '/automation/epics/epic-1?epic_status=blocked&epic_cursor=project-cursor')
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('status=blocked'))
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('cursor=project-cursor'))
  })

  it('hides create, attach, and detach controls when the backend says the actor cannot manage', async () => {
    renderPanel(false)

    expect(await screen.findByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear épica' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' }))

    expect(await screen.findByRole('heading', { name: 'Tareas de esta épica' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Asociar tarea' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar Colas distribuidas de la épica' })).not.toBeInTheDocument()
  })

  it('creates an epic using the canonical body and opens its detail without implying an agent run', async () => {
    const createdEpic = { ...epic, id: 'epic-2', title: 'Nuevo proyecto' }
    mocks.post.mockResolvedValueOnce(response(createdEpic))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Crear épica' }))
    fireEvent.change(screen.getByLabelText('Nombre de la épica'), { target: { value: 'Nuevo proyecto' } })
    fireEvent.change(screen.getByLabelText(/Resumen/), { target: { value: 'Alcance v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar épica' }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/automation/projects/project-1/epics', { title: 'Nuevo proyecto', summary: 'Alcance v1' }))
    expect(await screen.findByText('Épica creada. No se inició ningún agente.')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('/automation/epics/epic-2?tasks_limit=20'))
  })

  it('uses the backend next_cursor to load the next safe task page', async () => {
    const first = detailPayload()
    first.work_items.next_cursor = 'cursor-2'
    const second = detailPayload()
    second.work_items.items = [{ id: 'work-3', title: 'Documentar colas', state: 'planning', added_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-22T10:00:00Z' }]
    second.work_items.total = 2
    mocks.get.mockImplementation((path: string) => {
      if (path.includes('/automation/projects/project-1/epics')) return Promise.resolve(response(listPayload()))
      if (path.includes('/automation/epics/epic-1')) return Promise.resolve(response(path.includes('tasks_cursor=cursor-2') ? second : first))
      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })
    render(
      <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
        <ProjectEpicsPanel projectId="project-1" workItems={projectWorkItems} onProjectChanged={vi.fn()} />
      </SWRConfig>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' }))
    await screen.findByRole('link', { name: 'Colas distribuidas' })
    const nextPageButton = screen.getAllByRole('button', { name: 'Siguiente' }).find((button) => !button.hasAttribute('disabled'))
    expect(nextPageButton).toBeDefined()
    fireEvent.click(nextPageButton!)

    expect(await screen.findByRole('link', { name: 'Documentar colas' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('tasks_cursor=cursor-2'))
  })

  it('filters quick-view tasks by exact state and keeps pagination scoped to that state', async () => {
    const user = userEvent.setup()
    const first = detailPayload()
    const blockedFirst = detailPayload()
    blockedFirst.work_items.items = [{ id: 'work-4', title: 'Bloqueada en primera página', state: 'blocked', added_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-22T10:00:00Z' }]
    blockedFirst.work_items.total = 3
    blockedFirst.work_items.next_cursor = 'blocked-next'
    const blockedSecond = detailPayload()
    blockedSecond.work_items.items = [{ id: 'work-5', title: 'Bloqueada en segunda página', state: 'blocked', added_at: '2026-09-23T10:00:00Z', created_at: '2026-09-23T10:00:00Z', updated_at: '2026-09-23T10:00:00Z' }]
    blockedSecond.work_items.total = 3
    const planning = detailPayload()
    planning.work_items.items = [{ id: 'work-6', title: 'Planeada', state: 'planning', added_at: '2026-09-23T10:00:00Z', created_at: '2026-09-23T10:00:00Z', updated_at: '2026-09-23T10:00:00Z' }]
    planning.work_items.total = 2

    mocks.get.mockImplementation((path: string) => {
      if (path.includes('/automation/projects/project-1/epics')) return Promise.resolve(response(listPayload()))
      if (path.includes('/automation/epics/epic-1')) {
        if (path.includes('tasks_state=blocked') && path.includes('tasks_cursor=blocked-next')) return Promise.resolve(response(blockedSecond))
        if (path.includes('tasks_state=blocked')) return Promise.resolve(response(blockedFirst))
        if (path.includes('tasks_state=planning')) return Promise.resolve(response(planning))
        return Promise.resolve(response(first))
      }
      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })

    render(
      <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
        <ProjectEpicsPanel projectId="project-1" workItems={projectWorkItems} onProjectChanged={vi.fn()} />
      </SWRConfig>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' }))

    let stateFilter = await screen.findByRole('combobox', { name: 'Filtrar tareas de la épica por estado' })
    await screen.findByRole('link', { name: 'Colas distribuidas' })
    expect(mocks.get).toHaveBeenCalledWith('/automation/epics/epic-1?tasks_limit=20')
    expect(stateFilter).toHaveAttribute('aria-describedby', 'epic-work-items-count')
    await user.selectOptions(stateFilter, 'blocked')
    expect(stateFilter).toHaveValue('blocked')
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('tasks_state=blocked')))
    expect(await screen.findByRole('link', { name: 'Bloqueada en primera página' })).toBeInTheDocument()
    expect(screen.getByText('1 en esta página · 3 coinciden con el filtro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agent Studio' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' }).find((button) => !button.hasAttribute('disabled'))!)
    expect(await screen.findByRole('link', { name: 'Bloqueada en segunda página' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('tasks_cursor=blocked-next'))
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('tasks_state=blocked'))

    stateFilter = screen.getByRole('combobox', { name: 'Filtrar tareas de la épica por estado' })
    await user.selectOptions(stateFilter, 'planning')
    expect(await screen.findByRole('link', { name: 'Planeada' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Anterior' }).at(-1)).toBeDisabled()
    const planningRequest = mocks.get.mock.calls.find(([path]) => typeof path === 'string' && path.includes('tasks_state=planning'))?.[0] as string | undefined
    expect(planningRequest).toBeDefined()
    expect(planningRequest).not.toContain('tasks_cursor=')
    expect(mocks.get.mock.calls.filter(([path]) => typeof path === 'string' && path.includes('/automation/projects/project-1/epics'))).toHaveLength(1)
  })

  it('associates a selected existing task, preserving work-item identity', async () => {
    mocks.post.mockResolvedValueOnce(response({ epic_id: epic.id, project_id: epic.project_id, work_item_id: 'work-2', added_at: '2026-09-22T10:00:00Z' }))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir vista rápida de épica: Agent Studio' }))

    const form = await screen.findByRole('button', { name: 'Asociar tarea' }).then((button) => button.closest('form'))
    expect(form).not.toBeNull()
    const select = within(form as HTMLFormElement).getByRole('combobox', { name: 'Tarea del proyecto' })
    fireEvent.change(select, { target: { value: 'work-2' } })
    fireEvent.click(within(form as HTMLFormElement).getByRole('button', { name: 'Asociar tarea' }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/automation/epics/epic-1/work-items', { work_item_id: 'work-2' }))
  })
})
