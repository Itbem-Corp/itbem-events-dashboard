import { AutomationSectionNavigation } from '@/features/automation/automation-section-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('AutomationSectionNavigation', () => {
  it('keeps every Automation surface reachable from a compact mobile section bar', () => {
    const onIntent = vi.fn()

    render(<AutomationSectionNavigation pathname="/automation/work-items/work-item-1" onIntent={onIntent} />)

    const navigation = screen.getByRole('navigation', { name: 'Secciones de automatización' })
    expect(navigation.getElementsByTagName('a')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Centro' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Resultados' })).toHaveAttribute('href', '/automation/projects')
    expect(screen.getByRole('link', { name: 'Portafolio' })).toHaveAttribute('href', '/automation/clients')
    expect(screen.getByRole('link', { name: 'Uso y costos' })).toHaveAttribute('href', '/automation/costs')
    expect(screen.getByRole('link', { name: 'Uso y costos' })).toHaveTextContent('Costos')

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Uso y costos' }))
    expect(onIntent).toHaveBeenCalledWith('/automation/costs')
  })
})
