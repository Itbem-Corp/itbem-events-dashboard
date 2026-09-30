import { ApplicationPrimaryNavigation } from '@/components/application-primary-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('ApplicationPrimaryNavigation', () => {
  it('organizes automation around the control center, results, agents, dispatch, recurrences, traces, portfolio, and costs', () => {
    const onIntent = vi.fn()

    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/projects"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={onIntent}
      />
    )

    const labels = screen.getAllByRole('link').map((link) => link.textContent)
    expect(labels).toEqual(['Inicio', 'Centro de automatización', 'Proyectos', 'Agentes', 'Colas y despacho', 'Recurrentes', 'Trazas', 'Portafolio', 'Uso y costos'])
    expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('data-current', 'true')

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Portafolio' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/clients')
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Trazas' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/traces')
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Colas y despacho' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/dispatch')
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Recurrentes' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/recurrences')
  })

  it('marks the dispatch queue as the active section', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/dispatch"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Colas y despacho' })).toHaveAttribute('data-current', 'true')
  })

  it('marks recurring automation as the active section', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/recurrences"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Recurrentes' })).toHaveAttribute('data-current', 'true')
  })

  it('marks the global trace explorer active', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/traces"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Trazas' })).toHaveAttribute('data-current', 'true')
  })

  it('marks the agents directory active without granting the configuration link', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/agents"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Agentes' })).toHaveAttribute('data-current', 'true')
    expect(screen.queryByRole('link', { name: 'Configuración de IA' })).not.toBeInTheDocument()
  })

  it('hides every automation link when the user cannot view automation', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/agents"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation={false}
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.queryByRole('link', { name: 'Agentes' })).not.toBeInTheDocument()
  })

  it('keeps the control center active while inspecting a live work item', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/work-items/work-item-1"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Centro de automatización' })).toHaveAttribute('data-current', 'true')
  })

  it('shows IA configuration only to the primary platform administrator', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/automation/settings"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageAutomationConfiguration
        canManageMembers={false}
        canViewOrganizations={false}
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Configuración de IA' })).toHaveAttribute('data-current', 'true')
  })

  it('names the ITBEM platform directory as organizations, distinct from Delivery portfolio clients', () => {
    render(
      <ApplicationPrimaryNavigation
        pathname="/clients"
        tenantCode="itbem"
        hasEvents={false}
        canViewMetrics={false}
        canViewUsers={false}
        canViewAudit={false}
        canUseAutomation
        canManageMembers={false}
        canViewOrganizations
        onIntent={vi.fn()}
      />
    )

    expect(screen.getByRole('link', { name: 'Organizaciones' })).toHaveAttribute('data-current', 'true')
    expect(screen.getByRole('link', { name: 'Portafolio' })).toBeVisible()
  })
})
