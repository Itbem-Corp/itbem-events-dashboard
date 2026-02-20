'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { fetcher } from '@/lib/fetcher'
import type { Client } from '@/models/Client'

import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { BuildingOfficeIcon } from '@heroicons/react/20/solid'
import { PageTransition } from '@/components/ui/page-transition'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { EmptyState } from '@/components/ui/empty-state'

export default function UserClientsPage() {
  const { id } = useParams<{ id: string }>()

  const { data: clients = [], isLoading, error } = useSWR<Client[]>(
    id ? `/users/${id}/clients` : null,
    fetcher
  )

  if (error) {
    return (
      <div className="py-24 text-center text-sm text-red-400">
        Error al cargar organizaciones del usuario.
      </div>
    )
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        <div className="max-lg:hidden">
          <Link href="/users" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500">
            <ChevronLeftIcon className="size-4 fill-zinc-500" />
            Usuarios
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <Heading>Organizaciones del usuario</Heading>
          <p className="mt-2 text-sm text-zinc-400">
            Clientes a los que pertenece este usuario.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                <div className="size-12 rounded-xl skeleton shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 skeleton rounded w-1/3" />
                  <div className="h-3 skeleton rounded w-1/4" />
                </div>
              </div>
            ))
          ) : clients.length === 0 ? (
            <EmptyState
              icon={BuildingOfficeIcon}
              title="Sin organizaciones"
              description="Este usuario no pertenece a ninguna organización."
            />
          ) : (
            <AnimatedList className="grid grid-cols-1 gap-4">
              {clients.map((client) => (
                <AnimatedListItem key={client.id}>
                  <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 hover:-translate-y-0.5 transition-transform">
                    <Avatar
                      src={client.logo}
                      initials={(client.name ?? '??').substring(0, 2).toUpperCase()}
                      className="size-12 rounded-xl bg-zinc-800"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{client.name}</p>
                      <p className="text-xs text-zinc-400 font-mono">{client.code}</p>
                    </div>
                    <Badge color={client.is_active ? 'lime' : 'zinc'}>
                      {client.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </AnimatedListItem>
              ))}
            </AnimatedList>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
