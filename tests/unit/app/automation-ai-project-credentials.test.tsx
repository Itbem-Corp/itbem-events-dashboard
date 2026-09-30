import AutomationSettingsPage from '@/app/(app)/automation/settings/page'
import { useStore } from '@/store/useStore'
import {
  automationAIActionPoliciesPath,
  automationAIActionPolicyPath,
  automationProjectProviderCredentialPath,
  automationProjectProviderUsagePath,
  automationProjectProviderUsageRefreshPath,
  automationProviderCatalogPath,
  automationProviderCredentialPath,
  deliveryProjectsPath,
} from '@/lib/api-paths'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet, apiPut, apiPost, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: { get: apiGet, put: apiPut, post: apiPost, delete: apiDelete } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn(), warning: vi.fn() } }))

const projects = [
  { id: 'project-a', name: 'EventiApp', slug: 'eventiapp', client_id: 'client-a', summary: '', status: 'active', created_at: '', updated_at: '', client: { id: 'client-a', name: 'ITBEM' } },
  { id: 'project-b', name: 'Caffetton House', slug: 'caffetton-house', client_id: 'client-b', summary: '', status: 'active', created_at: '', updated_at: '', client: { id: 'client-b', name: 'Caffetton' } },
]

function response(data: unknown) {
  return Promise.resolve({ data: { data } })
}

function projectStatusFromPath(path: string) {
  const match = path.match(/^\/automation\/ai\/projects\/([^/]+)\/providers\/([^/]+)\/credential$/)
  if (!match) return null
  const projectId = decodeURIComponent(match[1])
  const provider = decodeURIComponent(match[2])
  return { project_id: projectId, provider, status: provider === 'openrouter' ? 'stored' : 'not_configured' }
}

function projectUsageFromPath(path: string) {
  const match = path.match(/^\/automation\/ai\/projects\/([^/]+)\/provider-usage$/)
  return match ? decodeURIComponent(match[1]) : null
}

function projectUsageSnapshot(projectId: string, total: string) {
  return {
    project_id: projectId,
    observed_at: '2026-09-24T15:30:00.000Z',
    accounts: [{
      provider: 'DeepSeek',
      status: 'available',
      billing_model: 'token',
      credential_scope: 'project',
      currency: 'USD',
      balance: { total, granted: '0.10', topped_up: '0.90', is_available: true },
    }],
  }
}

function projectProviderCard(providerName: string, providerId: string) {
  const card = screen.getAllByRole('heading', { name: providerName })
    .map((heading) => heading.closest('article'))
    .find((candidate) => candidate?.querySelector(`[name="project-${providerId}-api-key"]`))
  if (!(card instanceof HTMLElement)) throw new Error(`Project credential card not found for ${providerId}`)
  return card
}

function initializeApi(policies: unknown[] = []) {
  apiGet.mockImplementation((path: string) => {
    if (path === deliveryProjectsPath()) return response(projects)
    if (path === automationAIActionPoliciesPath()) return response(policies)
    if (path === automationProviderCatalogPath()) return response({ providers: [] })
    const usageProjectId = projectUsageFromPath(path)
    if (usageProjectId) return response(projectUsageSnapshot(usageProjectId, usageProjectId === 'project-a' ? '1.00' : '2.00'))
    const status = projectStatusFromPath(path)
    if (status) return response(status)
    throw new Error(`Unexpected GET ${path}`)
  })
  apiPut.mockImplementation((path: string) => {
    const status = projectStatusFromPath(path)
    return response(status ? { ...status, status: 'stored' } : {})
  })
  apiPost.mockImplementation((path: string) => {
    const match = path.match(/^\/automation\/ai\/projects\/([^/]+)\/provider-usage\/refresh$/)
    const projectId = match ? decodeURIComponent(match[1]) : null
    return response(projectId ? projectUsageSnapshot(projectId, projectId === 'project-a' ? '1.01' : '2.01') : {})
  })
  apiDelete.mockImplementation((path: string) => {
    const status = projectStatusFromPath(path)
    return response(status ? { ...status, status: 'not_configured' } : {})
  })
}

