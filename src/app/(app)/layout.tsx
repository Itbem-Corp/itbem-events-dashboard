'use client'

import { ApplicationLayout } from '@/components/application-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { NavigationProgress } from '@/components/ui/navigation-progress'
import { accessCan, createAccessProfile } from '@/lib/access-profile'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { productSupportsFeature, productSupportsPath } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SWRConfig } from 'swr'

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [product, setProduct] = useState(() => getProductManifest('eventiapp'))
  const [productReady, setProductReady] = useState(false)

  useEffect(() => {
    setProduct(getProductManifest(tenantPresentationForHostname(window.location.hostname).code))
    setProductReady(true)
  }, [])

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
  const canViewEvents =
    productSupportsFeature(product, 'events') &&
    accessProfile.isOrganizationContext &&
    accessCan(accessProfile, 'events:view')
  const canViewUsers =
    productSupportsFeature(product, 'users') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'platform:users:view')
  const canViewOrganizations =
    productSupportsFeature(product, 'organizations') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'organizations:view')
  const canManageMembers =
    productSupportsFeature(product, 'team') &&
    accessProfile.isOrganizationContext &&
    accessCan(accessProfile, 'members:manage')
  const canViewMetrics = productSupportsFeature(product, 'metrics') && accessCan(accessProfile, 'metrics:view')
  const canViewAudit =
    productSupportsFeature(product, 'audit') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'audit:view')

  useEffect(() => {
    // ⛔ NO VALIDAR NADA hasta que el perfil esté listo
    if (!profileLoaded || !productReady) return

    // Product manifests are a client-side ceiling. Even if a future backend
    // configuration grants an unrelated capability, its route stays invisible.
    if (!productSupportsPath(product, pathname)) {
      router.replace('/')
      return
    }

    if (pathname.startsWith('/events') && !organizationContextPending && !canViewEvents) {
      router.replace('/')
      return
    }

    // 🔒 RUTAS SOLO ROOT
    if (pathname.startsWith('/clients') && !canViewOrganizations) {
      router.replace('/')
      return
    }

    if (pathname.startsWith('/users') && !canViewUsers) {
      router.replace('/')
      return
    }

    if (pathname.startsWith('/metrics') && !canViewMetrics) {
      router.replace('/')
      return
    }

    if (pathname.startsWith('/audit') && !canViewAudit) {
      router.replace('/')
      return
    }

    // 🔒 RUTAS SOLO CLIENT
    if (pathname.startsWith('/team') && !organizationContextPending && !canManageMembers) {
      router.replace('/')
      return
    }

    // 🔒 SOLO AGENCY
    if (pathname.startsWith('/sub-clients') && currentClient?.client_type?.code !== 'AGENCY') {
      router.replace('/')
      return
    }
  }, [
    canViewEvents,
    organizationContextPending,
    canViewOrganizations,
    canViewUsers,
    canManageMembers,
    canViewMetrics,
    canViewAudit,
    currentClient,
    pathname,
    profileLoaded,
    product,
    productReady,
    router,
  ])

  return (
    <>
      <NavigationProgress />

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
        <ErrorBoundary>
          <ApplicationLayout>
            <StoreHydrationBoundary>{children}</StoreHydrationBoundary>
          </ApplicationLayout>
        </ErrorBoundary>
      </SWRConfig>
    </>
  )
}
