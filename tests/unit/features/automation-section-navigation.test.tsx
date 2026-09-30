import { AutomationSectionNavigation } from '@/features/automation/automation-section-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('AutomationSectionNavigation', () => {
  it('keeps every Automation surface reachable from a compact mobile section bar', () => {
    const onIntent = vi.fn()

    render(<AutomationSectionNavigation pathname="/automation/work-items/work-item-1" onIntent={onIntent} />)

    const navigation = screen.getByRole('navigation', { name: 'Secciones de automatización' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(7)
    expect(navigation.firstElementChild).toHaveClass('grid-cols-7')
    expect(screen.getByRole('link', { name: 'Centro' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/automation/projects')
    expect(screen.getByRole('link', { name: 'Agentes' })).toHaveAttribute('href', '/automation/agents')
    expect(screen.getByRole('link', { name: 'Colas y despacho' })).toHaveAttribute('href', '/automation/dispatch')
    expect(screen.getByRole('link', { name: 'Recurrentes' })).toHaveAttribute('href', '/automation/recurrences')
    expect(screen.getByRole('link', { name: 'Portafolio' })).toHaveAttribute('href', '/automation/clients')
    expect(screen.getByRole('link', { name: 'Uso y costos' })).toHaveAttribute('href', '/automation/costs')
    expect(screen.getByRole('link', { name: 'Uso y costos' })).toHaveTextContent('Costos')

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Colas y despacho' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/dispatch')

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Uso y costos' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/costs')
  })

  it('marks the agents directory as the active section', () => {
    render(<AutomationSectionNavigation pathname="/automation/agents" onIntent={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Agentes' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches mobile grid columns with configuration access and retains responsive visibility', () => {
    const { rerender } = render(<AutomationSectionNavigation pathname="/automation" onIntent={vi.fn()} />)
    const navigation = screen.getByRole('navigation', { name: 'Secciones de automatización' })
    expect(navigation).toHaveClass('lg:hidden')
    expect(navigation.firstElementChild).toHaveClass('grid-cols-7')
    expect(navigation.firstElementChild).not.toHaveClass('grid-cols-8')

    rerender(<AutomationSectionNavigation pathname="/automation" onIntent={vi.fn()} canManageConfiguration />)
    expect(navigation.firstElementChild).toHaveClass('grid-cols-8')
    expect(navigation.firstElementChild).not.toHaveClass('grid-cols-7')
    expect(navigation.getElementsByTagName('a')).toHaveLength(8)
    const settings = screen.getByRole('link', { name: 'Configuración de IA' })
    expect(settings.children[0]).toHaveClass('sm:hidden')
    expect(settings.children[1]).toHaveClass('hidden', 'sm:inline')

    rerender(<AutomationSectionNavigation pathname="/automation" onIntent={vi.fn()} />)
    expect(navigation.firstElementChild).toHaveClass('grid-cols-7')
    expect(navigation.getElementsByTagName('a')).toHaveLength(7)
    expect(screen.queryByRole('link', { name: 'Configuración de IA' })).not.toBeInTheDocument()
  })

  it('adds IA configuration to the mobile automation navigation only for Root 1', () => {
    render(<AutomationSectionNavigation pathname="/automation/settings" onIntent={vi.fn()} canManageConfiguration />)

    const navigation = screen.getByRole('navigation', { name: 'Secciones de automatización' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(8)
    expect(navigation.firstElementChild).toHaveClass('grid-cols-8')
    expect(screen.getByRole('link', { name: 'Configuración de IA' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Configuración de IA' })).toHaveAttribute('href', '/automation/settings')
  })
})
