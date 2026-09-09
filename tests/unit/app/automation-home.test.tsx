import AutomationPage from '@/app/(app)/automation/page'
import { automationHealthPath, automationInputUploadPath, automationPortfolioPath, automationTaskRetryCodeReviewPath, automationTasksPath, deliveryProjectsPath, deliveryWorkItemExecutionGraphPath } from '@/lib/api-paths'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  mutateTasks: vi.fn(),
  mutateProjects: vi.fn(),
  mutatePortfolio: vi.fn(),
  useSWR: vi.fn(),
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: { children: ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}))

vi.mock('next/dynamic', () => ({
  default: () => ({ events, title }: { events: Array<{ id: string }>; title: string }) => (
    <div data-testid="execution-graph">{title}: {events.map((event) => event.id).join(', ')}</div>
  ),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, onNavigate: _onNavigate, ...props }: { children: ReactNode; href: string; onNavigate?: unknown }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/components/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('swr', () => ({
  default: mocks.useSWR,
  preload: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
  localSessionRecoveryMessage: () => null,
}))

const projects: DeliveryProject[] = [
  {
    id: 'project-1',
    client_id: 'client-1',
    name: 'Portal de soporte',
    slug: 'portal-soporte',
    summary: 'Mejoras de identidad.',
    status: 'active',
    created_at: '2026-08-11T10:00:00.000Z',
    updated_at: '2026-08-11T12:30:00.000Z',
    client: { id: 'client-1', name: 'Atelier Norte' },
    work_items: [
      {
        id: 'work-item-review',
        project_id: 'project-1',
        title: 'Desplegar identidad',
        description: 'Preparar el plan de identidad.',
        expected_outcome: 'Plan revisable.',
        state: 'plan_review',
        created_at: '2026-08-11T10:00:00.000Z',
        updated_at: '2026-08-11T12:30:00.000Z',
        automation_tasks: [
          {
            id: 'task-plan',
            operation: 'delivery.plan',
            status: 'completed',
            created_at: '2026-08-11T10:20:00.000Z',
          },
        ],
      },
      {
        id: 'work-item-running',
        project_id: 'project-1',
        title: 'Auditar acceso',
        description: 'Validar acceso.',
        expected_outcome: 'Acceso verificado.',
        state: 'implementation',
        created_at: '2026-08-11T10:00:00.000Z',
        updated_at: '2026-08-11T11:30:00.000Z',
        automation_tasks: [
          {
            id: 'task-build',
            operation: 'delivery.implementation',
            status: 'running',
            created_at: '2026-08-11T11:20:00.000Z',
          },
        ],
      },
    ],
  },
]

const looseTasks = [
  {
    id: 'task-quick',
    job_id: 'job-quick',
    operation: 'ai.chat',
    input_ref: 'inputs/task-quick.json',
    output_ref: 'outputs/task-quick.json',
    status: 'completed' as const,
    created_at: '2026-08-11T09:10:00.000Z',
  },
]

function setDefaultSWRData() {
  mocks.useSWR.mockImplementation((key: string) => {
    if (key === automationTasksPath()) return { data: looseTasks, isLoading: false, mutate: mocks.mutateTasks }
    if (key === deliveryProjectsPath()) return { data: projects, isLoading: false, mutate: mocks.mutateProjects }
    if (key === automationPortfolioPath()) return { data: null, isLoading: false, mutate: mocks.mutatePortfolio }
    if (key === deliveryWorkItemExecutionGraphPath('work-item-review')) return { data: undefined, isLoading: false, mutate: vi.fn() }
    if (key === deliveryWorkItemExecutionGraphPath('work-item-running')) return { data: undefined, isLoading: false, mutate: vi.fn() }
    if (key === automationHealthPath()) return { data: { active_workers: 2 }, isLoading: false, mutate: vi.fn() }
    return { data: undefined, isLoading: false, mutate: vi.fn() }
  })
}

describe('AutomationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultSWRData()
    mocks.apiPost.mockResolvedValue({ data: { status: 200, data: {} } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('turns real projects and work items into a live portfolio with the decision flow already expanded', () => {
    render(<AutomationPage />)

    expect(screen.getByRole('heading', { name: 'Centro de automatización' })).toBeInTheDocument()
    expect(screen.getByText('El agente avanza con gates; la plataforma V1 sigue en validación de producción.')).toBeInTheDocument()
    expect(screen.getAllByText('Desplegar identidad')).not.toHaveLength(0)
    expect(screen.getByText('Auditar acceso')).toBeInTheDocument()
    expect(screen.getByText('Atelier Norte · Decisión humana')).toBeInTheDocument()
    expect(screen.getByText('Bandeja de decisiones')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tomar decisión/i })).toBeInTheDocument()
    expect(screen.getByTestId('execution-graph')).toHaveTextContent('task-plan')
    expect(screen.getByRole('link', { name: /Abrir resultado/i })).toHaveAttribute('href', '/automation/work-items/work-item-review')
  })

  it('moves the expanded flow to the selected result instead of duplicating a long detail panel', async () => {
    const user = userEvent.setup()
    render(<AutomationPage />)

    await user.click(screen.getByRole('button', { name: /Abrir flujo de Auditar acceso/i }))

    expect(screen.getByTestId('execution-graph')).toHaveTextContent('task-build')
    expect(screen.getByText('El agente sigue avanzando en las etapas disponibles.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir resultado/i })).toHaveAttribute('href', '/automation/work-items/work-item-running')
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Live steps de Auditar acceso'))
    })
  })

  it('takes a decision directly to the selected live flow without stealing focus on initial load', async () => {
    const user = userEvent.setup()
    render(<AutomationPage />)

    expect(document.activeElement).not.toBe(screen.getByLabelText('Live steps de Desplegar identidad'))

    await user.click(screen.getByRole('button', { name: /Tomar decisi/i }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Live steps de Desplegar identidad'))
    })
  })

  it('keeps the portfolio compact when the active result is collapsed', async () => {
    const user = userEvent.setup()
    render(<AutomationPage />)

    const activeResult = screen.getByRole('button', { name: /Cerrar flujo de Desplegar identidad/i })
    expect(activeResult).toHaveAttribute('aria-expanded', 'true')

    await user.click(activeResult)
    expect(activeResult).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('execution-graph')).not.toBeInTheDocument()

    await user.click(activeResult)
    expect(screen.getByTestId('execution-graph')).toHaveTextContent('task-plan')
  })

  it('summarizes retries by phase and preserves the latest attention state', () => {
    const retryingProjects: DeliveryProject[] = [{
      ...projects[0],
      work_items: [{
        ...projects[0].work_items![0],
        state: 'implementation',
        automation_tasks: [
          { id: 'task-plan-complete', operation: 'delivery.plan', status: 'completed', created_at: '2026-08-11T10:20:00.000Z' },
          { id: 'task-plan-failed', operation: 'delivery.plan', status: 'failed', created_at: '2026-08-11T11:20:00.000Z' },
        ],
      }],
    }]
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationTasksPath()) return { data: [], isLoading: false, mutate: mocks.mutateTasks }
      if (key === deliveryProjectsPath()) return { data: retryingProjects, isLoading: false, mutate: mocks.mutateProjects }
      if (key === automationPortfolioPath()) return { data: null, isLoading: false, mutate: vi.fn() }
      if (key === deliveryWorkItemExecutionGraphPath('work-item-review')) return { data: undefined, isLoading: false, mutate: vi.fn() }
      if (key === automationHealthPath()) return { data: { active_workers: 2 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    // The route stays intentionally quiet: retry detail belongs to Live
    // Steps, while the route only confirms the current phase and total work.
    expect(screen.getByLabelText('Ruta del resultado')).toHaveTextContent('Plan')
    expect(screen.getByText('2 ejecuciones registradas')).toBeInTheDocument()
    expect(screen.getByText('Atención')).toBeInTheDocument()
    expect(screen.queryByText('+1 movimientos')).not.toBeInTheDocument()
  })

  it('clears a historical failure after a successful retry of the same phase', () => {
    const recoveredProjects: DeliveryProject[] = [{
      ...projects[0],
      work_items: [{
        ...projects[0].work_items![0],
        state: 'implementation',
        automation_tasks: [
          { id: 'task-plan-failed', operation: 'delivery.plan', status: 'failed', created_at: '2026-08-11T10:20:00.000Z' },
          { id: 'task-plan-recovered', operation: 'delivery.plan', status: 'completed', created_at: '2026-08-11T10:22:00.000Z' },
        ],
      }],
    }]
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationTasksPath()) return { data: [], isLoading: false, mutate: mocks.mutateTasks }
      if (key === deliveryProjectsPath()) return { data: recoveredProjects, isLoading: false, mutate: mocks.mutateProjects }
      if (key === automationPortfolioPath()) return { data: null, isLoading: false, mutate: vi.fn() }
      if (key === deliveryWorkItemExecutionGraphPath('work-item-review')) return { data: undefined, isLoading: false, mutate: vi.fn() }
      if (key === automationHealthPath()) return { data: { active_workers: 2 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    expect(screen.queryByText('Necesita atención')).not.toBeInTheDocument()
    expect(screen.getByText('La siguiente etapa se prepara automáticamente.')).toBeInTheDocument()
  })

  it('opens an incident before a review that can wait', () => {
    const urgentProjects: DeliveryProject[] = [{
      ...projects[0],
      work_items: [
        projects[0].work_items![0],
        {
          ...projects[0].work_items![1],
          id: 'work-item-incident',
          title: 'Recuperar proveedor',
          state: 'planning',
          updated_at: '2026-08-11T13:30:00.000Z',
          automation_tasks: [
            { id: 'task-incident', operation: 'delivery.plan', status: 'failed', created_at: '2026-08-11T13:20:00.000Z' },
          ],
        },
      ],
    }]
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationTasksPath()) return { data: [], isLoading: false, mutate: mocks.mutateTasks }
      if (key === deliveryProjectsPath()) return { data: urgentProjects, isLoading: false, mutate: mocks.mutateProjects }
      if (key === automationPortfolioPath()) return { data: null, isLoading: false, mutate: vi.fn() }
      if (key === deliveryWorkItemExecutionGraphPath('work-item-incident')) return { data: undefined, isLoading: false, mutate: vi.fn() }
      if (key === automationHealthPath()) return { data: { active_workers: 2 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    expect(screen.getByRole('button', { name: /Cerrar flujo de Recuperar proveedor/i })).toBeInTheDocument()
    expect(screen.getByTestId('execution-graph')).toHaveTextContent('task-incident')
  })

  it('treats a cancellation as a neutral live closure instead of a stale update', () => {
    const cancellingProjects: DeliveryProject[] = [{
      ...projects[0],
      work_items: [{
        ...projects[0].work_items![0],
        state: 'implementation',
        automation_tasks: [
          { id: 'task-stopping', operation: 'delivery.implementation', status: 'cancel_requested', created_at: '2026-08-11T13:20:00.000Z' },
          { id: 'task-queued-before-stop', operation: 'delivery.qa', status: 'queued', created_at: '2026-08-11T13:19:00.000Z' },
        ],
      }],
    }]
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationTasksPath()) return { data: [], isLoading: false, mutate: mocks.mutateTasks }
      if (key === deliveryProjectsPath()) return { data: cancellingProjects, isLoading: false, mutate: mocks.mutateProjects }
      if (key === automationPortfolioPath()) return { data: null, isLoading: false, mutate: vi.fn() }
      if (key === deliveryWorkItemExecutionGraphPath('work-item-review')) return { data: undefined, isLoading: false, mutate: vi.fn() }
      if (key === automationHealthPath()) return { data: { active_workers: 2 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    expect(screen.getAllByText('Deteniéndose')).toHaveLength(2)
    expect(screen.queryByText('En curso')).not.toBeInTheDocument()
    expect(screen.getAllByText('Detención segura').length).toBeGreaterThan(0)
    expect(screen.getByText('La ejecución se está cerrando de forma segura.')).toBeInTheDocument()
    expect(screen.getByTestId('execution-graph')).toHaveTextContent('task-stopping')
  })

  it('uses one honest recovery state instead of stale portfolio signals', () => {
    const unavailable = { status: 503 }
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationTasksPath()) return { data: undefined, error: unavailable, isLoading: false, mutate: mocks.mutateTasks }
      if (key === deliveryProjectsPath()) return { data: undefined, error: unavailable, isLoading: false, mutate: mocks.mutateProjects }
      if (key === automationPortfolioPath()) return { data: undefined, error: unavailable, isLoading: false, mutate: vi.fn() }
      if (key === automationHealthPath()) return { data: undefined, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos sincronizar el portafolio')
    expect(screen.queryByLabelText('Estado del portafolio')).not.toBeInTheDocument()
    expect(screen.queryByText('Actualizado')).not.toBeInTheDocument()
    expect(screen.queryByText('Bandeja de decisiones')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Iniciar resultado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Consulta puntual' })).not.toBeInTheDocument()
  })

  it('keeps point requests out of the portfolio and starts them through the compact quick-query modal', async () => {
    const user = userEvent.setup()
    const uploaded = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', uploaded)
    mocks.apiPost
      .mockResolvedValueOnce({ data: { status: 200, data: { input_ref: 'inputs/new-task.json', upload_url: 'https://uploads.example/input' } } })
      .mockResolvedValueOnce({ data: { status: 201, data: { id: 'task-new' } } })

    render(<AutomationPage />)

    await user.click(screen.getByRole('button', { name: /Consulta puntual/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Consulta rápida')
    await user.click(screen.getByRole('button', { name: 'Documento' }))
    await user.type(screen.getByLabelText('Resultado que buscas'), 'Resume los riesgos del cambio.')
    fireEvent.submit(screen.getByRole('button', { name: 'Enviar' }).closest('form')!)

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenNthCalledWith(1, automationInputUploadPath())
      expect(uploaded).toHaveBeenCalledWith(
        'https://uploads.example/input',
        expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/json' } })
      )
      expect(mocks.apiPost).toHaveBeenNthCalledWith(2, automationTasksPath(), {
        operation: 'document.analyze',
        input_ref: 'inputs/new-task.json',
      })
    })
    expect(mocks.mutateTasks).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tu consulta ya está en movimiento.')
  })

  it('retries a failed standalone GitHub review only for its frozen exact SHA', async () => {
    const user = userEvent.setup()
    const reviewSHA = 'a67f3ec5ccbd9558ab97e105cb9ee68af78cb7a4'
    const failedReviewPortfolio = {
      schemaVersion: 3,
      generatedAt: '2026-09-08T08:10:00.000Z',
      revision: 'portfolio-1',
      totals: {
        projects: 0,
        workItems: 0,
        activeWorkItems: 0,
        decisionsRequired: 0,
        blockedWorkItems: 0,
        automationTasks: 0,
        queuedTasks: 0,
        runningTasks: 0,
        attentionTasks: 0,
        reviewTasks: 1,
        queuedReviews: 0,
        runningReviews: 0,
        attentionReviews: 1,
        publishedReviews: 1,
      },
      projects: [],
      reviewQueue: [{
        taskId: 'review-task-1',
        repository: 'itbem-corp/itbem-events-backend',
        pullRequest: 130,
        headSha: reviewSHA,
        status: 'failed' as const,
        attemptCount: 1,
        verdict: 'comment' as const,
        event: 'COMMENT' as const,
        reviewUrl: 'https://github.com/Itbem-Corp/itbem-events-backend/pull/130#pullrequestreview-1',
        reviewerActor: 'bema-review-bot[bot]',
        createdAt: '2026-09-08T08:04:52.000Z',
        updatedAt: '2026-09-08T08:04:52.000Z',
        publishedAt: '2026-09-08T08:04:52.000Z',
      }],
    }
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationPortfolioPath()) return { data: failedReviewPortfolio, isLoading: false, mutate: mocks.mutatePortfolio }
      if (key === automationHealthPath()) return { data: { active_workers: 0 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)

    render(<AutomationPage />)

    expect(screen.getAllByLabelText(`SHA exacto ${reviewSHA}`)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Reintentar revisión' }))

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.mutatePortfolio).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Reintentar revisión' }))

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining(reviewSHA))
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(automationTaskRetryCodeReviewPath('review-task-1'))
    })
    expect(mocks.mutatePortfolio).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Reintento de revisión en cola para el mismo SHA exacto.')
  })

  it('does not offer a retry for a standalone review that is already published', () => {
    mocks.useSWR.mockImplementation((key: string) => {
      if (key === automationPortfolioPath()) return {
        data: {
          schemaVersion: 3,
          generatedAt: '2026-09-08T08:10:00.000Z',
          revision: 'portfolio-2',
          totals: {
            projects: 0,
            workItems: 0,
            activeWorkItems: 0,
            decisionsRequired: 0,
            blockedWorkItems: 0,
            automationTasks: 0,
            queuedTasks: 0,
            runningTasks: 0,
            attentionTasks: 0,
            reviewTasks: 1,
            queuedReviews: 0,
            runningReviews: 0,
            attentionReviews: 0,
            publishedReviews: 1,
          },
          projects: [],
          reviewQueue: [{
            taskId: 'review-task-complete',
            repository: 'itbem-corp/itbem-events-backend',
            pullRequest: 130,
            headSha: 'a67f3ec5ccbd9558ab97e105cb9ee68af78cb7a4',
            status: 'completed' as const,
            attemptCount: 1,
            verdict: 'comment' as const,
            event: 'COMMENT' as const,
            reviewUrl: 'https://github.com/Itbem-Corp/itbem-events-backend/pull/130#pullrequestreview-1',
            reviewerActor: 'bema-review-bot[bot]',
            createdAt: '2026-09-08T08:04:52.000Z',
            updatedAt: '2026-09-08T08:04:52.000Z',
            completedAt: '2026-09-08T08:04:53.000Z',
            publishedAt: '2026-09-08T08:04:52.000Z',
          }],
        },
        isLoading: false,
        mutate: mocks.mutatePortfolio,
      }
      if (key === automationHealthPath()) return { data: { active_workers: 0 }, isLoading: false, mutate: vi.fn() }
      return { data: undefined, isLoading: false, mutate: vi.fn() }
    })

    render(<AutomationPage />)

    expect(screen.queryByRole('button', { name: 'Reintentar revisión' })).not.toBeInTheDocument()
  })
})
