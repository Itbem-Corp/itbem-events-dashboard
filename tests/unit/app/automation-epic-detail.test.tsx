import DeliveryEpicDetailPage from '@/app/(app)/automation/epics/[epicId]/page'
import type { DeliveryEpicDetail } from '@/features/automation/delivery-epics'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  fetcher: vi.fn(),
  apiPut: vi.fn(),
  detailMutate: vi.fn(),
  projectMutate: vi.fn(),
  epicId: 'epic-1',
  query: '',
  push: vi.fn(),
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/lib/api', () => ({ api: { put: mocks.apiPut } }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ epicId: mocks.epicId }),
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onNavigate: _onNavigate,
    ...props
  }: {
    children: ReactNode
    href: string
    onNavigate?: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const detail: DeliveryEpicDetail = {
  can_manage: false,
  epic: {
    id: 'epic-1',
    project_id: 'project-1',
    title: 'Agent Studio',
    summary: 'Plataforma de operaciones de agentes.',
    status: 'active',
    task_count: 2,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z',
  },
  work_items: {
    items: [
      {
        id: 'work-1',
        title: 'Colas distribuidas',
        state: 'implementation',
        added_at: '2026-09-21T10:00:00Z',
        created_at: '2026-09-20T10:00:00Z',
        updated_at: '2026-09-21T10:00:00Z',
      },
      {
        id: 'work-2',
        title: 'Actividad auditable',
        state: 'planning',
        added_at: '2026-09-22T10:00:00Z',
        created_at: '2026-09-22T10:00:00Z',
        updated_at: '2026-09-22T10:00:00Z',
      },
    ],
    total: 3,
    limit: 2,
    next_cursor: 'next-page-token',
  },
}

const project: DeliveryProject = {
  id: 'project-1',
  client_id: 'client-1',
  name: 'ITBEM Agent Studio',
  slug: 'agent-studio',
  summary: 'Operación y coordinación de agentes.',
  status: 'active',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-09-22T10:00:00Z',
  client: { id: 'client-1', name: 'ITBEM Corp' },
}

function resultFor(key: string | null) {
  if (key?.startsWith('/automation/epics/epic-1?'))
    return { data: detail, error: undefined, isLoading: false, mutate: mocks.detailMutate }
  if (key === '/automation/projects/project-1')
    return { data: project, error: undefined, isLoading: false, mutate: mocks.projectMutate }
  if (key?.startsWith('/automation/costs?')) return {
    data: {
      summary: { executions: 4, unpriced_executions: 0, tasks: 2, total_tokens: 1200, total_cost_microusd: 2400 },
      by_model: [{ provider: 'openrouter', model: 'vendor/model-cheap', executions: 4, total_cost_microusd: 2400 }],
    },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }
  return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
}

describe('automation epic detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.epicId = 'epic-1'
    mocks.query = ''
    detail.can_manage = false
    mocks.apiPut.mockResolvedValue({ data: detail })
    mocks.detailMutate.mockResolvedValue(detail)
    mocks.useSWR.mockImplementation((key: string | null) => resultFor(key))
  })

  it('renders project and epic context with task links to the established task route', () => {
    render(<DeliveryEpicDetailPage />)

    expect(screen.getByRole('heading', { name: 'Agent Studio' })).toBeInTheDocument()
    expect(screen.getByText('Épica del proyecto')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ITBEM Agent Studio' })).toBeInTheDocument()
    expect(screen.getAllByText('ITBEM Corp')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Colas distribuidas/ })).toHaveAttribute(
      'href',
      '/automation/work-items/work-1?from_epic=epic-1'
    )
    expect(screen.getByRole('link', { name: /Actividad auditable/ })).toHaveAttribute(
      'href',
      '/automation/work-items/work-2?from_epic=epic-1'
    )
    expect(screen.getAllByRole('link', { name: 'ITBEM Corp' })).toHaveLength(2)
    for (const clientLink of screen.getAllByRole('link', { name: 'ITBEM Corp' })) {
      expect(clientLink).toHaveAttribute('href', '/automation/clients/client-1')
    }
  })

  it('shows cost and model usage scoped to both the project and epic', () => {
    render(<DeliveryEpicDetailPage />)

    expect(screen.getByRole('heading', { name: 'Resumen operativo · últimos 30 días' })).toBeInTheDocument()
    expect(screen.getByText('$0.0024 USD')).toBeInTheDocument()
    expect(screen.getByText('vendor/model-cheap')).toBeInTheDocument()
    expect(mocks.useSWR.mock.calls.some(([key]) =>
      typeof key === 'string' && key.startsWith('/automation/costs?') && key.includes('project_id=project-1') && key.includes('epic_id=epic-1'),
    )).toBe(true)
  })

  it('labels known USD as a subtotal when some epic calls are unpriced', () => {
    mocks.useSWR.mockImplementation((key: string | null) => key?.startsWith('/automation/costs?')
      ? {
          data: {
            summary: { executions: 4, unpriced_executions: 2, tasks: 2, total_tokens: 1200, total_cost_microusd: 2400 },
            by_model: [{ provider: 'openrouter', model: 'vendor/model-cheap', executions: 4, total_cost_microusd: 2400 }],
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        }
      : resultFor(key))

    render(<DeliveryEpicDetailPage />)

    expect(screen.getByText('Subtotal USD verificable: $0.0024')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 llamadas sin precio USD verificable')
  })

  it('does not present reported USD as a complete total when the coverage counter is missing', () => {
    mocks.useSWR.mockImplementation((key: string | null) => key?.startsWith('/automation/costs?')
      ? {
          data: {
            summary: { executions: 4, tasks: 2, total_tokens: 1200, total_cost_microusd: 2400 },
            by_model: [{ provider: 'openrouter', model: 'vendor/model-cheap', executions: 4, total_cost_microusd: 2400 }],
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        }
      : resultFor(key))

    render(<DeliveryEpicDetailPage />)

    expect(screen.getByText('Subtotal USD verificable: $0.0024')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/no se pudo confirmar la cobertura de precios USD/i)
    expect(screen.queryByText('$0.0024 USD')).not.toBeInTheDocument()
  })

  it('filters epic activity to this epic and does not expose an editable epic scope', () => {
    render(<DeliveryEpicDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }))

    expect(screen.queryByLabelText(/Épica \(puedes buscar/)).not.toBeInTheDocument()
    expect(mocks.useSWR.mock.calls.some(([key]) =>
      typeof key === 'string' && key.includes('/activity?') && key.includes('epic_id=epic-1'),
    )).toBe(true)
  })

  it('keeps task pagination in the URL and uses the backend cursor', () => {
    render(<DeliveryEpicDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(mocks.push).toHaveBeenCalledWith('/automation/epics/epic-1?tasks_cursor=next-page-token', { scroll: false })
  })

  it('returns to the project with its epic filter and cursor restored', () => {
    mocks.query = 'epic_status=blocked&epic_cursor=project-cursor'
    render(<DeliveryEpicDetailPage />)

    const projectReturn = '/automation/projects/project-1?epic_status=blocked&epic_cursor=project-cursor#project-epics'
    expect(screen.getByRole('link', { name: 'Volver al proyecto' })).toHaveAttribute('href', projectReturn)
    expect(screen.getByRole('link', { name: 'Abrir proyecto' })).toHaveAttribute('href', projectReturn)
  })

  it('passes the current task page and project epic filters into work-item detail', () => {
    mocks.query = 'epic_status=blocked&epic_cursor=project-cursor&tasks_cursor=task-page-cursor'
    render(<DeliveryEpicDetailPage />)

    expect(screen.getByRole('link', { name: /Colas distribuidas/ })).toHaveAttribute(
      'href',
      '/automation/work-items/work-1?from_epic=epic-1&epic_status=blocked&epic_cursor=project-cursor&epic_tasks_cursor=task-page-cursor'
    )
  })

  it('keeps API failures visible instead of rendering an empty epic', () => {
    mocks.useSWR.mockImplementation((key: string | null) =>
      key?.startsWith('/automation/epics/')
        ? { data: undefined, error: new Error('No autorizado'), isLoading: false, mutate: vi.fn() }
        : resultFor(key)
    )

    render(<DeliveryEpicDetailPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('No autorizado')
    expect(screen.queryByText('Esta épica todavía no tiene tareas asociadas')).not.toBeInTheDocument()
  })

  it('hides the context editor from users without epic-management permission', () => {
    render(<DeliveryEpicDetailPage />)

    expect(screen.queryByRole('button', { name: 'Editar contexto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Editar contexto de la épica' })).not.toBeInTheDocument()
  })

  it('lets authorized users edit bounded context and revalidates the epic detail', async () => {
    detail.can_manage = true
    render(<DeliveryEpicDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar contexto' }))

    expect(screen.getByText(/No incluyas claves API, tokens ni secretos/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nombre de la épica' })).toHaveAttribute('maxLength', '180')
    expect(screen.getByRole('textbox', { name: 'Resumen de la épica' })).toHaveAttribute('maxLength', '4000')

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la épica' }), {
      target: { value: '  Contexto de agentes  ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Resumen de la épica' }), {
      target: { value: '  Coordina pasos con seguridad.  ' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado de la épica' }), {
      target: { value: 'blocked' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith('/automation/epics/epic-1', {
        title: 'Contexto de agentes',
        summary: 'Coordina pasos con seguridad.',
        status: 'blocked',
      })
    })
    expect(mocks.detailMutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('form', { name: 'Editar contexto de la épica' })).not.toBeInTheDocument()
  })

  it('shows validation and server errors and disables the form while saving', async () => {
    detail.can_manage = true
    render(<DeliveryEpicDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar contexto' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la épica' }), { target: { value: '   ' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Editar contexto de la épica' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un nombre para la épica.')
    expect(mocks.apiPut).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la épica' }), { target: { value: 'Nueva épica' } })
    mocks.apiPut.mockRejectedValueOnce(new Error('El servidor rechazó el cambio'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor rechazó el cambio')
    expect(screen.getByRole('form', { name: 'Editar contexto de la épica' })).toBeInTheDocument()
  })

  it('announces the pending save and disables editable fields until the response arrives', async () => {
    detail.can_manage = true
    let finishRequest: (() => void) | undefined
    mocks.apiPut.mockImplementation(() => new Promise((resolve) => {
      finishRequest = () => resolve({ data: detail })
    }))
    render(<DeliveryEpicDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar contexto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardando contexto…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('textbox', { name: 'Nombre de la épica' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    await act(async () => {
      finishRequest?.()
    })
    await waitFor(() => expect(screen.queryByText('Guardando contexto…')).not.toBeInTheDocument())
  })
})
