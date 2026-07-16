import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const modal = readFileSync(resolve(process.cwd(), 'src/components/clients/client-members-modal.tsx'), 'utf8')

describe('client members resilience', () => {
  it('distinguishes missing workspace data from a failed background refresh', () => {
    expect(modal).toContain('getDataErrorState(membersError, rawMembers)')
    expect(modal).toContain('getDataErrorState(rolesError, rawRoles)')
    expect(modal).toContain("membersErrorState === 'fatal'")
    expect(modal).toContain("membersErrorState === 'stale'")
    expect(modal).toContain('<StaleDataNotice')
  })

  it('reuses intent-preloaded data with the shared deduplication window', () => {
    expect(modal).toContain("import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'")
    expect(modal.match(/responsiveListSwrOptions/g)).toHaveLength(4)
  })

  it('only disables membership actions when required data was never available', () => {
    expect(modal.match(/disabled=\{workspaceFatalError \|\| roles\.length === 0\}/g)).toHaveLength(2)
    expect(modal).not.toContain('disabled={Boolean(workspaceError)')
    expect(modal).toContain("workspaceRetrying ? 'Reintentando…' : 'Reintentar carga'")
  })

  it('delegates temporary credentials to Cognito instead of exposing passwords', () => {
    expect(modal).toContain('Cognito enviará la invitación')
    expect(modal).toContain("'Invitar y asignar'")
    expect(modal).not.toContain('generatePassword')
    expect(modal).not.toContain('pendingPassword')
    expect(modal).not.toContain('password:')
  })
})
