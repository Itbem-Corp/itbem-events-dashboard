import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemedToaster } from '@/components/theme/themed-toaster'
import '@/styles/tailwind.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const hostname = requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? requestHeaders.get('host')
    ?? 'dashboard.eventiapp.com.mx'
  const tenant = tenantPresentationForHostname(hostname)
  const applicationName = `${tenant.name} Dashboard`

  return {
    applicationName,
    title: {
      template: `%s - ${tenant.name}`,
      default: applicationName,
    },
    description: `${tenant.name}: ${tenant.productLabel}.`,
    manifest: '/manifest.webmanifest',
    formatDetection: {
      telephone: false,
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#060a16' },
  ],
}

const telemetryEnabled = process.env.NODE_ENV === 'production'
const themeBootScript = `(function(){try{var key='eventi-color-theme';var saved=localStorage.getItem(key);var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var root=document.documentElement;root.classList.toggle('dark',theme==='dark');root.dataset.theme=theme;root.style.colorScheme=theme;}catch(_){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const hostname = requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? requestHeaders.get('host')
    ?? 'dashboard.eventiapp.com.mx'
  const tenant = tenantPresentationForHostname(hostname)

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className="bg-[var(--app-canvas)] text-[var(--app-text-primary)] antialiased"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <meta name="application-name" content={`${tenant.name} Dashboard`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={tenant.name} />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
      </head>
      <body className="min-h-svh bg-transparent font-sans text-[var(--app-text-primary)]">
        <ThemeProvider>
          {children}
          <ThemedToaster />
          {telemetryEnabled && <Analytics />}
          {telemetryEnabled && <SpeedInsights />}
        </ThemeProvider>
      </body>
    </html>
  )
}
