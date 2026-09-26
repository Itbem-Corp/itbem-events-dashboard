import { ProjectProviderCredentials } from '@/features/automation/project-provider-credentials'
import { automationProjectProviderCredentialPath, automationProviderCredentialPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get, put: mocks.put, delete: mocks.delete } }))

const providers = ['minimax', 'deepseek', 'openrouter', 'openai', 'anthropic', 'opencode-go'] as const
const providerLabels = ['MiniMax', 'DeepSeek', 'OpenRouter', 'OpenAI', 'Anthropic', 'OpenCode Go'] as const
const projectId = 'project-loaded-1'
const secretCanary = 'provider-secret-canary-never-render'

function response(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function statusFromPath(path: string, status = 'not_configured') {
  const match = path.match(/^\/automation\/ai\/projects\/([^/]+)\/providers\/([^/]+)\/credential$/)
  if (!match) throw new Error(`unexpected credential path: ${path}`)
  return {
    project_id: decodeURIComponent(match[1]),
    provider: decodeURIComponent(match[2]),
    status,
    // Even if a misbehaving backend includes one, the UI must never surface it.
    api_key: secretCanary,
  }
}

function renderPanel(authenticated = true) {
  return render(
    <ProjectProviderCredentials projectId={projectId} projectName="Proyecto visible" authenticated={authenticated} />,
  )
}

describe('ProjectProviderCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((path: string) => Promise.resolve(response(statusFromPath(path))))
    mocks.put.mockResolvedValue(response({ project_id: projectId, provider: 'openrouter', status: 'stored' }))
    mocks.delete.mockResolvedValue(response({ project_id: projectId, provider: 'openrouter', status: 'not_configured' }))
  })

  it('omits the credential panel and performs no requests while unauthenticated', () => {
    const { container } = renderPanel(false)

    expect(container).toBeEmptyDOMElement()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('reads project-scoped status for each provider without rendering or preloading returned keys', async () => {
    renderPanel()

    await screen.findAllByText('No configurada')
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(providers.length))
    expect(mocks.get.mock.calls.map(([path]) => path).sort()).toEqual(
      providers.map((provider) => automationProjectProviderCredentialPath(projectId, provider)).sort(),
    )
    expect(mocks.get).not.toHaveBeenCalledWith(expect.stringContaining('/automation/ai/providers/'))
    expect(screen.queryByText(secretCanary)).not.toBeInTheDocument()
    for (const providerLabel of providerLabels) {
      expect(screen.getByLabelText(`Clave API de ${providerLabel}`)).toHaveValue('')
    }
  })

  it('saves only to the loaded project endpoint, clears the input, and ignores response key material', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(response(statusFromPath(path, 'not_configured'))))
    mocks.put.mockResolvedValue(response({
      project_id: projectId,
      provider: 'openrouter',
      status: 'stored',
      api_key: secretCanary,
    }))
    renderPanel()

    const card = screen.getByRole('article', { name: 'OpenRouter' })
    const input = await screen.findByLabelText('Clave API de OpenRouter')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: secretCanary } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar en proyecto' }))

    await within(card).findByText('Credencial guardada para este proyecto. El valor no se puede volver a mostrar.')
    expect(mocks.put).toHaveBeenCalledWith(automationProjectProviderCredentialPath(projectId, 'openrouter'), { api_key: secretCanary })
    expect(mocks.put).not.toHaveBeenCalledWith(automationProviderCredentialPath('openrouter'), expect.anything())
    expect(input).toHaveValue('')
    expect(screen.queryByText(secretCanary)).not.toBeInTheDocument()
  })

  it('requires an explicit confirmation before removing a project credential', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(response(statusFromPath(
      path,
      path.includes('/openrouter/') ? 'stored' : 'not_configured',
    ))))
    renderPanel()

    const card = screen.getByRole('article', { name: 'OpenRouter' })
    fireEvent.click(await within(card).findByRole('button', { name: 'Quitar credencial del proyecto' }))
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(within(card).getByRole('group', { name: 'Confirmar retiro de credencial OpenRouter' })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Confirmar quitar' }))

    await within(card).findByText('Credencial quitada de este proyecto.')
    expect(mocks.delete).toHaveBeenCalledWith(automationProjectProviderCredentialPath(projectId, 'openrouter'))
    expect(mocks.delete).not.toHaveBeenCalledWith(automationProviderCredentialPath('openrouter'))
    expect(within(card).getByText('No configurada')).toBeInTheDocument()
  })

  it('shows a safe non-configuring state when the backend denies status access', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path.includes('/deepseek/')) {
        return Promise.reject({ response: { status: 403, data: { message: `denied ${secretCanary}` } } })
      }
      return Promise.resolve(response(statusFromPath(path)))
    })
    renderPanel()

    const card = screen.getByRole('article', { name: 'DeepSeek' })
    expect(await within(card).findByText('Sin permiso para consultar')).toBeInTheDocument()
    expect(within(card).getByRole('status')).toHaveTextContent('El servidor no autorizó consultar esta credencial.')
    expect(within(card).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(within(card).queryByLabelText('Clave API de DeepSeek')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(secretCanary)
    expect(document.body).not.toHaveTextContent('denied')
  })

  it('keeps 403 failures safe and clears the submitted key without exposing backend details', async () => {
    mocks.put.mockRejectedValue({
      response: { status: 403, data: { message: `denied ${secretCanary}`, detail: secretCanary } },
    })
    renderPanel()

    const card = screen.getByRole('article', { name: 'DeepSeek' })
    const input = await screen.findByLabelText('Clave API de DeepSeek')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: secretCanary } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar en proyecto' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('El servidor no autorizó esta acción para tu acceso al proyecto.')
    expect(input).toHaveValue('')
    expect(document.body).not.toHaveTextContent(secretCanary)
    expect(document.body).not.toHaveTextContent('denied')
  })
})
