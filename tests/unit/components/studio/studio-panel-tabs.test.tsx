import type { PanelId } from '@/components/studio/studio-constants'
import { StudioPanelTabs } from '@/components/studio/studio-panel-tabs'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

function PanelTabsHarness({ onPanelIntent }: { onPanelIntent: (panel: PanelId) => void }) {
  const [activePanel, setActivePanel] = useState<PanelId>('sections')

  return <StudioPanelTabs activePanel={activePanel} onPanelChange={setActivePanel} onPanelIntent={onPanelIntent} />
}

describe('StudioPanelTabs', () => {
  it('exposes an accessible tab model and loads a panel only after user intent', () => {
    const onPanelIntent = vi.fn()

    render(<PanelTabsHarness onPanelIntent={onPanelIntent} />)

    const sectionsTab = screen.getByRole('tab', { name: 'Secciones' })
    const configTab = screen.getByRole('tab', { name: 'Ajustes' })

    expect(screen.getByRole('tablist', { name: 'Herramientas del estudio' })).toBeInTheDocument()
    expect(sectionsTab).toHaveAttribute('aria-selected', 'true')
    expect(configTab).toHaveAttribute('aria-selected', 'false')
    expect(onPanelIntent).not.toHaveBeenCalled()

    fireEvent.pointerEnter(configTab)

    expect(onPanelIntent).toHaveBeenCalledWith('config')
    expect(configTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(configTab)

    expect(configTab).toHaveAttribute('aria-selected', 'true')
    expect(configTab).toHaveAttribute('aria-controls', 'studio-panel-config')
  })

  it('supports automatic arrow-key activation with roving focus', () => {
    const onPanelIntent = vi.fn()

    render(<PanelTabsHarness onPanelIntent={onPanelIntent} />)

    const sectionsTab = screen.getByRole('tab', { name: 'Secciones' })
    const configTab = screen.getByRole('tab', { name: 'Ajustes' })

    sectionsTab.focus()
    fireEvent.keyDown(sectionsTab, { key: 'ArrowRight' })

    expect(configTab).toHaveFocus()
    expect(configTab).toHaveAttribute('aria-selected', 'true')
    expect(onPanelIntent).toHaveBeenCalledWith('config')
  })
})
