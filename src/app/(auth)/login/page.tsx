import { LoginForm } from '@/components/auth/login-form'
import { tenantForHostname } from '@/lib/tenant-config'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LoginPage() {
  const requestHeaders = await headers()
  const tenant = tenantForHostname(requestHeaders.get('host') || 'dashboard.eventiapp.com.mx')
  const { clientId: _clientId, ...publicTenant } = tenant
  return <div className="w-full" style={{ '--tenant-accent': tenant.accent } as React.CSSProperties}><LoginForm tenant={publicTenant} /></div>
}
