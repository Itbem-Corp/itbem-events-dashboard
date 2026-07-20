'use client'

import { ApplicationNavbarAccount } from '@/components/account/application-navbar-account'
import { ApplicationSidebarFooter } from '@/components/account/application-sidebar-footer'
import { ApplicationPrimaryNavigation } from '@/components/application-primary-navigation'
import {
  ApplicationCommandPaletteController,
  openApplicationCommandPalette,
  preloadApplicationCommandPalette,
} from '@/components/ui/application-command-palette-controller'
import { ApplicationSearchButton } from '@/components/ui/application-search-button'
import { LazyNotificationButton } from '@/components/ui/lazy-notification-button'

import { MobilePrimaryNavigation } from '@/components/mobile-primary-navigation'
import { Navbar, NavbarSection } from '@/components/navbar'
import { BrandMark } from '@/components/product/brand-mark'
import { Sidebar } from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import { ApplicationWorkspaceHeader } from '@/components/workspace/application-workspace-header'
import { OrganizationSwitcher } from '@/components/workspace/organization-switcher'
import { Link } from '@/components/link'
import { useDebounce } from '@/hooks/useDebounce'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { issueOrganizationContext } from '@/features/workspace/issue-organization-context'
import { useOrganizationContextRenewal } from '@/features/workspace/use-organization-context-renewal'
import { createAccessProfile } from '@/lib/access-profile'
import { applicationRoutePreloadPath, createApplicationNavigation, type ApplicationRoute } from '@/lib/application-navigation'
import { readApiData } from '@/lib/api-envelope'
import {
  clientsPagePath,
  eventsPagePath,
  scopedEventsDashboardPath,
  usersPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { TenantConfig } from '@/lib/tenant-config'
import type { ClientsPageResponse } from '@/models/Client'
import { productSupportsFeature } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { preload, unstable_serialize, useSWRConfig } from 'swr'

const defaultTenant = tenantPresentationForHostname('dashboard.eventiapp.com.mx')

function normalizeClient(raw: OrganizationOption) {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    logo: raw.logo,
    access_role: raw.access_role,
    client_type: raw.client_type ?? { code: '' },
  }
}

/* =========================
 * LAYOUT
 * ========================= */