describe('AI project credentials settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initializeApi()
    useStore.setState({
      applicationSession: {
        application: { id: 'itbem', code: 'itbem', name: 'ITBEM', product_label: 'ITBEM', modules: [], allows_platform_admin: true, is_active: true },
        user: { id: 'root', email: 'root@example.com', first_name: 'Root', last_name: 'User', is_root: true, root_level: 1, is_active: true },
        organizations: [],
        capabilities: [],
      } as never,
      workspaceMode: 'platform',
      currentClient: null,
      profileLoaded: true,
    })
  })

  it('stores and removes credentials only through the selected project API and never reads a key back', async () => {
    const user = userEvent.setup()
    render(<AutomationSettingsPage />)
    await screen.findByRole('option', { name: 'ITBEM · EventiApp' })

    const path = automationProjectProviderCredentialPath('project-a', 'openrouter')
    const openRouterCard = projectProviderCard('OpenRouter Credits', 'openrouter')
    expect(await within(openRouterCard).findByText('Guardada')).toBeInTheDocument()
    expect(within(openRouterCard).queryByDisplayValue('previously-saved-secret')).not.toBeInTheDocument()

    const keyInput = within(openRouterCard).getByLabelText('Clave API de proyecto')
    await user.type(keyInput, 'new-project-secret')
    await user.click(within(openRouterCard).getByRole('button', { name: 'Guardar y rotar' }))
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(path, { api_key: 'new-project-secret' }))
    await waitFor(() => expect(keyInput).toHaveValue(''))
    expect(screen.queryByText('new-project-secret')).not.toBeInTheDocument()
    expect(apiPut).not.toHaveBeenCalledWith(automationProviderCredentialPath('openrouter'), expect.anything())

    await user.click(within(openRouterCard).getByRole('button', { name: 'Quitar credencial del proyecto' }))
    await user.click(within(openRouterCard).getByRole('button', { name: 'Confirmar quitar' }))
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith(path))
    await waitFor(() => expect(within(openRouterCard).getByText('No configurada')).toBeInTheDocument())
    expect(apiDelete).not.toHaveBeenCalledWith(automationProviderCredentialPath('openrouter'))
  })

  it('loads status for the selected project, clears an unsaved input on scope change, and uses the new project path', async () => {
    const user = userEvent.setup()
    render(<AutomationSettingsPage />)
    const selector = await screen.findByLabelText('Proyecto')
    // The field exists while the project request is still loading. Credential
    // cards are intentionally withheld until a project ID has been selected.
    await screen.findByRole('option', { name: 'ITBEM · EventiApp' })
    const deepSeekCard = projectProviderCard('DeepSeek Direct', 'deepseek')
    const keyInput = within(deepSeekCard).getByLabelText('Clave API de proyecto')
    await user.type(keyInput, 'unsaved-for-project-a')

    await user.selectOptions(selector, 'project-b')
    await waitFor(() => expect(keyInput).toHaveValue(''))
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(automationProjectProviderCredentialPath('project-b', 'deepseek')))
    expect(screen.getByRole('region', { name: 'Credenciales de IA por proyecto' })).toHaveTextContent(/credenciales ya quedan separadas por proyecto.*sigue siendo global por tipo de operación/i)

    await user.type(keyInput, 'project-b-secret')
    await user.click(within(deepSeekCard).getByRole('button', { name: 'Guardar en proyecto' }))
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(
      automationProjectProviderCredentialPath('project-b', 'deepseek'),
      { api_key: 'project-b-secret' }
    ))
    expect(apiPut).not.toHaveBeenCalledWith(automationProviderCredentialPath('deepseek'), expect.anything())
  })

  it('loads and refreshes provider usage only for the selected project', async () => {
    const user = userEvent.setup()
    render(<AutomationSettingsPage />)
    await screen.findByRole('option', { name: 'ITBEM · EventiApp' })
    const usagePanel = screen.getByRole('region', { name: 'Saldo y cuotas de proveedores' })
    expect(await within(usagePanel).findByText('1.00 USD')).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith(automationProjectProviderUsagePath('project-a'))

    await user.selectOptions(screen.getByLabelText('Proyecto'), 'project-b')
    expect(await within(usagePanel).findByText('2.00 USD')).toBeInTheDocument()
    expect(within(usagePanel).queryByText('1.00 USD')).not.toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith(automationProjectProviderUsagePath('project-b'))

    await user.click(within(usagePanel).getByRole('button', { name: 'Actualizar cuotas' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(automationProjectProviderUsageRefreshPath('project-b'), {}))
    expect(await within(usagePanel).findByText('2.01 USD')).toBeInTheDocument()
    expect(apiPost).not.toHaveBeenCalledWith(automationProjectProviderUsageRefreshPath('project-a'), {})
  })

  it('does not translate an unknown backend status into a guessed configured state', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === deliveryProjectsPath()) return response(projects.slice(0, 1))
      if (path === automationAIActionPoliciesPath()) return response([])
      if (path === automationProviderCatalogPath()) return response({ providers: [] })
      const usageProjectId = projectUsageFromPath(path)
      if (usageProjectId) return response(projectUsageSnapshot(usageProjectId, '1.00'))
      const status = projectStatusFromPath(path)
      if (status?.provider === 'deepseek') return response({ ...status, status: 'pending' })
      if (status) return response(status)
      throw new Error(`Unexpected GET ${path}`)
    })

    render(<AutomationSettingsPage />)

    await screen.findByRole('option', { name: 'ITBEM · EventiApp' })
    const projectSection = screen.getByRole('region', { name: 'Credenciales de IA por proyecto' })
    await waitFor(() => expect(within(projectSection).getAllByText(/Guardada|No configurada|No se pudo verificar/)).toHaveLength(6))
    const deepSeekCard = projectProviderCard('DeepSeek Direct', 'deepseek')
    expect(await within(deepSeekCard).findByText('No se pudo verificar')).toBeInTheDocument()
    expect(within(deepSeekCard).queryByText('No configurada')).not.toBeInTheDocument()
    expect(within(deepSeekCard).queryByText('Guardada')).not.toBeInTheDocument()
  })

  it('saves the selected action policy with the gateway route contract', async () => {
    const policy = {
      operation: 'code.review',
      configured: true,
      routes: [{ provider: 'deepseek', model: 'deepseek-flash', reasoning_enabled: true, reasoning_effort: 'high' }],
    }
    initializeApi([policy])
    const user = userEvent.setup()
    render(<AutomationSettingsPage />)

    const policyHeading = await screen.findByRole('heading', { name: 'Revisión de código' })
    const policyCard = policyHeading.closest('article')
    if (!(policyCard instanceof HTMLElement)) throw new Error('Code review policy card was not rendered')
    await user.click(within(policyCard).getByRole('button', { name: 'Guardar cadena' }))

    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(automationAIActionPolicyPath('code.review'), {
      routes: [{ provider: 'deepseek', model: 'deepseek-flash', reasoning_enabled: true, reasoning_effort: 'high' }],
    }))
  })
})
