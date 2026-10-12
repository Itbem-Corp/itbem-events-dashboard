import { ThemeProvider } from '@/components/theme/theme-provider'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// QA EVT-33 / ROLES-76: the CSP blocked the inline theme boot script, so
// <html> never got data-theme and the light-theme bridge for dark-first
// utilities (text-white on white cards) never applied.
describe('ThemeProvider mount', () => {
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.theme
    vi.restoreAllMocks()
  })

  function mockSystemDark(matches: boolean) {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    )
  }

  it('sets data-theme=light from the system preference when the boot script did not run', () => {
    mockSystemDark(false)
    render(<ThemeProvider>contenido</ThemeProvider>)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('honours the stored preference over the system preference', () => {
    mockSystemDark(false)
    window.localStorage.setItem('eventi-color-theme', 'dark')
    render(<ThemeProvider>contenido</ThemeProvider>)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
