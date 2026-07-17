import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.theme = 'dark'
  })

  it('switches to light mode and persists the choice', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )

    const toggle = await screen.findByRole('button', { name: 'Cambiar al tema claro' })
    fireEvent.click(toggle)

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(window.localStorage.getItem('eventi-color-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Cambiar al tema oscuro' })).toBeInTheDocument()
  })
})
