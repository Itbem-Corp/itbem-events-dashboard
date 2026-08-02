'use client'

import { useDebounce } from '@/hooks/useDebounce'
import { useListViewState } from '@/hooks/useListViewState'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { clientsPageQueryPath, useClientsPage } from '@/features/clients/use-clients-page'
import {
  clientMembersPagePath,
  clientRolesPath,
  clientTypesPath,
  scopedEventsPath,
} from '@/lib/api-paths'
import { removeClientsCacheValue, upsertClientCacheValue } from '@/lib/client-cache'
import { fetcher } from '@/lib/fetcher'
import { beginNavigationProgress } from '@/lib/navigation-progress'
import { sessionCan } from '@/lib/session-capabilities'
import { useStore } from '@/store/useStore'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { preload } from 'swr'

// UI Components
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { PageDataError } from '@/components/ui/page-data-error'
import { PageTransition } from '@/components/ui/page-transition'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'

// Icons
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/20/solid'

const loadClientFormModal = () => import('@/components/clients/forms/client-form-modal')
const loadDeleteClientModal = () => import('@/components/clients/forms/delete-client-modal')
const loadClientMembersModal = () => import('@/components/clients/client-members-modal')
const loadClientListActionsMenu = () => import('@/components/clients/client-list-actions-menu')

// Lazy-loaded modals — only downloaded when the user shows intent.
const ClientFormModal = dynamic(() => loadClientFormModal().then((module) => module.ClientFormModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando organización" />,
})
const DeleteClientModal = dynamic(() => loadDeleteClientModal().then((module) => module.DeleteClientModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando confirmación" />,
})
const ClientMembersModal = dynamic(() => loadClientMembersModal().then((module) => module.ClientMembersModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando equipo" />,
})
const ClientListActionsMenu = dynamic(
  () => loadClientListActionsMenu().then((module) => module.ClientListActionsMenu),
  {
    ssr: false,
    loading: () => (
      <div className="absolute top-full right-0 z-30 mt-2 h-36 w-52 animate-pulse rounded-xl border border-border-subtle bg-surface-raised" />
    ),
  }
)

function preloadClientForm() {
  void Promise.all([loadClientFormModal(), Promise.resolve(preload(clientTypesPath(), fetcher))]).catch(() => undefined)
}

function preloadClientActions() {
  void loadClientListActionsMenu().catch(() => undefined)
}

function preloadDeleteClient() {
  void loadDeleteClientModal().catch(() => undefined)
}

import type { Client, ClientsPageResponse } from '@/models/Client'

const PAGE_SIZE = 12
const CLIENT_VIEW_FILTERS = ['all'] as const

// Type → display label + badge color
const TYPE_META: Record<string, { singularLabel: string; color: 'violet' | 'blue' | 'emerald' }> = {
  PLATFORM: { singularLabel: 'Plataforma', color: 'violet' },
  AGENCY: { singularLabel: 'Agencia', color: 'blue' },
  CUSTOMER: { singularLabel: 'Cliente', color: 'emerald' },
}

// Sub-client type allowed for each parent type
const SUB_TYPE: Record<string, string> = {
  PLATFORM: 'AGENCY',
  AGENCY: 'CUSTOMER',
}

const ROLE_META: Record<string, { label: string; description: string }> = {
  OWNER: { label: 'Propietario', description: 'Control total de la organización' },
  ADMIN: { label: 'Administrador', description: 'Gestiona operación y equipo' },
  EVENT_MANAGER: { label: 'Gestor de eventos', description: 'Opera eventos e invitados' },
  EDITOR: { label: 'Editor', description: 'Edita experiencias de evento' },
  CHECKIN: { label: 'Check-in', description: 'Opera accesos e invitados' },
  ANALYST: { label: 'Analista', description: 'Consulta métricas y resultados' },
  MEMBER: { label: 'Colaborador', description: 'Trabaja en eventos asignados' },
  GUEST: { label: 'Solo lectura', description: 'Consulta información autorizada' },
}

