import {
  AgentInstanceRegistry,
  isValidAgentMachineID,
  isValidEd25519PublicKey,
  parseAgentInstanceRegistry,
} from '@/features/automation/agent-instance-registry'
import { automationAgentInstancePath, automationAgentInstancesPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  fetcher: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  mutate: vi.fn(),
  registryResult: undefined as unknown,
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/lib/api', () => ({ api: { post: mocks.post, delete: mocks.delete } }))

const publicKey = 'A'.repeat(43)
const existingMachineID = '11111111-2222-4333-8444-555555555555'
const registeredMachineID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const registeredInstanceID = '123e4567-e89b-42d3-a456-426614174000'
const instance = {
  id: registeredInstanceID,
  agent_key: 'frontend-specialist',
  machine_id: existingMachineID,
  public_key_fingerprint: 'SHA256:public-fingerprint-only',
  status: 'active',
  created_at: '2026-09-24T12:00:00Z',
  last_seen_at: '2026-09-24T12:10:00Z',
}
const profiles = [{ agent_key: 'frontend-specialist', name: 'Frontend Specialist' }]

function registryHookResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { instances: [instance] },
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: mocks.mutate,
    ...overrides,
  }
}

describe('agent instance registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.registryResult = registryHookResult()
    mocks.useSWR.mockImplementation((key: string | null) =>
      key ? mocks.registryResult : registryHookResult({ data: undefined })
    )
    mocks.post.mockResolvedValue({ status: 201, data: { instance } })
    mocks.delete.mockResolvedValue({ status: 200, data: { revoked: true } })
    mocks.mutate.mockResolvedValue(undefined)
  })

  it('validates and registers only a public Ed25519 key, then confirms revocation', async () => {
    const user = userEvent.setup()
    render(<AgentInstanceRegistry profiles={profiles} />)

    expect(screen.getByRole('heading', { name: 'Registro de máquinas locales' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gestionar identidades' }))
    expect(mocks.useSWR).toHaveBeenCalledWith(automationAgentInstancesPath(), expect.any(Function), expect.any(Object))
    expect(screen.getByRole('heading', { name: 'Equipos registrados' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Máquina · ${existingMachineID}`))).toBeInTheDocument()
    expect(screen.getByText('SHA256:public-fingerprint-only')).toBeInTheDocument()
    expect(screen.queryByText(publicKey)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Perfil de agente'), 'frontend-specialist')
    await user.type(screen.getByLabelText(/ID de máquina/), 'new-workstation')
    await user.type(screen.getByLabelText(/Clave pública Ed25519/), publicKey)
    expect(screen.getByRole('button', { name: 'Registrar máquina' })).toBeDisabled()
    expect(mocks.post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/ID de máquina/), { target: { value: registeredMachineID } })
    mocks.post.mockResolvedValueOnce({
      status: 201,
      data: { instance: { ...instance, id: registeredInstanceID, machine_id: registeredMachineID } },
    })
    expect(screen.getByRole('button', { name: 'Registrar máquina' })).toBeDisabled()
    await user.click(screen.getByLabelText(/Confirmo que esta clave pública se generó/))
    expect(screen.getByRole('button', { name: 'Registrar máquina' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Registrar máquina' }))

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(automationAgentInstancesPath(), {
        agent_key: 'frontend-specialist',
        machine_id: registeredMachineID,
        public_key: publicKey,
      })
    )
    expect(screen.getByRole('status')).toHaveTextContent('Máquina registrada.')
    expect(screen.getByLabelText(/Clave pública Ed25519/)).toHaveValue('')
    expect(screen.getByRole('heading', { name: 'Siguiente paso: configurar el equipo local' })).toBeInTheDocument()
    const localSetup = screen.getByRole('region', { name: 'Siguiente paso: configurar el equipo local' }).querySelector('pre')
    expect(localSetup?.textContent).toBe(
      `ITBEM_AGENT_INSTANCE_ID=${registeredInstanceID}\nITBEM_AI_AGENT_KEY=frontend-specialist`
    )

    const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWriteText } })
    await user.click(screen.getByRole('button', { name: 'Copiar configuración' }))
    expect(clipboardWriteText).toHaveBeenCalledWith(
      `ITBEM_AGENT_INSTANCE_ID=${registeredInstanceID}\nITBEM_AI_AGENT_KEY=frontend-specialist`
    )
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Revocar ${existingMachineID}` }))
    expect(screen.getByText(/Esta acción no se puede deshacer/)).toBeInTheDocument()
    expect(mocks.delete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: `Confirmar revocación de ${existingMachineID}` }))
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith(automationAgentInstancePath(registeredInstanceID)))
    expect(screen.getByRole('status')).toHaveTextContent(`Identidad revocada para ${existingMachineID}.`)
  })

  it('shows loading and root-admin authorization errors with an explicit retry', async () => {
    const user = userEvent.setup()
    mocks.registryResult = registryHookResult({ data: undefined, isLoading: true })
    const view = render(<AgentInstanceRegistry profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Gestionar identidades' }))
    expect(screen.getByRole('status')).toHaveTextContent('Cargando identidades registradas')

    mocks.registryResult = registryHookResult({
      data: undefined,
      error: { response: { status: 403 } },
      isLoading: false,
    })
    view.rerender(<AgentInstanceRegistry profiles={profiles} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sólo el admin raíz')
    expect(screen.queryByLabelText(/Clave pública Ed25519/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(mocks.mutate).toHaveBeenCalled()
  })

  it('rejects malformed input and parses only the safe registry projection', () => {
    expect(isValidAgentMachineID(existingMachineID)).toBe(true)
    expect(isValidAgentMachineID(` ${existingMachineID} `)).toBe(true)
    expect(isValidAgentMachineID(existingMachineID.slice(0, -1))).toBe(false)
    expect(isValidAgentMachineID('11111111-2222-4333-8444-55555555555A')).toBe(false)
    expect(isValidAgentMachineID('studio-macbook-01')).toBe(false)
    expect(isValidAgentMachineID('equipo\nprivado')).toBe(false)
    expect(isValidEd25519PublicKey(publicKey)).toBe(true)
    expect(isValidEd25519PublicKey('A'.repeat(42))).toBe(false)
    expect(isValidEd25519PublicKey(`${'A'.repeat(42)}B`)).toBe(false)
    expect(isValidEd25519PublicKey(`${publicKey}=`)).toBe(false)

    const parsed = parseAgentInstanceRegistry({ instances: [{ ...instance, public_key: publicKey }] })
    expect(parsed.instances).toEqual([instance])
    expect(parsed.instances[0]).not.toHaveProperty('public_key')
    expect(() => parseAgentInstanceRegistry({ instances: [{ ...instance, machine_id: 'Studio-Macbook-01' }] })).toThrow(
      'invalid agent instance'
    )
  })
})