export function ApplicationLayout({
  children,
  tenant = defaultTenant,
}: {
  children: React.ReactNode
  tenant?: Omit<TenantConfig, 'clientId'>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const storeHydrated = useStoreHydration()
  const { cache: swrCache } = useSWRConfig()
  const scopeFetcherKey = useScopedFetcherScope()

  const [clientsRequested, setClientsRequested] = useState(false)
  const [organizationSwitcherOpen, setOrganizationSwitcherOpen] = useState(false)
  const [organizationSearch, setOrganizationSearch] = useState('')
  const debouncedOrganizationSearch = useDebounce(organizationSearch, 200)

  const currentClient = useStore((s) => s.currentClient)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const activateTenantWorkspace = useStore((s) => s.activateTenantWorkspace)
  const selectPlatformWorkspace = useStore((s) => s.selectPlatformWorkspace)
  const selectOrganizationWorkspace = useStore((s) => s.selectOrganizationWorkspace)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)
  useOrganizationContextRenewal()

  const isRoot = Boolean(user?.is_root)
  const accessProfile = useMemo(
    () => createAccessProfile(applicationSession, workspaceMode, currentClient?.id),
    [applicationSession, currentClient?.id, workspaceMode]
  )
  const modules = useMemo(
    () => applicationSession?.application.modules ?? tenant.modules,
    [applicationSession?.application.modules, tenant.modules]
  )
  const product = getProductManifest(tenant.code)
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
  const {
    hasEvents,
    canViewUsers,
    canViewOrganizations,
    canManageMembers,
    canViewMetrics,
    canViewAudit,
    canSwitchOrganizations,
  } = navigation
  // On a cold login, resolve the first organization in parallel with the profile.
  // The paginated endpoint scopes itself from the authenticated identity, so this
  // does not need to wait until the profile reveals whether the user is root.
  const shouldBootstrapClient = storeHydrated && !currentClient
  const shouldLoadClients = clientsRequested || shouldBootstrapClient
  const openOrganizationSwitcher = useCallback(() => setOrganizationSwitcherOpen(true), [])
  const requestOrganizations = useCallback(() => setClientsRequested(true), [])
  const handleSelectOrganization = useCallback(
    async (client: OrganizationOption) => {
      const normalized = normalizeClient(client)
      const credential = await issueOrganizationContext(normalized.id)
      selectOrganizationWorkspace(tenant.code, normalized, credential)
    },
    [selectOrganizationWorkspace, tenant.code]
  )

  useEffect(() => {
    if (!storeHydrated || !applicationSession) return
    activateTenantWorkspace(tenant.code, accessProfile.canUsePlatformMode)
  }, [accessProfile.canUsePlatformMode, activateTenantWorkspace, applicationSession, storeHydrated, tenant.code])

  const preloadDataIfMissing = useCallback(
    (path: string) => {
      const key = scopeFetcherKey(path)
      if (swrCache.get(unstable_serialize(key))?.data !== undefined) return
      void Promise.resolve(preload(key, fetcher)).catch(() => undefined)
    },
    [scopeFetcherKey, swrCache]
  )

  const preloadRoute = useCallback(
    (href: ApplicationRoute) => {
      router.prefetch(href)
      const dataPath = applicationRoutePreloadPath({ href, clientId: currentClient?.id, isRoot })
      if (dataPath) preloadDataIfMissing(dataPath)
    },
    [currentClient?.id, isRoot, preloadDataIfMissing, router]
  )

  function preloadClientPortfolio(clientId: string) {
    router.prefetch('/')
    if (!productSupportsFeature(product, 'events')) return
    router.prefetch('/events')
    preloadDataIfMissing(eventsPagePath(clientId, { page: 1, page_size: 12, filter: 'all' }))
    const dashboardPath = scopedEventsDashboardPath(clientId, isRoot)
    if (dashboardPath) preloadDataIfMissing(dashboardPath)
  }

  const preloadProfile = useCallback(() => {
    router.prefetch('/settings/profile')
    preloadDataIfMissing(usersPath())
  }, [preloadDataIfMissing, router])


  const clientsKey = shouldLoadClients
    ? clientsPagePath({ page: 1, page_size: 50, search: isRoot ? debouncedOrganizationSearch : undefined })
    : null
  const {
    data: rawClients,
    error: clientsError,
    isLoading: clientsLoading,
    isValidating: clientsValidating,
    mutate: retryClients,
  } = useSWR<ClientsPageResponse>(clientsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const clientsPage = useMemo(() => readApiData<ClientsPageResponse | undefined>(rawClients), [rawClients])
  const clients = useMemo(() => clientsPage?.data ?? [], [clientsPage?.data])
  const clientsTotal = clientsPage?.total ?? clients.length
  const clientsErrorState = getDataErrorState(clientsError, rawClients)
  /* Auto-select client */
  useEffect(() => {
    if (!rawClients) return

    const list = clients

    // ✅ Si hay clientes y no hay currentClient → seleccionar
    const preferred = list.find((client) => client.code?.toLowerCase() === tenant.organizationCode)
    const currentIsAllowed = currentClient && list.some((client) => client.id === currentClient.id)

    // Organization-scoped apps cannot retain a workspace selected on another
    // branded origin. EventiApp and ITBEM keep their portfolio switcher.
    if (!canSwitchOrganizations && preferred && currentClient?.id !== preferred.id) {
      selectOrganizationWorkspace(tenant.code, normalizeClient(preferred))
      return
    }

    if (accessProfile.isPlatformContext) return

    if (list.length > 0 && !currentIsAllowed) {
      selectOrganizationWorkspace(tenant.code, normalizeClient(preferred ?? list[0]))
      return
    }

    // 🚫 SOLO usuarios NO ROOT van a onboarding
    if (list.length === 0 && user && !isRoot) {
      router.push('/')
    }

    // ✅ ROOT con 0 clientes → NO REDIRECT
  }, [
    accessProfile.isPlatformContext,
    canSwitchOrganizations,
    clients,
    currentClient,
    isRoot,
    rawClients,
    router,
    selectOrganizationWorkspace,
    tenant,
    user,
  ])

  return (
    <div
      className="app-product-shell"
      data-product={tenant.code}
      style={{ '--tenant-accent': tenant.accent } as React.CSSProperties}
    >
      <SidebarLayout
        navbar={
          <Navbar>
            <Link
              href="/"
              aria-label={`${tenant.name} — ir al inicio`}
              className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
            >
              <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="sm" priority />
              <span className="hidden min-[420px]:block">
                <span className="block text-sm font-semibold tracking-tight text-ink">
                  {tenant.name}
                </span>
                <span className="block text-[9px] font-medium tracking-[0.16em] text-ink-muted uppercase">
                  Dashboard
                </span>
              </span>
            </Link>
            <span className="flex-1" aria-hidden="true" />
            <NavbarSection>
              <ApplicationSearchButton onOpen={openApplicationCommandPalette} onIntent={preloadApplicationCommandPalette} />
              {hasEvents && <LazyNotificationButton />}
              <ThemeToggle className="size-9" />
              <ApplicationNavbarAccount user={user} clearSession={clearSession} onProfileIntent={preloadProfile} />
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar>
            <ApplicationWorkspaceHeader
              accessProfile={accessProfile}
              canSwitchOrganizations={canSwitchOrganizations}
              currentClient={currentClient}
              tenant={tenant}
              onOpenSwitcher={openOrganizationSwitcher}
              onSwitcherIntent={requestOrganizations}
            />

            <ApplicationPrimaryNavigation
              pathname={pathname}
              hasEvents={hasEvents}
              canViewMetrics={canViewMetrics}
              canViewUsers={canViewUsers}
              canViewAudit={canViewAudit}
              canManageMembers={canManageMembers}
              canViewOrganizations={canViewOrganizations}
              onIntent={preloadRoute}
            />

            <ApplicationSidebarFooter
              user={user}
              clearSession={clearSession}
              onProfileIntent={preloadProfile}
              onSearchIntent={preloadApplicationCommandPalette}
              onSearchOpen={openApplicationCommandPalette}
            />
          </Sidebar>
        }
      >
        {accessProfile.isOrganizationContext && currentClient && accessProfile.platformLevel !== 'none' && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--tenant-accent)/15 bg-(--tenant-accent)/[0.045] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-2 shrink-0 rounded-full bg-(--tenant-accent)" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  Administrando{' '}
                  <span className="font-semibold text-ink">{currentClient.name}</span>
                </p>
                <p className="text-[11px] text-ink-muted">
                  {accessProfile.platformLevel === 'root_1' ? 'Acceso Root 1' : 'Modo soporte Root 2'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectPlatformWorkspace(tenant.code)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-(--tenant-accent) transition-colors hover:bg-surface-interactive"
            >
              Volver a plataforma
            </button>
          </div>
        )}
        {children}
        <MobilePrimaryNavigation
          pathname={pathname}
          showEvents={hasEvents}
          showMetrics={canViewMetrics}
          showTeam={canManageMembers && !canViewUsers}
          showUsers={canViewUsers}
          showOrganizations={canViewOrganizations}
          onIntent={preloadRoute}
        />
      </SidebarLayout>

      {canSwitchOrganizations && (
        <OrganizationSwitcher
          open={organizationSwitcherOpen}
          onClose={() => setOrganizationSwitcherOpen(false)}
          tenant={tenant}
          accessProfile={accessProfile}
          currentClient={currentClient}
          clients={clients}
          clientsTotal={clientsTotal}
          search={organizationSearch}
          loading={clientsLoading}
          validating={clientsValidating}
          errorState={clientsErrorState}
          onSearchChange={setOrganizationSearch}
          onRetry={() => void retryClients()}
          onPreloadOrganization={preloadClientPortfolio}
          onSelectOrganization={handleSelectOrganization}
          onSelectPlatform={() => selectPlatformWorkspace(tenant.code)}
        />
      )}

      <ApplicationCommandPaletteController
        enabled={hasEvents}
        isRoot={accessProfile.isPlatformContext && accessProfile.platformLevel !== 'none'}
        clientId={currentClient?.id}
      />
    </div>
  )
}
