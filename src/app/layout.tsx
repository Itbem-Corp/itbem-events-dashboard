import '@/styles/tailwind.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    template: '%s - EventiApp',
    default: 'EventiApp Dashboard',
  },
  description: '',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950 dark`}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <meta name="application-name" content="EventiApp Dashboard" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Dashboard" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#ec4899" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className={inter.className}>
        {children}
        <Toaster richColors position="top-right" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
