'use client'

import { ApplicationLayout } from '@/components/application-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { StoreHydrationBoundary } from '@/components/session/StoreHydrationBoundary'
import { NavigationProgress } from '@/components/ui/navigation-progress'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SWRConfig } from 'swr'

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const currentClient = useStore((s) => s.currentClient)
  const profileLoaded = useStore((s) => s.profileLoaded)
  const user = useStore((s) => s.user)

  const isRoot = Boolean(user?.is_root)

  useEffect(() => {
    // ⛔ NO VALIDAR NADA hasta que el perfil esté listo
    if (!profileLoaded || !currentClient) return

    // 🔒 RUTAS SOLO ROOT
    if (pathname.startsWith('/clients') && !isRoot) {
      router.replace('/')
      return
    }

    if (pathname.startsWith('/users') && !isRoot) {
      router.replace('/')
      return
    }

    // 🔒 RUTAS SOLO CLIENT
    if (pathname.startsWith('/team') && isRoot) {
      router.replace('/')
      return
    }

    // 🔒 SOLO AGENCY
    if (pathname.startsWith('/sub-clients') && currentClient.client_type?.code !== 'AGENCY') {
      router.replace('/')
      return
    }
  }, [pathname, currentClient, profileLoaded, isRoot, router])

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
