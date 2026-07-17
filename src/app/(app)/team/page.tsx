'use client'

import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { useStore } from '@/store/useStore'
import { ShieldCheckIcon, Squares2X2Icon, UserGroupIcon } from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const loadClientMembersModal = () => import('@/components/clients/client-members-modal')
const ClientMembersModal = dynamic(() => loadClientMembersModal().then((module) => module.ClientMembersModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando equipo" />,
})

export default function TeamPage() {
  const currentClient = useStore((state) => state.currentClient)
  const [open, setOpen] = useState(false)

  if (!currentClient) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <EmptyState
          icon={UserGroupIcon}
          title="Selecciona una organización"
          description="Elige el workspace donde quieres administrar el equipo."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        eyebrow="Acceso de organización"
        title={<>Equipo de {currentClient.name}</>}
        description="Administra miembros, roles y los productos a los que puede entrar cada persona."
        icon={UserGroupIcon}
        actions={
          <Button
            color="indigo"
            onPointerEnter={() => void loadClientMembersModal()}
            onFocus={() => void loadClientMembersModal()}
            onClick={() => setOpen(true)}
          >
            <UserGroupIcon className="size-4" />
            Administrar equipo
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="premium-surface rounded-2xl p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
            <ShieldCheckIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-ink">Roles por responsabilidad</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Owner y Admin gestionan el equipo; operación, check-in y analítica reciben sólo las acciones necesarias.
          </p>
        </div>
        <div className="premium-surface rounded-2xl p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
            <Squares2X2Icon className="size-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-ink">Acceso independiente por producto</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Una misma identidad puede entrar a EventiApp, ITBEM o Cafetton sin compartir datos ni permisos entre
            portales.
          </p>
        </div>
      </section>

      <ClientMembersModal
        isOpen={open}
        onClose={() => setOpen(false)}
        clientId={currentClient.id}
        clientName={currentClient.name}
      />
    </div>
  )
}
