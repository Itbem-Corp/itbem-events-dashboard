'use client'

import { ApplicationLayout } from '@/components/application-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { NavigationProgress } from '@/components/ui/navigation-progress'
import { useStore } from '@/store/useStore'
import { sessionCan } from '@/lib/session-capabilities'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SWRConfig } from 'swr'

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const currentClient = useStore((s) => s.currentClient)
  const profileLoaded = useStore((s) => s.profileLoaded)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)

  const isRoot = Boolean(user?.is_root)
  const canViewEvents = sessionCan(applicationSession, 'events:view')
  const canViewUsers = sessionCan(applicationSession, 'platform:users:view')
  const canViewOrganizations = sessionCan(applicationSession, 'organizations:view')
  const canManageMembers = sessionCan(applicationSession, 'members:manage')

  useEffect(() => {
    // ⛔ NO VALIDAR NADA hasta que el perfil esté listo
    if (!profileLoaded) return

    if (pathname.startsWith('/events') && !canViewEvents) {
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

    // 🔒 RUTAS SOLO CLIENT
    if (pathname.startsWith('/team') && !canManageMembers) {
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
    canViewOrganizations,
    canViewUsers,
    canManageMembers,
    currentClient,
    isRoot,
    pathname,
    profileLoaded,
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
