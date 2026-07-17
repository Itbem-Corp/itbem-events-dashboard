'use client'

import { useDebounce } from '@/hooks/useDebounce'
import { useListViewState } from '@/hooks/useListViewState'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { userClientsPagePath, userRootLevelPath, usersAllPath, type UsersAllStatusFilter } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { paginateItems } from '@/lib/paginate'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { removeUsersCacheValue, upsertUserCacheValue } from '@/lib/user-cache'
import type { AdminUserListItemResponse, AdminUserResponse, AdminUsersPageResponse } from '@/models/User'
import { useStore } from '@/store/useStore'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { preload } from 'swr'

// UI
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import UserAvatar from '@/components/ui/UserAvatar'
import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { EmptyState } from '@/components/ui/empty-state'
import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { PageDataError } from '@/components/ui/page-data-error'
import { PageTransition } from '@/components/ui/page-transition'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { UserActiveToggle } from '@/components/users/UserActiveToggle'

// Icons
import { MagnifyingGlassIcon, PlusIcon, UsersIcon } from '@heroicons/react/16/solid'
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import { toast } from 'sonner'

const loadUserFormModal = () => import('@/components/users/forms/user-form-modal')
const loadDeleteUserModal = () => import('@/components/users/delete-user-modal')
const loadUserListActionsMenu = () => import('@/components/users/user-list-actions-menu')

// Lazy-loaded modals — only downloaded when the user shows intent.
const UserFormModal = dynamic(() => loadUserFormModal().then((module) => module.UserFormModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando usuario" />,
})
const DeleteUserModal = dynamic(() => loadDeleteUserModal().then((module) => module.DeleteUserModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando confirmación" />,
})
const UserListActionsMenu = dynamic(() => loadUserListActionsMenu().then((module) => module.UserListActionsMenu), {
  ssr: false,
  loading: () => (
    <div className="absolute top-full right-0 z-30 mt-2 h-20 w-48 animate-pulse rounded-xl border border-white/10 bg-surface" />
  ),
})
function preloadUserForm() {
  void loadUserFormModal().catch(() => undefined)
}

function preloadUserActions() {
  void loadUserListActionsMenu().catch(() => undefined)
}

function preloadDeleteUser() {
  void loadDeleteUserModal().catch(() => undefined)
}

const PAGE_SIZE = 10
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ROOT'
const USER_STATUS_FILTERS = ['ALL', 'ACTIVE', 'INACTIVE', 'ROOT'] as const satisfies readonly StatusFilter[]
const SUPPORT_USER_STATUS_FILTERS = ['ALL', 'ACTIVE', 'INACTIVE'] as const satisfies readonly StatusFilter[]

const statusQueryByFilter: Record<StatusFilter, UsersAllStatusFilter | undefined> = {
  ALL: undefined,
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ROOT: 'root',
}

