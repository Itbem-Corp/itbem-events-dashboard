import { EffectivePolicyPanel } from '@/features/automation/effective-policy-panel'
import type { DeliveryEffectivePolicySnapshot } from '@/features/automation/delivery-types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const resolvedSnapshot: DeliveryEffectivePolicySnapshot = {
  schema_version: 1,
  project_id: 'project-1',
  repository: 'github://example/service',
  overrides_considered: false,
  evaluated_at: '2026-08-30T15:00:00Z',
  vault: { revision_id: 'vault-1', version: 2, repository_sha: 'a'.repeat(40), content_sha256: 'b'.repeat(64) },
  policy: {
    schema_version: 1,
    mode: 'merge',
    required_test_kinds: ['unit', 'contract'],
    allowed_target_branches: ['trunk'],
    merge_method: 'squash',
    required_secret_references: ['DATABASE_URL'],
    required_variable_references: [],
    required_health_checks: [],
    required_post_merge_checks: [],
    safety: {
      independent_review: true, exact_sha_evidence: true, vault_reconciliation: true, secret_scan: true,
      maximum_high_findings: 0, maximum_critical_findings: 0, compatibility: true, migrations: true,
      dependency_order: true, environment: true, recovery: true, human_approval: true, force_merge_allowed: false,
    },
    sources: [{ level: 'project', revision_id: 'policy-1', digest: 'c'.repeat(64), approved_at: '2026-08-30T14:00:00Z' }],
    resolved: true,
    missing: [],
    digest: 'd'.repeat(64),
  },
}

describe('EffectivePolicyPanel', () => {
  it('renders verified constraints as evidence, not execution authority', () => {
    render(<EffectivePolicyPanel repository="github://example/service" repositories={['github://example/service']} snapshot={resolvedSnapshot} onRepositoryChange={() => undefined} onRefresh={() => undefined} />)

    expect(screen.getByText('Merge controlado')).toBeInTheDocument()
    expect(screen.getByText('trunk')).toBeInTheDocument()
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('Ninguna (explícito)')).toBeInTheDocument()
    expect(screen.getByText('Revisión independiente')).toBeInTheDocument()
    expect(screen.getByText(/no ejecuta merge ni deploy/i)).toBeInTheDocument()
    expect(screen.getByText('Sin overrides')).toBeInTheDocument()
  })

  it('keeps an unavailable projection visibly blocked and refreshable', () => {
    const refresh = vi.fn()
    render(<EffectivePolicyPanel repository="github://example/service" repositories={['github://example/service']} unavailable onRepositoryChange={() => undefined} onRefresh={refresh} />)

    expect(screen.getByText('No se pudo verificar la política')).toBeInTheDocument()
    expect(screen.getByText(/merge y release permanecen bloqueados/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar política efectiva' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('switches only to an explicitly selected Vault repository', () => {
    const select = vi.fn()
    render(<EffectivePolicyPanel repository="github://example/service" repositories={['github://example/service', 'github://example/worker']} snapshot={resolvedSnapshot} onRepositoryChange={select} onRefresh={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'example/worker' }))
    expect(select).toHaveBeenCalledWith('github://example/worker')
  })
})
