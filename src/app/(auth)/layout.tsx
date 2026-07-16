import { AuthLayout } from '@/components/auth-layout'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { headers } from 'next/headers'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const tenant = tenantPresentationForHostname(requestHeaders.get('host') || 'dashboard.eventiapp.com.mx')

  return (
    <div style={{ '--tenant-accent': tenant.accent } as React.CSSProperties}>
      <AuthLayout>{children}</AuthLayout>
    </div>
  )
}
