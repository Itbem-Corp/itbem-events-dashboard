import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemedToaster } from '@/components/theme/themed-toaster'
import '@/styles/tailwind.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  applicationName: 'EventiApp Dashboard',
  title: {
    template: '%s - EventiApp',
    default: 'EventiApp Dashboard',
  },
  description: 'Diseña, publica y opera experiencias memorables desde un solo lugar.',
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false,
  },
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
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} bg-[var(--app-canvas)] text-[var(--app-text-primary)] antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <meta name="application-name" content="EventiApp Dashboard" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Dashboard" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
      </head>
      <body className={`${inter.className} min-h-svh bg-transparent text-[var(--app-text-primary)]`}>
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