export default function ClientsPage() {
  const router = useRouter()
  const scopeFetcherKey = useScopedFetcherScope()
  const setCurrentClient = useStore((s) => s.setCurrentClient)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)
  const canCreatePlatform = Boolean(user?.is_root && user.root_level !== 2)
  const canAssignMembers = sessionCan(applicationSession, 'members:manage')
  const hasEvents = sessionCan(applicationSession, 'events:view')

  const { search, setSearch, page, setPage } = useListViewState({
    defaultFilter: 'all',
    pagination: true,
    validFilters: CLIENT_VIEW_FILTERS,
  })
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isMembersOpen, setIsMembersOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [subClientParent, setSubClientParent] = useState<Client | null>(null)
  const [openActionClientId, setOpenActionClientId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 200)
  const {
    data: rawClients,
    isLoading,
    isValidating,
    error,
    mutate,
    clientsPage,
    clients,
    dataErrorState,
  } = useClientsPage({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
  })

  useEffect(() => {
    if (isLoading) return
    const lastPage = Math.max(clientsPage?.total_pages ?? 1, 1)
    if (page > lastPage) setPage(lastPage, 'replace')
  }, [clientsPage?.total_pages, isLoading, page, setPage])

  const preloadClientsPage = useCallback(
    (nextPage: number) => {
      const path = clientsPageQueryPath({ page: nextPage, pageSize: PAGE_SIZE, search: debouncedSearch })
      void Promise.resolve(preload(scopeFetcherKey(path), fetcher)).catch(() => undefined)
    },
    [debouncedSearch, scopeFetcherKey]
  )

  const openNewClientModal = useCallback(() => {
    setSelectedClient(null)
    setSubClientParent(null)
    setIsFormOpen(true)
  }, [])

  const openSubClientModal = useCallback((parent: Client) => {
    setSelectedClient(null)
    setSubClientParent(parent)
    setIsFormOpen(true)
  }, [])

  const handleSwitchClient = useCallback(
    (client: Client) => {
      setCurrentClient({
        id: client.id,
        name: client.name,
        code: client.code,
        logo: client.logo,
        access_role: client.access_role,
        client_type: client.client_type ?? { code: '' },
      })
      beginNavigationProgress()
      router.push(hasEvents ? '/events' : '/clients')
    },
    [hasEvents, setCurrentClient, router]
  )

  const preloadClientEvents = useCallback(
    (client: Client) => {
      if (hasEvents) {
        router.prefetch('/events')
        const path = scopedEventsPath(client.id, true)
        if (path) void preload(path, fetcher)
      }
    },
    [hasEvents, router]
  )

  const preloadClientMembers = useCallback((client: Client) => {
    void Promise.all([
      loadClientMembersModal(),
      Promise.resolve(preload(clientMembersPagePath(client.id, 1, 20), fetcher)),
      Promise.resolve(preload(clientRolesPath(client.id), fetcher)),
    ]).catch(() => undefined)
  }, [])

  const saveClientInCurrentPage = useCallback(
    async (savedClient: Client | null) => {
      if (!savedClient) {
        void mutate()
        return
      }
      const alreadyVisible = clients.some((client) => client.id === savedClient.id)
      const belongsOnCurrentPage =
        alreadyVisible ||
        (page === 1 && (!debouncedSearch || savedClient.name.toLowerCase().includes(debouncedSearch.toLowerCase())))
      if (!belongsOnCurrentPage) {
        void mutate()
        return
      }
      await mutate((current) => upsertClientCacheValue(current ?? rawClients, savedClient) as ClientsPageResponse, {
        revalidate: false,
      })
    },
    [clients, debouncedSearch, mutate, page, rawClients]
  )

  const removeClientFromCurrentPage = useCallback(
    async (client: Client) => {
      await mutate((current) => removeClientsCacheValue(current ?? rawClients, [client.id]) as ClientsPageResponse, {
        revalidate: false,
      })
    },
    [mutate, rawClients]
  )

  const restoreClientToCurrentPage = useCallback(
    async (client: Client) => {
      await mutate((current) => upsertClientCacheValue(current ?? rawClients, client) as ClientsPageResponse, {
        revalidate: false,
      })
    },
    [mutate, rawClients]
  )

  if (dataErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar los clientes"
        description="La estructura de organizaciones permanece intacta. Reintenta para recuperar la vista."
        onRetry={() => void mutate()}
        retrying={isValidating}
        icon={BuildingOffice2Icon}
      />
    )
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Organizaciones"
          title="Clientes"
          description="Administra la estructura, los equipos y el acceso a cada organización."
          icon={BuildingOffice2Icon}
          actions={
            canCreatePlatform ? (
              <Button
                color="indigo"
                onClick={openNewClientModal}
                onPointerEnter={preloadClientForm}
                onPointerDown={preloadClientForm}
                onFocus={preloadClientForm}
                className="w-full sm:w-auto"
              >
                <PlusIcon className="size-4" /> Nueva plataforma
              </Button>
            ) : undefined
          }
        />

        {dataErrorState === 'stale' && (
          <StaleDataNotice label="clientes" onRetry={() => void mutate()} retrying={isValidating} />
        )}

        {/* SEARCH */}
        {!isLoading && (clients.length > 0 || Boolean(search)) && (
          <div
            aria-busy={isValidating}
            className="premium-surface relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl p-2"
          >
            {isValidating && <div className="absolute inset-x-0 top-0 h-px animate-pulse bg-(--tenant-accent)" />}
            <div className="relative w-full sm:max-w-xs">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                aria-label="Buscar cliente"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-surface-interactive py-2 pr-4 pl-9 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-border-strong focus:border-(--tenant-accent)/45 focus:ring-2 focus:ring-(--tenant-accent)/10 focus:outline-none"
              />
            </div>
            <span className="hidden pr-2 text-xs text-ink-muted sm:block">
              {clientsPage?.total ?? clients.length} organización
              {(clientsPage?.total ?? clients.length) === 1 ? '' : 'es'}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-raised p-5">
                <div className="skeleton size-16 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-3">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          debouncedSearch ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title={`Sin resultados para “${debouncedSearch}”`}
              description="No encontramos organizaciones que coincidan con tu búsqueda."
              action={{ label: 'Limpiar búsqueda', onClick: () => setSearch('') }}
            />
          ) : (
            <EmptyState
              icon={BuildingOffice2Icon}
              title="Sin clientes"
              description={
                canCreatePlatform
                  ? 'Crea la primera plataforma para comenzar la estructura organizacional.'
                  : 'No hay organizaciones visibles dentro de tu alcance actual.'
              }
              action={canCreatePlatform ? { label: 'Nueva plataforma', onClick: openNewClientModal } : undefined}
            />
          )
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-(--tenant-accent)/15 bg-(--tenant-accent)/[0.045] px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Tu alcance organizacional</p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    {user?.is_root
                      ? user.root_level === 2
                        ? 'Acceso operativo: puedes supervisar la plataforma y dar soporte, sin cambiar su jerarquía ni equipos.'
                        : 'Acceso de plataforma: puedes supervisar y gobernar toda la estructura y sus eventos.'
                      : 'Tus acciones se habilitan por tu rol dentro de cada organización y, cuando aplique, por evento.'}
                  </p>
                </div>
                <span className="text-xs font-medium text-(--tenant-accent)">
                  {user?.is_root
                    ? `Root ${user.root_level ?? 1}`
                    : `${clientsPage?.total ?? clients.length} organizaciones visibles`}
                </span>
              </div>
            </section>

            <section aria-label="Directorio de organizaciones">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Badge color="violet">Organizaciones visibles</Badge>
                <span className="basis-full text-xs text-ink-muted sm:basis-auto">
                  Lista paginada · la organización superior aparece como referencia
                </span>
                <div className="hidden h-px flex-1 bg-border-subtle sm:block" />
              </div>

              <ul className="premium-surface divide-y divide-white/6 overflow-hidden rounded-2xl">
                {clients.map((client) => {
                  const parentTypeCode = (client.client_type?.code ?? '').toUpperCase()
                  const canHaveSubClients = parentTypeCode in SUB_TYPE
                  const typeMeta = TYPE_META[parentTypeCode] ?? {
                    singularLabel: client.client_type?.name ?? 'Organización',
                    color: 'violet' as const,
                  }
                  const isInheritedRole = client.access_role?.startsWith('INHERITED_') ?? false
                  const roleCode = client.access_role?.replace('INHERITED_', '').toUpperCase()
                  const isPrimaryRoot = Boolean(user?.is_root && user.root_level !== 2)
                  const canManageMembers =
                    canAssignMembers || isPrimaryRoot || roleCode === 'OWNER' || roleCode === 'ADMIN'
                  const canEditOrganization = isPrimaryRoot || roleCode === 'OWNER'
                  const role = user?.is_root
                    ? {
                        label: `Root ${user.root_level ?? 1}`,
                        description:
                          user.root_level === 2
                            ? 'Soporte operativo sin gobierno organizacional'
                            : 'Gobierno total de plataforma',
                      }
                    : roleCode
                      ? (ROLE_META[roleCode] ?? { label: roleCode, description: 'Acceso asignado' })
                      : null

                  return (
                    <li
                      key={client.id}
                      className="group relative flex flex-col items-stretch gap-4 p-4 transition-[background-color,transform] duration-200 motion-safe:hover:translate-x-0.5 hover:bg-surface-interactive sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                        <div className="shrink-0">
                          {client.logo ? (
                            <div className="relative size-12 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-sm sm:size-14">
                              <Image
                                src={client.logo}
                                alt={client.name ?? ''}
                                fill
                                className="object-contain p-1.5"
                                sizes="(max-width: 640px) 48px, 56px"
                              />
                            </div>
                          ) : (
                            <Avatar
                              initials={(client.name || '??').substring(0, 2).toUpperCase()}
                              className="size-12 rounded-xl border border-border-subtle bg-surface-soft font-bold text-ink sm:size-14"
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-(--tenant-accent) sm:text-base">
                            {client.name}
                          </h2>
                          {client.parent?.name && (
                            <p className="mt-0.5 truncate text-xs text-ink-muted">
                              Organización superior: {client.parent.name}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge color={typeMeta.color}>{typeMeta.singularLabel}</Badge>
                            <span className="rounded-full border border-border-subtle bg-surface-soft px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                              {isInheritedRole
                                ? `${role?.label ?? 'Acceso'} heredado`
                                : (role?.label ?? 'Sin acceso directo')}
                            </span>
                            <span className="truncate font-mono text-xs text-ink-muted">{client.code}</span>
                          </div>
                        </div>
                      </div>

                      <div className="hidden items-center gap-8 lg:flex">
                        <div>
                          <span className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                            Tu rol
                          </span>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
                            {role ? role.label : 'Sin acceso directo'}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                            Alcance
                          </span>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
                            {isInheritedRole
                              ? `${role?.description ?? 'Acceso'} heredado de la organización superior`
                              : (role?.description ?? 'Sin permiso de operación asignado')}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-3 sm:w-auto sm:flex-nowrap sm:border-0 sm:pt-0">
                        <Button
                          outline
                          onClick={() => handleSwitchClient(client)}
                          onFocus={() => preloadClientEvents(client)}
                          onPointerDown={() => preloadClientEvents(client)}
                          onPointerEnter={() => preloadClientEvents(client)}
                          title={hasEvents ? 'Operar eventos de este cliente' : 'Seleccionar este cliente'}
                          aria-label={`${hasEvents ? 'Operar' : 'Seleccionar'} ${client.name}`}
                        >
                          <ArrowRightIcon data-slot="icon" aria-hidden="true" />
                          <span>{hasEvents ? 'Operar' : 'Seleccionar'}</span>
                        </Button>

                        {(canManageMembers || canEditOrganization) && (
                          <details
                            name="client-actions"
                            className="relative"
                            onToggle={(detailsEvent) => {
                              setOpenActionClientId(detailsEvent.currentTarget.open ? client.id : null)
                            }}
                          >
                            <summary
                              role="button"
                              aria-label={`Más acciones para ${client.name}`}
                              onPointerEnter={preloadClientActions}
                              onPointerDown={preloadClientActions}
                              onFocus={preloadClientActions}
                              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-interactive hover:text-ink focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                            >
                              <EllipsisVerticalIcon className="size-5" aria-hidden="true" />
                            </summary>
                            {openActionClientId === client.id && (
                              <ClientListActionsMenu
                                client={client}
                                canHaveSubClients={canHaveSubClients}
                                canManageMembers={canManageMembers}
                                canEditOrganization={canEditOrganization}
                                canDeleteOrganization={canEditOrganization}
                                onFormIntent={preloadClientForm}
                                onMembersIntent={preloadClientMembers}
                                onDeleteIntent={preloadDeleteClient}
                                onAddSubClient={openSubClientModal}
                                onManageMembers={(selected) => {
                                  setSelectedClient(selected)
                                  setIsMembersOpen(true)
                                }}
                                onEdit={(selected) => {
                                  setSelectedClient(selected)
                                  setSubClientParent(null)
                                  setIsFormOpen(true)
                                }}
                                onDelete={(selected) => {
                                  setSelectedClient(selected)
                                  setIsDeleteOpen(true)
                                }}
                              />
                            )}
                          </details>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {(clientsPage?.total ?? 0) > PAGE_SIZE && (
              <Pagination
                total={clientsPage?.total ?? 0}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                onPageIntent={preloadClientsPage}
              />
            )}
          </div>
        )}

        {isFormOpen && (
          <ClientFormModal
            isOpen
            setIsOpen={setIsFormOpen}
            client={selectedClient}
            parentId={subClientParent?.id}
            restrictTypeCode={
              subClientParent ? SUB_TYPE[(subClientParent.client_type?.code ?? '').toUpperCase()] : undefined
            }
            onSaved={saveClientInCurrentPage}
          />
        )}
        {isDeleteOpen && (
          <DeleteClientModal
            isOpen
            setIsOpen={setIsDeleteOpen}
            client={selectedClient}
            onOptimisticDelete={removeClientFromCurrentPage}
            onDeleteRollback={restoreClientToCurrentPage}
          />
        )}
        {isMembersOpen && selectedClient && (
          <ClientMembersModal
            isOpen
            onClose={() => setIsMembersOpen(false)}
            clientId={selectedClient.id}
            clientName={selectedClient.name}
          />
        )}
      </div>
    </PageTransition>
  )
}
