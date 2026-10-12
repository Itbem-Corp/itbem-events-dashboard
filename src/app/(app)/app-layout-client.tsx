'use client'

import { ApplicationLayout } from '@/components/application-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { NavigationProgress } from '@/components/ui/navigation-progress'
import { swrOnErrorRetry } from '@/lib/swr-error-retry'
import { ConnectionStatusBanner } from '@/components/ui/connection-status-banner'
import { RouteAccessDenied } from '@/components/session/route-access-denied'
import { HydrationSkeleton, StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { createAccessProfile } from '@/lib/access-profile'
import { resolveRouteAccess, routeNeedsAccessDecision } from '@/lib/route-access'
import type { TenantConfig } from '@/lib/tenant-config'
import type { ProductManifest } from '@/products/core/product-manifest'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SWRConfig } from 'swr'

export function AppLayoutClient({
  children,
  product,
  tenant,
}: {
  children: React.ReactNode
  product: ProductManifest
  tenant: Omit<TenantConfig, 'clientId'>
}) {
  const pathname = usePathname()
  const router = useRouter()

  const currentClient = useStore((s) => s.currentClient)
  const profileLoaded = useStore((s) => s.profileLoaded)
  const applicationSession = useStore((s) => s.applicationSession)
  const workspaceMode = useStore((s) => s.workspaceMode)

  const accessProfile = createAccessProfile(applicationSession, workspaceMode, currentClient?.id)
  const organizationContextPending = Boolean(
    profileLoaded &&
      applicationSession &&
      accessProfile.platformLevel === 'none' &&
      applicationSession.organizations.length > 0 &&
      !currentClient
  )
  const routeDecision = resolveRouteAccess({
    pathname,
    product,
    accessProfile,
    organizationContextPending,
    currentClientTypeCode: currentClient?.client_type?.code ?? null,
  })
  // Until the verified session (and, for members, their organization) is
  // known, a route that depends on the role is not mounted: its first requests
  // would otherwise leave before the decision and end in 403 toasts for pages
  // the user cannot open. The session survives token refreshes, so a mounted
  // page is never torn down by one.
  const awaitingAccessDecision =
    routeNeedsAccessDecision(pathname) &&
    (!applicationSession || (organizationContextPending && routeDecision.kind === 'deny'))
  const redirectTo = !awaitingAccessDecision && routeDecision.kind === 'redirect' ? routeDecision.to : null

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  const content = awaitingAccessDecision || routeDecision.kind === 'redirect' ? (
    <HydrationSkeleton />
  ) : routeDecision.kind === 'deny' ? (
    <RouteAccessDenied reason={routeDecision.reason} productName={tenant.name} />
  ) : (
    children
  )

  return (
    <>
      <NavigationProgress />
      <ConnectionStatusBanner />

      {/* 🔑 BOOTSTRAP ÚNICO DE PERFIL */}
      <SWRConfig
        value={{
          dedupingInterval: 10000,
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
          errorRetryCount: 3,
          onErrorRetry: swrOnErrorRetry,
        }}
      >
        <SessionBootstrap />
        <ErrorBoundary resetKey={pathname}>
          <ApplicationLayout tenant={tenant}>
            <StoreHydrationBoundary>{content}</StoreHydrationBoundary>
          </ApplicationLayout>
        </ErrorBoundary>
      </SWRConfig>
    </>
  )
}
