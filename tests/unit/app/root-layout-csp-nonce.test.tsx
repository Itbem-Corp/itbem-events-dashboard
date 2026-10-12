import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }))

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.value,
}))
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }))
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }))
vi.mock('@/components/theme/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/theme/themed-toaster', () => ({ ThemedToaster: () => null }))
vi.mock('@/styles/tailwind.css', () => ({}))

import RootLayout from '@/app/layout'

// EVT-100: the inline theme boot script had no nonce, so the CSP blocked it on every load.
describe('root layout CSP nonce', () => {
  it('puts the request nonce on the inline theme boot script', async () => {
    requestHeaders.value = new Headers({ host: 'dashboard.eventiapp.localhost:3017', 'x-nonce': 'abc123' })

    const html = renderToStaticMarkup(await RootLayout({ children: null }))

    // Parse instead of regex-matching tags (CodeQL js/bad-tag-filter).
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const scripts = Array.from(doc.querySelectorAll('script'))
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) expect(script.getAttribute('nonce')).toBe('abc123')
  })
})
