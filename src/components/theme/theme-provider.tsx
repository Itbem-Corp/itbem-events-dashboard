'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ColorTheme = 'dark' | 'light'

interface ThemeContextValue {
  theme: ColorTheme
  setTheme: (theme: ColorTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'eventi-color-theme'

function applyTheme(theme: ColorTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = theme === 'dark' ? '#060a16' : '#f6f2ee'
  })
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>('dark')

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light')

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY)) return
      const nextTheme = event.matches ? 'dark' : 'light'
      applyTheme(nextTheme)
      setThemeState(nextTheme)
    }
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || (event.newValue !== 'dark' && event.newValue !== 'light')) return
      applyTheme(event.newValue)
      setThemeState(event.newValue)
    }

    media.addEventListener('change', syncSystemTheme)
    window.addEventListener('storage', syncStoredTheme)
    return () => {
      media.removeEventListener('change', syncSystemTheme)
      window.removeEventListener('storage', syncStoredTheme)
    }
  }, [])

  const setTheme = useCallback((nextTheme: ColorTheme) => {
    applyTheme(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    setThemeState(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useColorTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useColorTheme must be used inside ThemeProvider')
  return value
}
