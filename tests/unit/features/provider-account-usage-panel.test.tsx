import { ProviderAccountUsagePanel } from '@/features/automation/provider-account-usage-panel'
import type { ProviderUsageSnapshot } from '@/features/automation/provider-account-usage-panel'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const snapshot: ProviderUsageSnapshot = {
  project_id: 'project-1',
  observed_at: '2026-09-24T15:30:00.000Z',
  accounts: [
    {
      provider: 'OpenRouter',
      status: 'available',
      billing_model: 'token',
      credential_scope: 'project',
      currency: 'USD',
      balance: { total: '0.0372', granted: '0.0100', topped_up: '0.0272', is_available: true },
    },
    {
      provider: 'MiniMax',
      status: 'available',
      billing_model: 'subscription_quota',
      credential_scope: 'project',
      windows: [{ name: 'M3 plan', used: '13.5', limit: '100', remaining: '86.5', unit: 'messages', reset_at: '2026-10-01T00:00:00.000Z' }],
    },
  ],
}

describe('ProviderAccountUsagePanel', () => {
  it('requests a fresh capture and disables refresh while loading or refreshing', () => {
    const onRefresh = vi.fn()
    const view = render(<ProviderAccountUsagePanel projectId="project-1" onRefresh={onRefresh} />)
    const refreshButton = screen.getByRole('button', { name: 'Actualizar cuotas' })
    expect(refreshButton).toBeEnabled()
    fireEvent.click(refreshButton)
    expect(onRefresh).toHaveBeenCalledOnce()

    view.rerender(<ProviderAccountUsagePanel projectId="project-1" loading onRefresh={onRefresh} />)
    expect(screen.getByRole('button', { name: 'Actualizar cuotas' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    view.rerender(<ProviderAccountUsagePanel projectId="project-1" snapshot={snapshot} refreshing onRefresh={onRefresh} />)
    expect(screen.getByRole('button', { name: 'Actualizar cuotas' })).toBeDisabled()
    expect(screen.getByText('Actualizando cuotas…')).toBeInTheDocument()
  })

  it('shows the provider-reported amounts and units verbatim without converting subscription quota to money', () => {
    render(<ProviderAccountUsagePanel projectId="project-1" snapshot={snapshot} onRefresh={vi.fn()} />)

    expect(screen.getByText('0.0372 USD')).toBeInTheDocument()
    expect(screen.getByText('0.0100 USD')).toBeInTheDocument()
    expect(screen.getByText('0.0272 USD')).toBeInTheDocument()
    expect(screen.getByText('13.5 messages')).toBeInTheDocument()
    expect(screen.getByText('100 messages')).toBeInTheDocument()
    expect(screen.getByText('86.5 messages')).toBeInTheDocument()
    expect(screen.getAllByText(/USD/)).toHaveLength(3)
    expect(screen.queryByText('86.5 USD')).not.toBeInTheDocument()
    expect(screen.getByText('M3 plan')).toBeInTheDocument()
  })

  it('does not show a snapshot captured for a different project', () => {
    render(<ProviderAccountUsagePanel projectId="project-2" snapshot={snapshot} onRefresh={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('pertenece a otro proyecto')
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0372 USD')).not.toBeInTheDocument()
  })

  it('communicates empty, failed, and project credential states', () => {
    const onRefresh = vi.fn()
    const empty = render(<ProviderAccountUsagePanel projectId="project-1" onRefresh={onRefresh} />)
    expect(screen.getByText(/Aún no hay una captura/)).toBeInTheDocument()

    empty.rerender(<ProviderAccountUsagePanel projectId="project-1" snapshot={{ project_id: 'project-1', observed_at: '', accounts: [] }} onRefresh={onRefresh} />)
    expect(screen.getByText(/Aún no hay una captura/)).toBeInTheDocument()

    empty.rerender(<ProviderAccountUsagePanel projectId="project-1" error onRefresh={onRefresh} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo consultar')

    empty.rerender(<ProviderAccountUsagePanel projectId="project-1" snapshot={{ ...snapshot, accounts: [
      { provider: 'DeepSeek', status: 'not_configured', billing_model: 'token', credential_scope: 'missing' },
      { provider: 'OpenRouter', status: 'not_supported', billing_model: 'management_api_not_supported', credential_scope: 'separate_management_credential_required' },
    ] }} onRefresh={onRefresh} />)
    expect(screen.getByText('Configura una credencial para este proyecto antes de consultar la cuenta.')).toBeInTheDocument()
    expect(screen.getByText(/OpenRouter requiere una credencial de gestión separada/i)).toBeInTheDocument()
    expect(screen.getByText('No configurado')).toBeInTheDocument()
    expect(screen.getByText('No compatible')).toBeInTheDocument()
  })

  it('keeps the last good capture visible on refresh error and does not render untrusted error details or credential fields', () => {
    const snapshotWithUntrustedFields = {
      ...snapshot,
      accounts: [{
        ...snapshot.accounts[0],
        status: 'error' as const,
        error_code: '<img src=x onerror=alert(1)> sk-live-super-secret',
        api_key: 'sk-live-super-secret',
      }],
    } as unknown as ProviderUsageSnapshot

    render(<ProviderAccountUsagePanel projectId="project-1" snapshot={snapshotWithUntrustedFields} error onRefresh={vi.fn()} />)

    expect(screen.getByText('No se pudo actualizar la captura; se conserva la última consulta correcta.')).toBeInTheDocument()
    expect(screen.getByText('No se pudo consultar esta cuenta.')).toBeInTheDocument()
    expect(screen.queryByText(/sk-live-super-secret|onerror/)).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
