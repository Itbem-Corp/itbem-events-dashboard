'use client'

import { ApplicationLayout } from '@/components/application-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import { RouteGuardSkeleton } from '@/components/session/route-guard-skeleton'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { NavigationProgress } from '@/components/ui/navigation-progress'
import { ConnectionStatusBanner } from '@/components/ui/connection-status-banner'
import {
  createApplicationNavigation,
  isGuardedPath,
  resolveApplicationRouteRedirect,
} from '@/lib/application-navigation'
import type { TenantConfig } from '@/lib/tenant-config'
import { useAccessProfile } from '@/lib/use-access-profile'
import { ProductProvider } from '@/products/core/product-context'
import type { ProductManifest } from '@/products/core/product-manifest'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { SWRConfig } from 'swr'

type AppLayoutClientProps = {
  children: React.ReactNode
  product: ProductManifest
  tenant: Omit<TenantConfig, 'clientId'>
}

export function AppLayoutClient({ children, product, tenant }: AppLayoutClientProps) {
  return (
    <ProductProvider product={product}>
      <AppLayoutShell product={product} tenant={tenant}>
        {children}
      </AppLayoutShell>
    </ProductProvider>
  )
}

function AppLayoutShell({ children, product, tenant }: AppLayoutClientProps) {
  const pathname = usePathname()
  const router = useRouter()

  const currentClient = useStore((s) => s.currentClient)
  const profileLoaded = useStore((s) => s.profileLoaded)
  const applicationSession = useStore((s) => s.applicationSession)
  const user = useStore((s) => s.user)

  const accessProfile = useAccessProfile()
  const isRoot = Boolean(user?.is_root)
  const modules = applicationSession?.application.modules ?? tenant.modules
  const navigation = useMemo(
    () =>
      createApplicationNavigation({
        accessProfile,
        hasApplicationSession: Boolean(applicationSession),
        isRoot,
        modules,
        product,
      }),
    [accessProfile, applicationSession, isRoot, modules, product]
  )
  // The sidebar falls back to the tenant modules while the session loads.
  // Route decisions never do: once the profile is loaded, a missing session
  // grants nothing, exactly as the guards always behaved.
  const routeNavigation = useMemo(
    () =>
      applicationSession
        ? navigation
        : createApplicationNavigation({ accessProfile, hasApplicationSession: true, isRoot, modules, product }),
    [accessProfile, applicationSession, isRoot, modules, navigation, product]
  )
  const organizationContextPending = Boolean(
    profileLoaded &&
      applicationSession &&
      accessProfile.platformLevel === 'none' &&
      applicationSession.organizations.length > 0 &&
      !currentClient &&
      !accessProfile.isPortfolioContext
  )
  // ⛔ No route is validated until the profile is ready.
  const redirect = profileLoaded
    ? resolveApplicationRouteRedirect({ pathname, navigation: routeNavigation, product, organizationContextPending })
    : null

  useEffect(() => {
    if (redirect) router.replace(redirect)
  }, [pathname, redirect, router])

  // Products that opt in render nothing on guarded routes (and home, which
  // may redirect) until the policy has decided with a real session, so a
  // denied page never mounts and never requests its data.
  const holdRoute =
    Boolean(product.shell?.guardBeforeRender) &&
    (isGuardedPath(pathname) || pathname === '/') &&
    (!profileLoaded || !applicationSession || redirect !== null)

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
        }}
      >
        <SessionBootstrap />
        <ErrorBoundary resetKey={pathname}>
          <ApplicationLayout tenant={tenant} accessProfile={accessProfile} navigation={navigation}>
            <StoreHydrationBoundary>{holdRoute ? <RouteGuardSkeleton /> : children}</StoreHydrationBoundary>
          </ApplicationLayout>
        </ErrorBoundary>
      </SWRConfig>
    </>
  )
}
