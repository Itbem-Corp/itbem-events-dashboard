'use client'

import UserAvatar from '@/components/ui/UserAvatar'

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeader,
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
import {
  ArrowRightStartOnRectangleIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import { BellIcon, ChartBarSquareIcon, HomeIcon, MagnifyingGlassIcon, Square2StackIcon } from '@heroicons/react/20/solid'

import { Avatar } from '@/components/avatar'
import { Link } from '@/components/link'
import { useDebounce } from '@/hooks/useDebounce'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import { readApiData } from '@/lib/api-envelope'
import {
  clientMembersPagePath,
  clientsPagePath,
  eventsPagePath,
  scopedEventsDashboardPath,
  scopedEventsPagePath,
  usersAllPath,
  usersPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { sessionCan } from '@/lib/session-capabilities'
import { getDataErrorState } from '@/lib/swr-data-state'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ClientsPageResponse } from '@/models/Client'
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
      className="flex size-8 items-center justify-center rounded-lg text-zinc-600"
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
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <MagnifyingGlassIcon className="size-5 text-zinc-600" />
          <div className="h-4 w-44 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="space-y-2 p-3" role="status" aria-live="polite">
          <span className="sr-only">Preparando búsqueda…</span>
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="size-9 animate-pulse rounded-lg bg-zinc-900" />
              <div className="space-y-2">
                <div className="h-3 w-36 animate-pulse rounded bg-zinc-800" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-900" />
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

function preloadCommandPaletteResources(clientId: string | undefined, isRoot: boolean) {
  const eventsPath = scopedEventsPagePath(clientId, isRoot, { page: 1, page_size: 6, filter: 'all' })
  const tasks: Promise<unknown>[] = [loadCommandPalette()]
  if (eventsPath) tasks.push(Promise.resolve(preload(eventsPath, fetcher)))
  void Promise.all(tasks).catch(() => undefined)
}
interface ClientRaw {
  id: string
  name: string
  code: string
  logo?: string
  access_role?: string
  client_type?: { code: string }
}

// API keys are normalized to snake_case by the Axios interceptor in api.ts
function normalizeClient(raw: ClientRaw) {
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
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [commandShortcutLabel, setCommandShortcutLabel] = useState('Ctrl K')
  const [tenant, setTenant] = useState(() => tenantPresentationForHostname('dashboard.eventiapp.com.mx'))
  const debouncedOrganizationSearch = useDebounce(organizationSearch, 200)

  useEffect(() => {
    setTenant(tenantPresentationForHostname(window.location.hostname))
  }, [])

  const currentClient = useStore((s) => s.currentClient)
  const setCurrentClient = useStore((s) => s.setCurrentClient)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)

  const isRoot = Boolean(user?.is_root)
  const modules = useMemo(
    () => applicationSession?.application.modules ?? tenant.modules,
    [applicationSession?.application.modules, tenant.modules]
  )
  const hasEvents = applicationSession ? sessionCan(applicationSession, 'events:view') : modules.includes('events')
  const canViewUsers = applicationSession
    ? sessionCan(applicationSession, 'platform:users:view')
    : isRoot && modules.includes('users')
  const canViewOrganizations = applicationSession
    ? sessionCan(applicationSession, 'organizations:view')
    : isRoot && modules.includes('organizations')
  const canManageMembers = sessionCan(applicationSession, 'members:manage')
  const canViewMetrics = applicationSession
    ? sessionCan(applicationSession, 'metrics:view')
    : modules.includes('metrics')
  const canSwitchOrganizations = applicationSession
    ? canViewOrganizations || sessionCan(applicationSession, 'events:manage')
    : isRoot
  const preloadCommandPaletteIntent = () => {
    if (hasEvents) preloadCommandPaletteResources(currentClient?.id, isRoot)
  }
  // On a cold login, resolve the first organization in parallel with the profile.
  // The paginated endpoint scopes itself from the authenticated identity, so this
  // does not need to wait until the profile reveals whether the user is root.
  const shouldBootstrapClient = storeHydrated && !currentClient
  const shouldLoadClients = clientsRequested || shouldBootstrapClient

  const preloadDataIfMissing = useCallback(
    (path: string) => {
      if (swrCache.get(path)?.data !== undefined) return
      void Promise.resolve(preload(path, fetcher)).catch(() => undefined)
    },
    [swrCache]
  )

  const preloadRoute = useCallback(
    (href: '/' | '/events' | '/metrics' | '/team' | '/users' | '/clients') => {
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
                ? null
              : href === '/team'
                ? currentClient?.id
                  ? clientMembersPagePath(currentClient.id, 1, 20)
                  : null
                : clientsPagePath({ page: 1, page_size: 12 })

      if (dataPath) preloadDataIfMissing(dataPath)
    },
    [currentClient?.id, isRoot, preloadDataIfMissing, router]
  )

  function preloadClientPortfolio(clientId: string) {
    router.prefetch('/')
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

    const list: ClientRaw[] = clients

    // ✅ Si hay clientes y no hay currentClient → seleccionar
    const preferred = list.find((client) => client.code?.toLowerCase() === tenant.organizationCode)
    const currentIsAllowed = currentClient && list.some((client) => client.id === currentClient.id)

    // Organization-scoped apps cannot retain a workspace selected on another
    // branded origin. EventiApp and ITBEM keep their portfolio switcher.
    if (!canSwitchOrganizations && preferred && currentClient?.id !== preferred.id) {
      setCurrentClient(normalizeClient(preferred))
      return
    }

    if (list.length > 0 && !currentIsAllowed) {
      setCurrentClient(normalizeClient(preferred ?? list[0]))
      return
    }

    // 🚫 SOLO usuarios NO ROOT van a onboarding
    if (list.length === 0 && user && !isRoot) {
      router.push('/')
    }

    // ✅ ROOT con 0 clientes → NO REDIRECT
  }, [canSwitchOrganizations, clients, currentClient, isRoot, rawClients, router, setCurrentClient, tenant, user])

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
                <span className="block text-sm font-semibold tracking-tight text-white">{tenant.name}</span>
                <span className="block text-[9px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
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
                className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300 sm:min-h-0 sm:px-3"
              >
                <MagnifyingGlassIcon className="size-4 sm:size-3.5" />
                <span className="hidden sm:inline">Buscar…</span>
                <kbd className="hidden rounded border border-zinc-800 bg-zinc-800 px-1 py-0.5 font-mono text-[9px] text-zinc-700 sm:inline">
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
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                  >
                    <BellIcon className="size-5" />
                  </button>
                ))}
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
            <SidebarHeader className="gap-3 border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-transparent pb-3">
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
                  <span className="block text-base font-semibold tracking-[-0.02em] text-white">{tenant.name}</span>
                  <span className="block text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
                    {tenant.productLabel}
                  </span>
                </span>
              </Link>

              <p className="px-2 text-[10px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
                Espacio de trabajo
              </p>
              {canSwitchOrganizations ? (
                <Dropdown>
                  <DropdownButton
                    as={SidebarItem}
                    onFocus={() => setClientsRequested(true)}
                    onMouseEnter={() => setClientsRequested(true)}
                    onPointerDown={() => setClientsRequested(true)}
                  >
                    <Avatar
                      src={currentClient?.logo}
                      initials={currentClient?.name?.substring(0, 2).toUpperCase() || (isRoot ? 'TO' : '??')}
                      className="bg-(--tenant-accent) text-white"
                    />
                    <SidebarLabel className="font-semibold">
                      {currentClient?.name || (isRoot ? 'Todas las organizaciones' : 'Seleccionar organización')}
                    </SidebarLabel>
                    <ChevronDownIcon />
                  </DropdownButton>

                  <DropdownMenu className="max-w-[90vw] min-w-80 lg:min-w-64" anchor="bottom start">
                    <DropdownHeader>Mis organizaciones</DropdownHeader>

                    {isRoot && (
                      <div className="px-2 pb-2" onClick={(event) => event.stopPropagation()}>
                        <div className="relative">
                          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-600" />
                          <input
                            type="search"
                            aria-label="Buscar organización"
                            placeholder="Buscar organización…"
                            value={organizationSearch}
                            onChange={(event) => setOrganizationSearch(event.target.value)}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="w-full rounded-xl border border-white/10 bg-zinc-900 py-2.5 pr-3 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/10 focus:outline-none"
                          />
                        </div>
                        <p className="mt-1.5 px-1 text-[10px] text-zinc-600" aria-live="polite">
                          {clients.length} de {clientsTotal} organizaciones
                        </p>
                      </div>
                    )}

                    {clientsLoading && (
                      <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Cargando organizaciones…</div>
                    )}

                    {clientsErrorState && (
                      <div className="mx-2 my-1 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                        <p>
                          {clientsErrorState === 'stale'
                            ? 'Mostrando organizaciones guardadas.'
                            : 'No se pudieron cargar las organizaciones.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void retryClients()}
                          disabled={clientsValidating}
                          aria-busy={clientsValidating}
                          className="mt-1 font-semibold hover:text-white disabled:cursor-wait disabled:opacity-60"
                        >
                          {clientsValidating ? 'Reintentando…' : 'Reintentar'}
                        </button>
                      </div>
                    )}

                    {(['PLATFORM', 'AGENCY', 'CUSTOMER'] as const).map((typeCode) => {
                      const group = clients.filter((c) => (c.client_type?.code ?? '').toUpperCase() === typeCode)
                      if (group.length === 0) return null
                      const typeLabel =
                        typeCode === 'PLATFORM' ? 'Plataformas' : typeCode === 'AGENCY' ? 'Agencias' : 'Clientes'
                      return (
                        <div key={typeCode}>
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                              {typeLabel}
                            </span>
                          </div>
                          {group.map((client) => (
                            <DropdownItem
                              key={client.id}
                              onClick={() => setCurrentClient(normalizeClient(client))}
                              onFocus={() => preloadClientPortfolio(client.id)}
                              onPointerDown={() => preloadClientPortfolio(client.id)}
                              onPointerEnter={() => preloadClientPortfolio(client.id)}
                            >
                              <Avatar
                                slot="icon"
                                src={client.logo}
                                initials={(client.name ?? '??').substring(0, 2).toUpperCase()}
                              />
                              <DropdownLabel>{client.name}</DropdownLabel>
                            </DropdownItem>
                          ))}
                        </div>
                      )
                    })}
                  </DropdownMenu>
                </Dropdown>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                  <Avatar
                    src={currentClient?.logo}
                    initials={currentClient?.name?.substring(0, 2).toUpperCase() || tenant.name.substring(0, 2)}
                    className="bg-(--tenant-accent) text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{currentClient?.name || tenant.name}</p>
                    <p className="text-[10px] tracking-[0.14em] text-zinc-500 uppercase">Organización asignada</p>
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
                  <SidebarItem href="/metrics" current={pathname.startsWith('/metrics')}>
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
            <SidebarFooter className="border-t border-white/10 pt-4 max-lg:hidden">
              <div className="mb-2 flex items-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  onPointerEnter={preloadCommandPaletteIntent}
                  onPointerDown={preloadCommandPaletteIntent}
                  onFocus={preloadCommandPaletteIntent}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                >
                  <MagnifyingGlassIcon className="size-4 shrink-0" />
                  <span>Buscar</span>
                  <kbd className="ml-auto rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] text-zinc-600">
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
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                  >
                    <BellIcon className="size-5" />
                  </button>
                )}
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
                      <span className="block truncate text-xs text-zinc-400">{user?.email}</span>
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

      {cmdOpen && (
        <CommandPalette open onClose={() => setCmdOpen(false)} isRoot={isRoot} clientId={currentClient?.id} />
      )}
    </div>
  )
}
