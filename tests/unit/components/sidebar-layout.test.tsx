import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarLayout } from '@/components/sidebar-layout'

describe('SidebarLayout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(min-width: 1024px)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
  })

  it('mounts a single responsive sidebar tree', () => {
    render(
      <SidebarLayout navbar={<span>Barra</span>} sidebar={<button type="button">Cambiar organización</button>}>
        Contenido
      </SidebarLayout>
    )

    expect(screen.getAllByRole('button', { name: 'Cambiar organización', hidden: true })).toHaveLength(1)
    expect(document.querySelector('aside[aria-label="Navegación principal"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('opens on mobile, closes with Escape, and restores focus', async () => {
    render(
      <SidebarLayout navbar={<span>Barra</span>} sidebar={<button type="button">Cambiar organización</button>}>
        Contenido
      </SidebarLayout>
    )

    const openButton = screen.getByRole('button', { name: 'Abrir navegación' })
    const sidebar = document.querySelector('aside[aria-label="Navegación principal"]')
    fireEvent.click(openButton)

    expect(sidebar).toHaveAttribute('aria-hidden', 'false')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    expect(openButton).toHaveFocus()
  })
})
