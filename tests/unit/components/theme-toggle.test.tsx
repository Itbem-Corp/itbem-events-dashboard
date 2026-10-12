import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
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

describe('ThemeToggle per product shell', () => {
  function sizeClasses(element: HTMLElement) {
    return element.className.split(/\s+/).filter((token) => /^size-/.test(token))
  }

  it('gives EventiApp a 44px target below lg and a single size class', async () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      </ProductProvider>
    )

    const toggle = await screen.findByRole('button', { name: /Cambiar al tema/ })
    expect(toggle).toHaveClass('size-11', 'lg:size-9')
    expect(sizeClasses(toggle)).toEqual(['size-11'])
  })

  it('keeps the Cafetton House sizes from the caller, as before', async () => {
    render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <ThemeProvider>
          <ThemeToggle className="size-9" />
        </ThemeProvider>
      </ProductProvider>
    )

    const toggle = await screen.findByRole('button', { name: /Cambiar al tema/ })
    expect(sizeClasses(toggle)).toEqual(['size-9', 'size-10'])
    expect(toggle.className).not.toContain('size-11')
  })
})
