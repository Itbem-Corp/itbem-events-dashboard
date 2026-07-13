import '@/styles/tailwind.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'

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
  colorScheme: 'dark',
  themeColor: '#09090b',
}

const telemetryEnabled = process.env.NODE_ENV === 'production'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} dark bg-[var(--app-canvas)] text-zinc-100 antialiased`}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <meta name="application-name" content="EventiApp Dashboard" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Dashboard" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
      </head>
      <body className={`${inter.className} min-h-svh bg-transparent text-zinc-100`}>
        {children}
        <Toaster closeButton richColors theme="dark" position="top-right" />
        {telemetryEnabled && <Analytics />}
        {telemetryEnabled && <SpeedInsights />}
      </body>
    </html>
  )
}
