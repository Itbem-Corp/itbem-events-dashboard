'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useRouter } from 'next/navigation'
import type { User } from '@/models/User'
import { useDebounce } from '@/hooks/useDebounce'

// UI
import { Heading } from '@/components/heading'
import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import UserAvatar from '@/components/ui/UserAvatar'
import { PageTransition } from '@/components/ui/page-transition'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { UserActiveToggle } from '@/components/users/UserActiveToggle'

// Icons
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    UsersIcon,
    MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'

// Lazy-loaded modals — only downloaded when the user opens them
const UserFormModal = dynamic(
    () => import('@/components/users/forms/user-form-modal').then((m) => m.UserFormModal),
    { ssr: false }
)
const DeleteUserModal = dynamic(
    () => import('@/components/users/delete-user-modal').then((m) => m.DeleteUserModal),
    { ssr: false }
)

const PAGE_SIZE = 10

export default function UsersPage() {
    const router = useRouter()

    const { data: users = [], isLoading, error } = useSWR<User[]>('/users/all', fetcher, {
        revalidateOnFocus: false,
        revalidateIfStale: false,
    })

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'ROOT'>('ALL')
    const [page, setPage] = useState(1)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)

    const debouncedSearch = useDebounce(search, 200)

    // Reset page when search/filter changes
    useEffect(() => setPage(1), [debouncedSearch, statusFilter])

    const filteredUsers = useMemo(
        () =>
            users.filter((u) => {
                const matchesSearch = `${u.first_name} ${u.last_name} ${u.email}`
                    .toLowerCase()
                    .includes(debouncedSearch.toLowerCase())
                const matchesStatus =
                    statusFilter === 'ALL' ||
                    (statusFilter === 'ACTIVE' && u.is_active !== false) ||
                    (statusFilter === 'INACTIVE' && u.is_active === false) ||
                    (statusFilter === 'ROOT' && u.is_root)
                return matchesSearch && matchesStatus
            }),
        [users, debouncedSearch, statusFilter]
    )

    const paginatedUsers = useMemo(
        () => filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filteredUsers, page]
    )

    const openNewUserModal = useCallback(() => {
        setSelectedUser(null)
        setIsFormOpen(true)
    }, [])

    if (error) {
        return (
            <div className="mx-auto max-w-7xl px-4 py-24 text-center text-sm text-red-400">
                Error al cargar usuarios. Intenta de nuevo.
            </div>
        )
    }

    return (
        <PageTransition>
            <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
                {/* HEADER */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-6">
                    <div>
                        <Heading>Usuarios</Heading>
                        <p className="mt-2 text-sm text-zinc-400">
                            Gestión de usuarios, estado y accesos por organización.
                        </p>
                    </div>
                    <Button onClick={openNewUserModal}>
                        <PlusIcon className="size-4" />
                        Nuevo Usuario
                    </Button>
                </div>

                {/* QUICK STATS */}
                {!isLoading && users.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Total', value: users.length, filter: 'ALL' as const, color: 'text-zinc-100' },
                            { label: 'Activos', value: users.filter(u => u.is_active !== false).length, filter: 'ACTIVE' as const, color: 'text-lime-400' },
                            { label: 'Inactivos', value: users.filter(u => u.is_active === false).length, filter: 'INACTIVE' as const, color: 'text-zinc-500' },
                            { label: 'Root', value: users.filter(u => u.is_root).length, filter: 'ROOT' as const, color: 'text-indigo-400' },
                        ].map((s) => (
                            <button
                                key={s.label}
                                onClick={() => setStatusFilter(s.filter)}
                                className={[
                                    'flex flex-col items-center rounded-xl border py-4 transition-all',
                                    statusFilter === s.filter
                                        ? 'border-indigo-500/50 bg-indigo-500/10'
                                        : 'border-white/10 bg-zinc-900/50 hover:border-white/20',
                                ].join(' ')}
                            >
                                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                                <span className="mt-1 text-xs text-zinc-500">{s.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* SEARCH */}
                {!isLoading && users.length > 0 && (
                    <div className="relative max-w-sm">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                        <input
                            type="search"
                            placeholder="Buscar usuario..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-zinc-900/50 pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                        />
                    </div>
                )}

                {/* LIST */}
                <div className="grid grid-cols-1 gap-4">
                    {isLoading ? (
                        [...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                                <div className="size-10 rounded-full skeleton shrink-0" />
                                <div className="flex-1 space-y-3">
                                    <div className="h-4 skeleton rounded w-1/4" />
                                    <div className="h-3 skeleton rounded w-1/3" />
                                </div>
                                <div className="flex gap-2">
                                    <div className="size-8 rounded skeleton" />
                                    <div className="size-8 rounded skeleton" />
                                </div>
                            </div>
                        ))
                    ) : filteredUsers.length === 0 ? (
                        debouncedSearch ? (
                            <p className="py-12 text-center text-sm text-zinc-400">
                                Sin resultados para &quot;{debouncedSearch}&quot;
                            </p>
                        ) : (
                            <EmptyState
                                icon={UsersIcon}
                                title="Sin usuarios"
                                description="Invita al primer miembro del equipo"
                                action={{ label: 'Nuevo Usuario', onClick: openNewUserModal }}
                            />
                        )
                    ) : (
                        <AnimatedList className="grid grid-cols-1 gap-4">
                            {paginatedUsers.map((user) => (
                                <AnimatedListItem key={user.id}>
                                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 hover:border-white/20 hover:-translate-y-0.5 transition-transform">
                                        {/* INFO */}
                                        <div className="flex items-center gap-4 min-w-0">
                                            <UserAvatar user={user} size="md" />

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium truncate">
                                                        {user.first_name} {user.last_name}
                                                    </p>
                                                    {user.is_root && <Badge color="indigo">ROOT</Badge>}
                                                    {!user.is_active && <Badge color="zinc">INACTIVO</Badge>}
                                                </div>

                                                <p className="text-xs text-zinc-400 truncate">
                                                    {user.email}
                                                </p>

                                                {(user.clients ?? 0) > 0 && (
                                                    <p className="text-[11px] text-zinc-500 mt-1">
                                                        {user.clients} clientes asociados
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* ACTIONS */}
                                        <div className="flex items-center gap-2">
                                            <Button
                                                plain
                                                onClick={() => router.push(`/users/${user.id}/clients`)}
                                                title="Ver clientes"
                                            >
                                                <UsersIcon className="size-5" />
                                            </Button>

                                            {/* Optimistic toggle — state flips instantly */}
                                            {!user.is_root && (
                                                <div data-testid="user-active-toggle">
                                                    <UserActiveToggle user={user} />
                                                </div>
                                            )}

                                            <Button
                                                plain
                                                onClick={() => {
                                                    setSelectedUser(user)
                                                    setIsFormOpen(true)
                                                }}
                                            >
                                                <PencilIcon className="size-5" />
                                            </Button>

                                            {!user.is_root && user.clients === 0 && (
                                                <Button
                                                    plain
                                                    onClick={() => {
                                                        setSelectedUser(user)
                                                        setIsDeleteOpen(true)
                                                    }}
                                                >
                                                    <TrashIcon className="size-5 text-red-400" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </AnimatedListItem>
                            ))}
                        </AnimatedList>
                    )}

                    {!isLoading && filteredUsers.length > PAGE_SIZE && (
                        <Pagination
                            total={filteredUsers.length}
                            page={page}
                            pageSize={PAGE_SIZE}
                            onPageChange={setPage}
                        />
                    )}
                </div>

                {/* MODALS — lazy loaded, 0 cost on first paint */}
                <UserFormModal isOpen={isFormOpen} setIsOpen={setIsFormOpen} user={selectedUser} />
                <DeleteUserModal isOpen={isDeleteOpen} setIsOpen={setIsDeleteOpen} user={selectedUser} />
            </div>
        </PageTransition>
    )
}
