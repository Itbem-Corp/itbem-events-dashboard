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

    const inlineScripts = html.match(/<script[^>]*>/g) ?? []
    expect(inlineScripts.length).toBeGreaterThan(0)
    for (const tag of inlineScripts) expect(tag).toContain('nonce="abc123"')
  })
})
