'use client'

import UserAvatar from '@/components/ui/UserAvatar'

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { MobilePrimaryNavigation } from '@/components/mobile-primary-navigation'
import { Navbar, NavbarItem, NavbarSection } from '@/components/navbar'
import { BrandMark } from '@/components/product/brand-mark'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import { OrganizationSwitcher } from '@/components/workspace/organization-switcher'
import { OrganizationSwitcherTrigger } from '@/components/workspace/organization-switcher-trigger'
import {
  ArrowRightStartOnRectangleIcon,
  BuildingOfficeIcon,
  ChevronUpIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import {
  BellIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  Square2StackIcon,
} from '@heroicons/react/20/solid'

import { Avatar } from '@/components/avatar'
import { Link } from '@/components/link'
import { useDebounce } from '@/hooks/useDebounce'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import { accessCan, createAccessProfile } from '@/lib/access-profile'
import { readApiData } from '@/lib/api-envelope'
import {
  auditLogsPath,
  clientMembersPagePath,
  clientsPagePath,
  eventsPagePath,
  metricsPortfolioPath,
  scopedEventsDashboardPath,
  scopedEventsPagePath,
  usersAllPath,
  usersPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ClientsPageResponse } from '@/models/Client'
import { productSupportsFeature } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { preload, useSWRConfig } from 'swr'

const loadCommandPalette = () => import('@/components/ui/command-palette')
const loadNotificationBell = () => import('@/components/ui/notification-bell')

const NotificationBell = dynamic(() => loadNotificationBell().then((module) => module.NotificationBell), {
  ssr: false,
  loading: NotificationBellPlaceholder,
})

function NotificationBellPlaceholder() {
  return (
    <span
      role="status"
      aria-label="Preparando notificaciones"
      className="flex size-8 items-center justify-center rounded-lg text-ink-muted"
    >
      <BellIcon className="size-5" />
    </span>
  )
}

function CommandPaletteFallback() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preparando búsqueda global"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-canvas shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <MagnifyingGlassIcon className="size-5 text-ink-muted" />
          <div className="h-4 w-44 animate-pulse rounded bg-surface-raised" />
        </div>
        <div className="space-y-2 p-3" role="status" aria-live="polite">
          <span className="sr-only">Preparando búsqueda…</span>
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="size-9 animate-pulse rounded-lg bg-surface" />
              <div className="space-y-2">
                <div className="h-3 w-36 animate-pulse rounded bg-surface-raised" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-surface" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const CommandPalette = dynamic(() => loadCommandPalette().then((module) => module.CommandPalette), {
  ssr: false,
  loading: CommandPaletteFallback,
})

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

function preloadCommandPaletteResources(clientId: string | undefined, isRoot: boolean) {
  const eventsPath = scopedEventsPagePath(clientId, isRoot, { page: 1, page_size: 6, filter: 'all' })
  const tasks: Promise<unknown>[] = [loadCommandPalette()]
  if (eventsPath) tasks.push(Promise.resolve(preload(eventsPath, fetcher)))
  void Promise.all(tasks).catch(() => undefined)
}
/* =========================
 * ACCOUNT MENU
 * ========================= */

