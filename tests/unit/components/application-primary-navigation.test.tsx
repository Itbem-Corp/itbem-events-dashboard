import { ApplicationPrimaryNavigation } from '@/components/application-primary-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('ApplicationPrimaryNavigation', () => {
  it('organizes automation around the control center, results, portfolio, and costs', () => {
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
    expect(labels).toEqual(['Inicio', 'Centro de automatización', 'Resultados', 'Portafolio', 'Uso y costos'])
    expect(screen.getByRole('link', { name: 'Resultados' })).toHaveAttribute('data-current', 'true')

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Portafolio' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/clients')
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
})
