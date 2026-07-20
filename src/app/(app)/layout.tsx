import { AppLayoutClient } from '@/app/(app)/app-layout-client'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { getProductManifest } from '@/products/registry'
import { headers } from 'next/headers'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const hostname = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const tenant = tenantPresentationForHostname(hostname)
  const product = getProductManifest(tenant.code)

  return (
    <AppLayoutClient product={product} tenant={tenant}>
      {children}
    </AppLayoutClient>
  )
}