export default function UsersPage() {
  const currentUser = useStore((state) => state.user)
  const isPrimaryRoot = Boolean(currentUser?.root_level === 1 || (currentUser?.is_root && !currentUser.root_level))
  const availableStatusFilters = isPrimaryRoot ? USER_STATUS_FILTERS : SUPPORT_USER_STATUS_FILTERS
  const {
    search,
    setSearch,
    filter: statusFilter,
    setFilter: setStatusFilter,
    page,
    setPage,
  } = useListViewState<StatusFilter>({
    defaultFilter: 'ALL',
    filterParam: 'status',
    pagination: true,
    validFilters: availableStatusFilters,
  })
  const [selectedUser, setSelectedUser] = useState<AdminUserListItemResponse | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [openActionUserId, setOpenActionUserId] = useState<string | null>(null)
  const [rootLevelConfirmation, setRootLevelConfirmation] = useState<AdminUserListItemResponse | null>(null)
  const [rootLevelPendingId, setRootLevelPendingId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 200)
  const usersRequestPath = useMemo(
    () =>
      usersAllPath({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
        status: statusQueryByFilter[statusFilter],
      }),
    [debouncedSearch, page, statusFilter]
  )

  const {
    data: rawData,
    isLoading,
    isValidating,
    error,
    mutate,
  } = useSWR<AdminUsersPageResponse | AdminUserListItemResponse[]>(usersRequestPath, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const usersPayload = useMemo(
    () => readApiData<AdminUsersPageResponse | AdminUserListItemResponse[] | undefined>(rawData),
    [rawData]
  )
  const dataErrorState = getDataErrorState(error, rawData)
  const usersPage = useMemo(
    () => (usersPayload && !Array.isArray(usersPayload) && Array.isArray(usersPayload.data) ? usersPayload : null),
    [usersPayload]
  )
  const users = useMemo(
    () => (usersPage ? usersPage.data : Array.isArray(usersPayload) ? usersPayload : []),
    [usersPage, usersPayload]
  )

  useEffect(() => {
    if (!usersPage) return
    const lastPage = Math.max(usersPage.total_pages, 1)
    if (page > lastPage) setPage(lastPage, 'replace')
  }, [page, setPage, usersPage])

  const filteredUsers = useMemo(() => {
    if (usersPage) return users
    return users.filter((u) => {
      const matchesSearch = `${u.first_name} ${u.last_name} ${u.email}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && u.is_active !== false) ||
        (statusFilter === 'INACTIVE' && u.is_active === false) ||
        (statusFilter === 'ROOT' && u.is_root)
      return matchesSearch && matchesStatus
    })
  }, [users, usersPage, debouncedSearch, statusFilter])

  const paginatedUsers = useMemo(
    () => (usersPage ? filteredUsers : paginateItems(filteredUsers, page, PAGE_SIZE)),
    [filteredUsers, page, usersPage]
  )
  const totalUsers = usersPage ? usersPage.total : filteredUsers.length
  const showUserControls = users.length > 0 || search.trim().length > 0 || statusFilter !== 'ALL'

  const openNewUserModal = useCallback(() => {
    setSelectedUser(null)
    setIsFormOpen(true)
  }, [])

  const preloadUserMemberships = useCallback((userId: string) => {
    void preload(userClientsPagePath(userId, 1, 20), fetcher)
  }, [])

  const preloadUsersPage = useCallback(
    (nextPage: number) => {
      const nextPath = usersAllPath({
        page: nextPage,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
        status: statusQueryByFilter[statusFilter],
      })
      void Promise.resolve(preload(nextPath, fetcher)).catch(() => undefined)
    },
    [debouncedSearch, statusFilter]
  )

  const saveUserInCurrentPage = useCallback(
    async (savedUser: AdminUserResponse | null) => {
      if (!savedUser) {
        void mutate()
        return
      }
      const alreadyVisible = users.some((user) => user.id === savedUser.id)
      const matchesSearch = `${savedUser.first_name} ${savedUser.last_name} ${savedUser.email}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && savedUser.is_active !== false) ||
        (statusFilter === 'INACTIVE' && savedUser.is_active === false) ||
        (statusFilter === 'ROOT' && savedUser.is_root)
      if (!alreadyVisible && (page !== 1 || !matchesSearch || !matchesStatus)) {
        void mutate()
        return
      }
      await mutate((current) => upsertUserCacheValue(current ?? rawData, savedUser) as AdminUsersPageResponse, {
        revalidate: false,
      })
    },
    [debouncedSearch, mutate, page, rawData, statusFilter, users]
  )

  const removeUserFromCurrentPage = useCallback(
    async (user: Pick<AdminUserListItemResponse, 'id'>) => {
      await mutate((current) => removeUsersCacheValue(current ?? rawData, [user.id]) as AdminUsersPageResponse, {
        revalidate: false,
      })
    },
    [mutate, rawData]
  )

  const restoreUserToCurrentPage = useCallback(
    async (user: AdminUserListItemResponse) => {
      await mutate((current) => upsertUserCacheValue(current ?? rawData, user) as AdminUsersPageResponse, {
        revalidate: false,
      })
    },
    [mutate, rawData]
  )

  const updateOperationalRoot = useCallback(
    async (target: AdminUserListItemResponse, rootLevel: 0 | 2) => {
      if (rootLevelPendingId) return

      const optimistic: AdminUserResponse = {
        ...target,
        is_root: rootLevel > 0,
        root_level: rootLevel,
      }
      setRootLevelPendingId(target.id)

      try {
        await mutate((current) => upsertUserCacheValue(current ?? rawData, optimistic) as AdminUsersPageResponse, {
          revalidate: false,
        })
        await api.put(userRootLevelPath(target.id), { root_level: rootLevel })
        setRootLevelConfirmation(null)
        toast.success(rootLevel === 2 ? 'Acceso Root 2 asignado' : 'Acceso Root 2 revocado')
        void mutate()
      } catch (error: unknown) {
        await mutate((current) => upsertUserCacheValue(current ?? rawData, target) as AdminUsersPageResponse, {
          revalidate: false,
        })
        toast.error(getApiErrorMessage(error, 'No se pudo actualizar el acceso Root 2'))
      } finally {
        setRootLevelPendingId(null)
      }
    },
    [mutate, rawData, rootLevelPendingId]
  )

  if (dataErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar los usuarios"
        description="Los accesos y permisos permanecen intactos. Reintenta para recuperar el equipo."
        onRetry={() => void mutate()}
        retrying={isValidating}
        icon={UsersIcon}
      />
    )
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Equipo y accesos"
          title="Usuarios"
          description={
            isPrimaryRoot
              ? 'Gestiona identidades, permisos y acceso a organizaciones.'
              : 'Modo operativo: asiste usuarios estándar sin exponer cuentas Root ni su estructura de acceso.'
          }
          icon={UsersIcon}
          actions={
            <Button
              color="indigo"
              onClick={openNewUserModal}
              onPointerEnter={preloadUserForm}
              onPointerDown={preloadUserForm}
              onFocus={preloadUserForm}
            >
              <PlusIcon className="size-4" />
              Nuevo Usuario
            </Button>
          }
        />

        {dataErrorState === 'stale' && (
          <StaleDataNotice label="usuarios" onRetry={() => void mutate()} retrying={isValidating} />
        )}

        {/* STATUS FILTERS */}
        {!isLoading && showUserControls && (
          <div
            role="group"
            aria-label="Filtrar usuarios por estado"
            className="premium-surface flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1.5"
          >
            {(
              [
                { label: 'Todos', filter: 'ALL' },
                { label: 'Activos', filter: 'ACTIVE' },
                { label: 'Inactivos', filter: 'INACTIVE' },
                ...(isPrimaryRoot ? [{ label: 'Root', filter: 'ROOT' } as const] : []),
              ] as const
            ).map((item) => (
              <button
                type="button"
                key={item.filter}
                aria-pressed={statusFilter === item.filter}
                onClick={() => setStatusFilter(item.filter)}
                className={[
                  'flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors',
                  statusFilter === item.filter
                    ? 'bg-white/8 text-white shadow-sm ring-1 ring-white/8'
                    : 'text-ink-muted hover:bg-white/[0.035] hover:text-ink',
                ].join(' ')}
              >
                {item.label}
                {statusFilter === item.filter && (
                  <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                    {totalUsers}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* SEARCH */}
        {!isLoading && showUserControls && (
          <div
            aria-busy={isValidating}
            className="relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02] p-2"
          >
            {isValidating && <div className="absolute inset-x-0 top-0 h-px animate-pulse bg-indigo-400" />}
            <div className="relative w-full sm:max-w-xs">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                aria-label="Buscar usuario"
                placeholder="Buscar usuario..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-transparent bg-black/15 py-2 pr-4 pl-9 text-sm text-ink placeholder:text-ink-muted focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              />
            </div>
            <span className="hidden pr-2 text-xs text-ink-muted sm:block">
              {totalUsers} usuario{totalUsers === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {/* LIST */}
        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface/50 p-5">
                <div className="skeleton size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-3">
                  <div className="skeleton h-4 w-1/4 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
                <div className="flex gap-2">
                  <div className="skeleton size-8 rounded" />
                  <div className="skeleton size-8 rounded" />
                </div>
              </div>
            ))
          ) : filteredUsers.length === 0 ? (
            debouncedSearch || statusFilter !== 'ALL' ? (
              <EmptyState
                icon={MagnifyingGlassIcon}
                title={
                  debouncedSearch
                    ? `Sin resultados para “${debouncedSearch}”`
                    : statusFilter === 'ACTIVE'
                      ? 'Sin usuarios activos'
                      : statusFilter === 'INACTIVE'
                        ? 'Sin usuarios inactivos'
                        : 'Sin usuarios Root'
                }
                description="No encontramos usuarios que coincidan con la búsqueda y el estado seleccionados."
                action={{
                  label: 'Limpiar búsqueda y filtros',
                  onClick: () => {
                    setSearch('')
                    setStatusFilter('ALL')
                  },
                }}
              />
            ) : (
              <EmptyState
                icon={UsersIcon}
                title="Sin usuarios"
                description="Invita al primer miembro del equipo"
                action={{ label: 'Nuevo Usuario', onClick: openNewUserModal }}
              />
            )
          ) : (
            <ul
              aria-label="Directorio de usuarios"
              className="divide-y divide-white/6 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02] shadow-xl shadow-black/5"
            >
              {paginatedUsers.map((user) => (
                <li
                  key={user.id}
                  className="group flex flex-col items-stretch gap-4 p-4 transition-colors hover:bg-white/[0.035] sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                >
                  {/* INFO */}
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <UserAvatar user={user} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-ink sm:text-base">
                          {user.first_name} {user.last_name}
                        </p>
                        {user.root_level === 1 && <Badge color="indigo">ROOT 1</Badge>}
                        {user.root_level === 2 && <Badge color="indigo">ROOT 2</Badge>}
                        {user.is_root && !user.root_level && <Badge color="indigo">ROOT 1</Badge>}
                        {!user.is_active && <Badge color="zinc">INACTIVO</Badge>}
                      </div>

                      <p className="mt-0.5 truncate text-xs text-ink-muted">{user.email}</p>

                      {(user.clients ?? 0) > 0 && (
                        <p className="mt-1 text-[11px] text-ink-muted">{user.clients} clientes asociados</p>
                      )}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/6 pt-3 sm:flex-nowrap sm:border-0 sm:pt-0">
                    <Button
                      href={`/users/${user.id}/clients`}
                      outline
                      onFocus={() => preloadUserMemberships(user.id)}
                      onPointerDown={() => preloadUserMemberships(user.id)}
                      onPointerEnter={() => preloadUserMemberships(user.id)}
                      title="Ver clientes"
                      aria-label={`Ver clientes de ${user.first_name} ${user.last_name}`}
                    >
                      <UsersIcon className="size-4" />
                      <span className="hidden sm:inline">Clientes</span>
                    </Button>

                    {/* Optimistic toggle — state flips instantly */}
                    {!user.is_root && (
                      <div data-testid="user-active-toggle">
                        <UserActiveToggle user={user} />
                      </div>
                    )}

                    {isPrimaryRoot && user.root_level !== 1 && !(user.is_root && !user.root_level) && (
                      <Button
                        outline
                        disabled={rootLevelPendingId === user.id}
                        onClick={() => setRootLevelConfirmation(user)}
                        title={user.root_level === 2 ? 'Revocar raíz operativa' : 'Asignar raíz operativa'}
                        aria-label={`${user.root_level === 2 ? 'Revocar' : 'Asignar'} acceso Root 2 a ${user.first_name} ${user.last_name}`}
                      >
                        <span>{user.root_level === 2 ? 'Revocar Root 2' : 'Asignar Root 2'}</span>
                      </Button>
                    )}

                    <details
                      name="user-actions"
                      className="relative"
                      onToggle={(detailsEvent) => {
                        setOpenActionUserId(detailsEvent.currentTarget.open ? user.id : null)
                      }}
                    >
                      <summary
                        role="button"
                        aria-label={`Más acciones para ${user.first_name} ${user.last_name}`}
                        onPointerEnter={preloadUserActions}
                        onPointerDown={preloadUserActions}
                        onFocus={preloadUserActions}
                        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                      >
                        <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
                      </summary>
                      {openActionUserId === user.id && (
                        <UserListActionsMenu
                          user={user}
                          canDelete={isPrimaryRoot}
                          onEditIntent={preloadUserForm}
                          onDeleteIntent={preloadDeleteUser}
                          onEdit={(selected) => {
                            setSelectedUser(selected)
                            setIsFormOpen(true)
                          }}
                          onDelete={(selected) => {
                            setSelectedUser(selected)
                            setIsDeleteOpen(true)
                          }}
                        />
                      )}
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!isLoading && totalUsers > PAGE_SIZE && (
            <Pagination
              total={totalUsers}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onPageIntent={preloadUsersPage}
            />
          )}
        </div>

        {/* Modals mount only after intent, so their dynamic chunks stay off the first paint. */}
        {isFormOpen && (
          <UserFormModal isOpen setIsOpen={setIsFormOpen} user={selectedUser} onSaved={saveUserInCurrentPage} />
        )}
        {isDeleteOpen && (
          <DeleteUserModal
            isOpen
            setIsOpen={setIsDeleteOpen}
            user={selectedUser}
            onOptimisticDelete={removeUserFromCurrentPage}
            onDeleteRollback={restoreUserToCurrentPage}
          />
        )}
        <ConfirmAlert
          open={Boolean(rootLevelConfirmation)}
          title={rootLevelConfirmation?.root_level === 2 ? '¿Revocar acceso Root 2?' : '¿Asignar acceso Root 2?'}
          description={
            rootLevelConfirmation?.root_level === 2
              ? `${rootLevelConfirmation.first_name} ${rootLevelConfirmation.last_name} perderá el acceso operativo global, pero conservará sus asignaciones normales.`
              : `${rootLevelConfirmation?.first_name ?? 'Este usuario'} podrá supervisar y dar soporte en toda la plataforma sin administrar su jerarquía.`
          }
          confirmLabel={rootLevelConfirmation?.root_level === 2 ? 'Revocar Root 2' : 'Asignar Root 2'}
          tone="primary"
          busy={Boolean(rootLevelConfirmation && rootLevelPendingId === rootLevelConfirmation.id)}
          onClose={() => setRootLevelConfirmation(null)}
          onConfirm={() => {
            if (!rootLevelConfirmation) return
            void updateOperationalRoot(rootLevelConfirmation, rootLevelConfirmation.root_level === 2 ? 0 : 2)
          }}
        />
      </div>
    </PageTransition>
  )
}
