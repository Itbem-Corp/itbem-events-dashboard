'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import Image from 'next/image'
import { fetcher } from '@/lib/fetcher'
import { useDebounce } from '@/hooks/useDebounce'

// UI Components
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { PageTransition } from '@/components/ui/page-transition'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

// Icons
import {
    PlusIcon, PencilIcon, TrashIcon,
    CalendarIcon, BriefcaseIcon,
    MagnifyingGlassIcon, BuildingOffice2Icon,
} from '@heroicons/react/20/solid'

// Lazy-loaded modals — only downloaded when the user opens them
const ClientFormModal = dynamic(
    () => import('@/components/clients/forms/client-form-modal').then((m) => m.ClientFormModal),
    { ssr: false }
)
const DeleteClientModal = dynamic(
    () => import('@/components/clients/forms/delete-client-modal').then((m) => m.DeleteClientModal),
    { ssr: false }
)

import type { Client } from '@/models/Client'

const PAGE_SIZE = 12

export default function ClientsPage() {
    const { data: clients = [], isLoading, error } = useSWR<Client[]>('/clients', fetcher, {
        revalidateIfStale: false,
        revalidateOnFocus: false
    })

    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [selectedClient, setSelectedClient] = useState<Client | null>(null)

    const debouncedSearch = useDebounce(search, 200)

    // Reset page when search settles
    useEffect(() => setPage(1), [debouncedSearch])

    const filteredClients = useMemo(
        () => clients.filter((c) =>
            c.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
        ),
        [clients, debouncedSearch]
    )

    const paginatedClients = useMemo(
        () => filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filteredClients, page]
    )

    const openNewClientModal = useCallback(() => {
        setSelectedClient(null)
        setIsFormOpen(true)
    }, [])

    if (error) {
        return (
            <div className="mx-auto max-w-7xl px-4 py-24 text-center text-sm text-red-400">
                Error al cargar clientes. Intenta de nuevo.
            </div>
        )
    }

    return (
        <PageTransition>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8 py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-6">
                    <div>
                        <Heading>Clientes</Heading>
                        <p className="mt-2 text-sm text-zinc-400">
                            Gestiona los clients y jerarquías de tu plataforma.
                        </p>
                    </div>
                    <Button
                        onClick={openNewClientModal}
                        className="w-full sm:w-auto"
                    >
                        <PlusIcon className="size-4" /> Nuevo Cliente
                    </Button>
                </div>

                {/* SEARCH */}
                {!isLoading && clients.length > 0 && (
                    <div className="relative max-w-sm">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                        <input
                            type="search"
                            placeholder="Buscar cliente..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-zinc-900/50 pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                        />
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    {isLoading ? (
                        [...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                                <div className="size-16 rounded-xl skeleton shrink-0" />
                                <div className="flex-1 space-y-3">
                                    <div className="h-4 skeleton rounded w-1/3" />
                                    <div className="h-3 skeleton rounded w-1/4" />
                                </div>
                            </div>
                        ))
                    ) : filteredClients.length === 0 ? (
                        debouncedSearch ? (
                            <p className="py-12 text-center text-sm text-zinc-400">
                                Sin resultados para &quot;{debouncedSearch}&quot;
                            </p>
                        ) : (
                            <EmptyState
                                icon={BuildingOffice2Icon}
                                title="Sin clientes"
                                description="Crea tu primera organización"
                                action={{ label: 'Nuevo Cliente', onClick: openNewClientModal }}
                            />
                        )
                    ) : (
                        <AnimatedList className="grid grid-cols-1 gap-4">
                            {paginatedClients.map((client, index) => (
                                <AnimatedListItem key={client.id}>
                                    <div className="group relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 rounded-2xl border border-white/10 bg-zinc-900/50 p-4 sm:p-5 transition-all hover:bg-zinc-900 hover:border-white/20 hover:-translate-y-0.5 shadow-sm">
                                        <div className="flex items-center gap-4">
                                            {client.logo ? (
                                                <div className="relative size-14 sm:size-16 overflow-hidden rounded-xl border border-white/20 bg-white shadow-sm transition-transform group-hover:scale-105">
                                                    <Image
                                                        src={client.logo}
                                                        alt={client.name ?? ''}
                                                        fill
                                                        className="object-contain p-1.5"
                                                        sizes="64px"
                                                        priority={index < 3}
                                                    />
                                                </div>
                                            ) : (
                                                <Avatar
                                                    initials={(client.name || '??').substring(0, 2).toUpperCase()}
                                                    className="size-14 sm:size-16 rounded-xl border border-white/10 bg-zinc-800 text-white font-bold"
                                                />
                                            )}

                                            <div className="sm:hidden flex-1">
                                                <h2 className="text-sm font-bold text-white">{client.name}</h2>
                                                <Badge color={client.is_active ? "green" : "zinc"} className="mt-1">
                                                    {client.is_active ? "Activo" : "Inactivo"}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="hidden sm:block flex-1">
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-lg font-bold text-white">{client.name}</h2>
                                                <Badge color={client.is_active ? "green" : "zinc"}>
                                                    {client.is_active ? "Activo" : "Inactivo"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-zinc-400 font-mono mt-1">{client.code}</p>
                                        </div>

                                        <div className="flex justify-between sm:gap-8 border-t border-white/5 pt-4 sm:border-t-0 sm:pt-0">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] uppercase text-zinc-400 font-bold">Tipo</span>
                                                <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-200 mt-1">
                                                    <BriefcaseIcon className="size-3.5 text-zinc-500" />
                                                    {client.client_type?.name || 'N/A'}
                                                </div>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] uppercase text-zinc-400 font-bold">Registro</span>
                                                <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-200 mt-1">
                                                    <CalendarIcon className="size-3.5 text-zinc-500" />
                                                    {client.created_at ? new Date(client.created_at).toLocaleDateString() : '--'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2 sm:pl-4 sm:border-l sm:border-white/5">
                                            <Button plain onClick={() => { setSelectedClient(client); setIsFormOpen(true); }} aria-label={`Editar ${client.name}`}>
                                                <PencilIcon className="size-5 text-zinc-400 hover:text-white" />
                                            </Button>
                                            <Button plain onClick={() => { setSelectedClient(client); setIsDeleteOpen(true); }} aria-label={`Eliminar ${client.name}`}>
                                                <TrashIcon className="size-5 text-zinc-400 hover:text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </AnimatedListItem>
                            ))}
                        </AnimatedList>
                    )}

                    {!isLoading && filteredClients.length > PAGE_SIZE && (
                        <Pagination
                            total={filteredClients.length}
                            page={page}
                            pageSize={PAGE_SIZE}
                            onPageChange={setPage}
                        />
                    )}
                </div>

                <ClientFormModal isOpen={isFormOpen} setIsOpen={setIsFormOpen} client={selectedClient} />
                <DeleteClientModal isOpen={isDeleteOpen} setIsOpen={setIsDeleteOpen} client={selectedClient} />
            </div>
        </PageTransition>
    )
}
