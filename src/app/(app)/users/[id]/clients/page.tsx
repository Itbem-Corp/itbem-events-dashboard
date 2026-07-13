'use client'

import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { EmptyState } from '@/components/ui/empty-state'
import { PageTransition } from '@/components/ui/page-transition'
import { PageDataError } from '@/components/ui/page-data-error'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { Pagination } from '@/components/ui/pagination'
import { useDebounce } from '@/hooks/useDebounce'
import { clientMembersPagePath, clientRolesPath, userClientsPagePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Client } from '@/models/Client'
import type { UserClientsPageResponse } from '@/models/User'
import {
  BuildingOffice2Icon,
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import useSWR, { preload } from 'swr'

const loadClientMembersModal = () => import('@/components/clients/client-members-modal')

const ClientMembersModal = dynamic(() => loadClientMembersModal().then((module) => module.ClientMembersModal), {
  ssr: false,
})

function preloadClientMembershipManager(clientId: string) {
  void Promise.all([
    loadClientMembersModal(),
    Promise.resolve(preload(clientMembersPagePath(clientId, 1, 20), fetcher)),
    Promise.resolve(preload(clientRolesPath(clientId), fetcher)),
  ]).catch(() => undefined)
}

const TYPE_LABELS: Record<string, string> = {
  PLATFORM: 'Plataforma',
  AGENCY: 'Agencia',
  CUSTOMER: 'Cliente',
}

function membershipType(client: Client): string {
  const code = client.client_type?.code?.toUpperCase() ?? ''
  return TYPE_LABELS[code] ?? client.client_type?.name ?? 'Organización'
}

function MembershipSkeleton() {
  return (
    <div className="space-y-4" aria-label="Cargando organizaciones" role="status">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-4 rounded-2xl border border-white/7 bg-white/[0.02] p-5">
          <div className="skeleton size-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="skeleton h-4 w-40 max-w-2/3 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <div className="skeleton hidden h-8 w-24 rounded-lg sm:block" />
        </div>
      ))}
    </div>
  )
}

export default function UserClientsPage() {
  const { id } = useParams<{ id: string }>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 200)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const {
    data: clientsPage,
    isLoading: clientsLoading,
    isValidating: clientsValidating,
    error: clientsError,
    mutate: mutateClients,
  } = useSWR<UserClientsPageResponse>(id ? userClientsPagePath(id, page, 20, debouncedSearch) : null, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })

  const user = clientsPage?.user
  const clients = useMemo(() => clientsPage?.data ?? [], [clientsPage?.data])
  const clientsErrorState = getDataErrorState(clientsError, clientsPage)
  const totalClients = clientsPage?.total ?? 0
  const summary = { total: totalClients, active: clientsPage?.active ?? 0, inactive: clientsPage?.inactive ?? 0 }
  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : 'Usuario'
  const initials = user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || 'U' : 'U'

  if (clientsErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar las membresías"
        description="La información del usuario sigue intacta. Reintenta para recuperar sus organizaciones."
        onRetry={() => void mutateClients()}
        retrying={clientsValidating}
        icon={BuildingOffice2Icon}
      />
    )
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <Link href="/users" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200">
          <ChevronLeftIcon className="size-4" />
          Usuarios
        </Link>

        <header className="flex flex-col gap-5 border-b border-white/7 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar initials={initials} className="size-14 shrink-0 rounded-2xl bg-indigo-500/15 text-indigo-200" />
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-indigo-400 uppercase">
                Membresías del usuario
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Heading className="truncate text-2xl/8 tracking-tight sm:text-3xl/9">
                  {clientsLoading && !clientsPage ? 'Cargando usuario…' : fullName}
                </Heading>
                {user?.is_root && <Badge color="indigo">ROOT</Badge>}
                {user && !user.is_active && <Badge color="zinc">INACTIVO</Badge>}
              </div>
              {user?.email && <p className="mt-1 truncate text-sm text-zinc-500">{user.email}</p>}
            </div>
          </div>
          <Button href="/clients" outline>
            <ShieldCheckIcon />
            Administrar clientes
          </Button>
        </header>

        {clientsErrorState === 'stale' && (
          <StaleDataNotice label="membresías" onRetry={() => void mutateClients()} retrying={clientsValidating} />
        )}

        {Boolean(clientsPage) && (
          <section aria-label="Resumen de membresías" className="grid grid-cols-3 gap-3">
            {[
              { label: 'Asignadas', value: summary.total, color: 'text-zinc-100' },
              { label: 'Activas', value: summary.active, color: 'text-lime-400' },
              { label: 'Inactivas', value: summary.inactive, color: 'text-zinc-500' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/7 bg-white/[0.025] p-4 sm:p-5">
                <p className="truncate text-xs font-medium text-zinc-500">{item.label}</p>
                <p className={`mt-3 text-2xl font-semibold tracking-tight tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </section>
        )}

        {clientsPage && totalClients > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/7 bg-white/[0.02] p-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                aria-label="Buscar organización"
                placeholder="Nombre, código o tipo…"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1) }}
                className="w-full rounded-xl border border-transparent bg-black/15 py-2 pr-4 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              />
            </div>
            <span className="px-2 text-xs text-zinc-600" aria-live="polite">
              {clients.length} de {totalClients}
            </span>
          </div>
        )}

        {clientsLoading && !clientsPage ? (
          <MembershipSkeleton />
        ) : totalClients === 0 && !search ? (
          <EmptyState
            icon={UserGroupIcon}
            title="Sin organizaciones asignadas"
            description="Este usuario todavía no pertenece a ningún cliente. Puedes gestionar las membresías desde Clientes."
            action={{ label: 'Ir a Clientes', href: '/clients' }}
          />
        ) : clients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <p className="text-sm font-medium text-zinc-300">Sin coincidencias</p>
            <p className="mt-1 text-sm text-zinc-600">Prueba con otro nombre, código o tipo de cliente.</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1) }}
              className="mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300"
            >
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/6 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02] shadow-xl shadow-black/5">
            {clients.map((client) => (
              <article
                key={client.id}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.035] sm:gap-4 sm:p-5"
              >
                <Avatar
                  src={client.logo}
                  initials={(client.name || 'OR').slice(0, 2).toUpperCase()}
                  className="size-11 shrink-0 rounded-xl bg-zinc-800 sm:size-12"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-zinc-100 sm:text-base">{client.name}</h2>
                    <Badge color={client.is_active !== false ? 'lime' : 'zinc'}>
                      {client.is_active !== false ? 'ACTIVA' : 'INACTIVA'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                    <span>{membershipType(client)}</span>
                    {client.code && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate font-mono">{client.code}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  outline
                  onClick={() => setSelectedClient(client)}
                  onFocus={() => preloadClientMembershipManager(client.id)}
                  onPointerDown={() => preloadClientMembershipManager(client.id)}
                  onPointerEnter={() => preloadClientMembershipManager(client.id)}
                  aria-label={`Gestionar miembros de ${client.name}`}
                >
                  <UserGroupIcon />
                  <span className="hidden sm:inline">Gestionar</span>
                </Button>
              </article>
            ))}
          </div>
        )}

        <Pagination total={totalClients} page={page} pageSize={20} onPageChange={setPage} />

        {selectedClient && (
          <ClientMembersModal
            isOpen
            onClose={() => setSelectedClient(null)}
            clientId={selectedClient.id}
            clientName={selectedClient.name}
            onMembershipsChanged={async () => {
              await mutateClients()
            }}
          />
        )}
      </div>
    </PageTransition>
  )
}