function AccountDropdownMenu({
  anchor,
  clearSession,
  onProfileIntent,
}: {
  anchor: 'top start' | 'bottom end'
  clearSession: () => void
  onProfileIntent: () => void
}) {
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem
        href="/settings/profile"
        onFocus={onProfileIntent}
        onPointerDown={onProfileIntent}
        onPointerEnter={onProfileIntent}
      >
        <UserCircleIcon />
        <DropdownLabel>Mi Perfil</DropdownLabel>
      </DropdownItem>

      <DropdownDivider />

      <DropdownItem
        onClick={() => {
          clearSession()
          window.location.href = '/logout'
        }}
      >
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Cerrar sesión</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

/* =========================
 * LAYOUT
 * ========================= */

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const storeHydrated = useStoreHydration()
  const { cache: swrCache } = useSWRConfig()

  const [cmdOpen, setCmdOpen] = useState(false)
  const [notificationsRequested, setNotificationsRequested] = useState(false)
  const [notificationsOpenRequested, setNotificationsOpenRequested] = useState(false)
  const [clientsRequested, setClientsRequested] = useState(false)
  const [organizationSwitcherOpen, setOrganizationSwitcherOpen] = useState(false)
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [commandShortcutLabel, setCommandShortcutLabel] = useState('Ctrl K')
  const [tenant, setTenant] = useState(() => tenantPresentationForHostname('dashboard.eventiapp.com.mx'))
  const debouncedOrganizationSearch = useDebounce(organizationSearch, 200)

  useEffect(() => {
    setTenant(tenantPresentationForHostname(window.location.hostname))
  }, [])

  const currentClient = useStore((s) => s.currentClient)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const activateTenantWorkspace = useStore((s) => s.activateTenantWorkspace)
  const selectPlatformWorkspace = useStore((s) => s.selectPlatformWorkspace)
  const selectOrganizationWorkspace = useStore((s) => s.selectOrganizationWorkspace)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)

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
  const hasEvents = applicationSession
    ? productSupportsFeature(product, 'events') &&
      accessProfile.isOrganizationContext &&
      accessCan(accessProfile, 'events:view')
    : productSupportsFeature(product, 'events') && modules.includes('events')
  const canViewUsers = applicationSession
    ? productSupportsFeature(product, 'users') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'platform:users:view')
    : productSupportsFeature(product, 'users') && isRoot && modules.includes('users')
  const canViewOrganizations = applicationSession
    ? productSupportsFeature(product, 'organizations') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'organizations:view')
    : productSupportsFeature(product, 'organizations') && isRoot && modules.includes('organizations')
  const canManageMembers =
    productSupportsFeature(product, 'team') &&
    accessProfile.isOrganizationContext &&
    accessCan(accessProfile, 'members:manage')
  const canViewMetrics =
    productSupportsFeature(product, 'metrics') &&
    (applicationSession ? accessCan(accessProfile, 'metrics:view') : modules.includes('metrics'))
  const canViewAudit =
    productSupportsFeature(product, 'audit') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'audit:view')
  const canSwitchOrganizations = applicationSession ? accessProfile.canSwitchOrganizations : isRoot
  const preloadCommandPaletteIntent = () => {
    if (hasEvents) preloadCommandPaletteResources(currentClient?.id, isRoot)
  }
  // On a cold login, resolve the first organization in parallel with the profile.
  // The paginated endpoint scopes itself from the authenticated identity, so this
  // does not need to wait until the profile reveals whether the user is root.
  const shouldBootstrapClient = storeHydrated && !currentClient
  const shouldLoadClients = clientsRequested || shouldBootstrapClient

  useEffect(() => {
    if (!storeHydrated || !applicationSession) return
    activateTenantWorkspace(tenant.code, accessProfile.canUsePlatformMode)
  }, [accessProfile.canUsePlatformMode, activateTenantWorkspace, applicationSession, storeHydrated, tenant.code])

  const preloadDataIfMissing = useCallback(
    (path: string) => {
      if (swrCache.get(path)?.data !== undefined) return
      void Promise.resolve(preload(path, fetcher)).catch(() => undefined)
    },
    [swrCache]
  )

  const preloadRoute = useCallback(
    (href: '/' | '/events' | '/metrics' | '/team' | '/users' | '/clients' | '/audit') => {
      router.prefetch(href)

      const dataPath =
        href === '/'
          ? scopedEventsDashboardPath(currentClient?.id, isRoot)
          : href === '/events'
            ? currentClient?.id || isRoot
              ? eventsPagePath(currentClient?.id, { page: 1, page_size: 12, filter: 'all' })
              : null
            : href === '/users'
              ? usersAllPath({ page: 1, page_size: 10 })
              : href === '/metrics'
                ? metricsPortfolioPath(currentClient?.id, 30)
                : href === '/team'
                  ? currentClient?.id
                    ? clientMembersPagePath(currentClient.id, 1, 20)
                    : null
                  : href === '/audit'
                    ? auditLogsPath({ page: 1, page_size: 30 })
                    : clientsPagePath({ page: 1, page_size: 12 })

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

  function preloadProfile() {
    router.prefetch('/settings/profile')
    preloadDataIfMissing(usersPath())
  }

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (hasEvents && (e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        preloadCommandPaletteResources(currentClient?.id, isRoot)
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [currentClient?.id, hasEvents, isRoot])

  useEffect(() => {
    const isApplePlatform = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    setCommandShortcutLabel(isApplePlatform ? '⌘ K' : 'Ctrl K')
  }, [])

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
                <span className="block text-sm font-semibold tracking-tight text-ink dark:text-white">
                  {tenant.name}
                </span>
                <span className="block text-[9px] font-medium tracking-[0.16em] text-ink-muted uppercase">
                  Dashboard
                </span>
              </span>
            </Link>
            <span className="flex-1" aria-hidden="true" />
            <NavbarSection>
              {/* ⌘K quick search */}
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                onPointerEnter={preloadCommandPaletteIntent}
                onPointerDown={preloadCommandPaletteIntent}
                onFocus={preloadCommandPaletteIntent}
                aria-label="Buscar"
                className="flex min-h-10 items-center gap-2 rounded-lg border border-border-subtle bg-white/50 px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-border-subtle hover:text-ink sm:min-h-0 sm:px-3 dark:border-white/10 dark:bg-surface/50 dark:hover:border-white/20 dark:hover:text-ink-secondary"
              >
                <MagnifyingGlassIcon className="size-4 sm:size-3.5" />
                <span className="hidden sm:inline">Buscar…</span>
                <kbd className="hidden rounded border border-border-subtle bg-surface-raised px-1 py-0.5 font-mono text-[9px] text-ink-muted sm:inline">
                  {commandShortcutLabel}
                </kbd>
              </button>

              {hasEvents &&
                (notificationsRequested ? (
                  <NotificationBell initialOpen={notificationsOpenRequested} />
                ) : (
                  <button
                    type="button"
                    aria-label="Notificaciones"
                    onPointerEnter={() => setNotificationsRequested(true)}
                    onFocus={() => void loadNotificationBell()}
                    onClick={() => {
                      setNotificationsOpenRequested(true)
                      setNotificationsRequested(true)
                    }}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                  >
                    <BellIcon className="size-5" />
                  </button>
                ))}
              <ThemeToggle className="size-9" />
              <Dropdown>
                <DropdownButton
                  as={NavbarItem}
                  aria-label="Abrir menú de cuenta"
                  onFocus={preloadProfile}
                  onPointerDown={preloadProfile}
                  onPointerEnter={preloadProfile}
                >
                  <UserAvatar user={user} size="sm" />
                </DropdownButton>

                <AccountDropdownMenu anchor="bottom end" clearSession={clearSession} onProfileIntent={preloadProfile} />
              </Dropdown>
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar>
            {/* HEADER CLIENT */}
            <SidebarHeader className="gap-3 border-border-subtle bg-gradient-to-b from-canvas/[0.025] to-transparent pb-3 dark:border-white/[0.07] dark:from-white/[0.025]">
              <Link
                href="/"
                aria-label={`${tenant.name} — ir al inicio`}
                className="group flex items-center gap-3 rounded-xl px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
              >
                <BrandMark
                  code={tenant.code}
                  name={tenant.name}
                  accent={tenant.accent}
                  size="md"
                  priority
                  className="transition-transform group-hover:scale-[1.03] motion-reduce:transition-none"
                />
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-[-0.02em] text-ink dark:text-white">
                    {tenant.name}
                  </span>
                  <span className="block text-[10px] font-medium tracking-[0.16em] text-ink-muted uppercase">
                    {tenant.productLabel}
                  </span>
                </span>
              </Link>

              <p className="px-2 text-[10px] font-semibold tracking-[0.16em] text-ink-muted uppercase">
                Espacio de trabajo
              </p>
              {canSwitchOrganizations ? (
                <OrganizationSwitcherTrigger
                  accessProfile={accessProfile}
                  currentClient={currentClient}
                  onOpen={() => setOrganizationSwitcherOpen(true)}
                  onOpenIntent={() => setClientsRequested(true)}
                />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-canvas/[0.025] px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
                  <Avatar
                    src={currentClient?.logo}
                    initials={currentClient?.name?.substring(0, 2).toUpperCase() || tenant.name.substring(0, 2)}
                    className="bg-(--tenant-accent) text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink dark:text-white">
                      {currentClient?.name || tenant.name}
                    </p>
                    <p className="text-[10px] tracking-[0.14em] text-ink-muted uppercase">Organización asignada</p>
                  </div>
                </div>
              )}
            </SidebarHeader>

            {/* NAV */}
            <SidebarBody>
              <SidebarSection>
                <SidebarItem
                  href="/"
                  current={pathname === '/'}
                  onPointerEnter={() => preloadRoute('/')}
                  onPointerDown={() => preloadRoute('/')}
                  onFocus={() => preloadRoute('/')}
                >
                  <HomeIcon />
                  <SidebarLabel>Inicio</SidebarLabel>
                </SidebarItem>

                {hasEvents && (
                  <SidebarItem
                    href="/events"
                    current={pathname.startsWith('/events')}
                    onPointerEnter={() => preloadRoute('/events')}
                    onPointerDown={() => preloadRoute('/events')}
                    onFocus={() => preloadRoute('/events')}
                  >
                    <Square2StackIcon />
                    <SidebarLabel>Eventos</SidebarLabel>
                  </SidebarItem>
                )}

                {canViewMetrics && (
                  <SidebarItem
                    href="/metrics"
                    current={pathname.startsWith('/metrics')}
                    onPointerEnter={() => preloadRoute('/metrics')}
                    onPointerDown={() => preloadRoute('/metrics')}
                    onFocus={() => preloadRoute('/metrics')}
                  >
                    <ChartBarSquareIcon />
                    <SidebarLabel>Métricas</SidebarLabel>
                  </SidebarItem>
                )}

                {canViewUsers && (
                  <SidebarItem
                    href="/users"
                    current={pathname.startsWith('/users')}
                    onPointerEnter={() => preloadRoute('/users')}
                    onPointerDown={() => preloadRoute('/users')}
                    onFocus={() => preloadRoute('/users')}
                  >
                    <UsersIcon />
                    <SidebarLabel>Usuarios</SidebarLabel>
                  </SidebarItem>
                )}
                {canViewAudit && (
                  <SidebarItem
                    href="/audit"
                    current={pathname.startsWith('/audit')}
                    onPointerEnter={() => preloadRoute('/audit')}
                    onPointerDown={() => preloadRoute('/audit')}
                    onFocus={() => preloadRoute('/audit')}
                  >
                    <ClipboardDocumentCheckIcon />
                    <SidebarLabel>Auditoría</SidebarLabel>
                  </SidebarItem>
                )}
                {canManageMembers && !canViewUsers && (
                  <SidebarItem
                    href="/team"
                    current={pathname.startsWith('/team')}
                    onPointerEnter={() => preloadRoute('/team')}
                    onPointerDown={() => preloadRoute('/team')}
                    onFocus={() => preloadRoute('/team')}
                  >
                    <UsersIcon />
                    <SidebarLabel>Equipo</SidebarLabel>
                  </SidebarItem>
                )}
              </SidebarSection>

              <SidebarSpacer />

              {canViewOrganizations && (
                <SidebarSection>
                  <SidebarItem
                    href="/clients"
                    current={pathname.startsWith('/clients')}
                    onPointerEnter={() => preloadRoute('/clients')}
                    onPointerDown={() => preloadRoute('/clients')}
                    onFocus={() => preloadRoute('/clients')}
                  >
                    <BuildingOfficeIcon />
                    <SidebarLabel>Clientes</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
              )}
            </SidebarBody>

            {/* FOOTER USER */}
            <SidebarFooter className="border-t border-border-subtle pt-4 max-lg:hidden dark:border-white/10">
              <div className="mb-2 flex items-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  onPointerEnter={preloadCommandPaletteIntent}
                  onPointerDown={preloadCommandPaletteIntent}
                  onFocus={preloadCommandPaletteIntent}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-canvas/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) dark:hover:bg-white/5 dark:hover:text-ink"
                >
                  <MagnifyingGlassIcon className="size-4 shrink-0" />
                  <span>Buscar</span>
                  <kbd className="ml-auto rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] text-ink-muted">
                    {commandShortcutLabel}
                  </kbd>
                </button>
                {notificationsRequested ? (
                  <NotificationBell initialOpen={notificationsOpenRequested} />
                ) : (
                  <button
                    type="button"
                    aria-label="Notificaciones"
                    onPointerEnter={() => setNotificationsRequested(true)}
                    onFocus={() => void loadNotificationBell()}
                    onClick={() => {
                      setNotificationsOpenRequested(true)
                      setNotificationsRequested(true)
                    }}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                  >
                    <BellIcon className="size-5" />
                  </button>
                )}
                <ThemeToggle className="size-8" />
              </div>
              <Dropdown>
                <DropdownButton
                  as={SidebarItem}
                  aria-label="Abrir menú de cuenta"
                  onFocus={preloadProfile}
                  onPointerDown={preloadProfile}
                  onPointerEnter={preloadProfile}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <UserAvatar user={user} size="md" />

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {user?.first_name} {user?.last_name}
                      </span>
                      <span className="block truncate text-xs text-ink-muted dark:text-ink-secondary">{user?.email}</span>
                    </span>
                  </span>
                  <ChevronUpIcon />
                </DropdownButton>

                <AccountDropdownMenu anchor="top start" clearSession={clearSession} onProfileIntent={preloadProfile} />
              </Dropdown>
            </SidebarFooter>
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
                  <span className="font-semibold text-ink dark:text-white">{currentClient.name}</span>
                </p>
                <p className="text-[11px] text-ink-muted">
                  {accessProfile.platformLevel === 'root_1' ? 'Acceso Root 1' : 'Modo soporte Root 2'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectPlatformWorkspace(tenant.code)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-(--tenant-accent) transition-colors hover:bg-white/[0.05]"
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
          onSelectOrganization={(client) => selectOrganizationWorkspace(tenant.code, normalizeClient(client))}
          onSelectPlatform={() => selectPlatformWorkspace(tenant.code)}
        />
      )}

      {cmdOpen && (
        <CommandPalette
          open
          onClose={() => setCmdOpen(false)}
          isRoot={accessProfile.isPlatformContext && accessProfile.platformLevel !== 'none'}
          clientId={currentClient?.id}
        />
      )}
    </div>
  )
}
