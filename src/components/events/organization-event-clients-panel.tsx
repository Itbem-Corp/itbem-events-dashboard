'use client'

import { Button } from '@/components/button'
import { Pagination } from '@/components/ui/pagination'
import {
  eventClientDisplayName,
  eventClientErrorMessage,
  formatGrantedDate,
  isEventClientAccessDisabled,
  type EventClientPerson,
} from '@/features/events/event-clients'
import {
  ORGANIZATION_EVENT_CLIENTS_PAGE_SIZE,
  revokeOrganizationEventClient,
  useOrganizationEventClients,
} from '@/features/events/use-event-clients'
import { UserIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { toast } from 'sonner'

interface OrganizationEventClientsPanelProps {
  organizationId: string
  organizationName: string
}

/**
 * Owner/Admin oversight on /team: every event client of the organization
 * (GET /clients/:id/members/event-clients) and 'Quitar todos sus accesos'.
 * The parent mounts it only for products with events and members:manage.
 * With EVENT_CLIENT_ACCESS off the API answers 404 and nothing renders.
 */
export function OrganizationEventClientsPanel({ organizationId, organizationName }: OrganizationEventClientsPanelProps) {
  const [page, setPage] = useState(1)
  const [confirming, setConfirming] = useState<EventClientPerson | null>(null)
  const [revoking, setRevoking] = useState(false)
  const { grants, error, isLoading, mutate } = useOrganizationEventClients(organizationId, page, true)

  if (isEventClientAccessDisabled(error)) return null

  const rows = grants?.data ?? []

  const revokeAll = async (client: EventClientPerson) => {
    if (revoking) return
    setRevoking(true)
    try {
      const revoked = await revokeOrganizationEventClient(organizationId, client.user_id)
      toast.success(
        `${eventClientDisplayName(client)} ya no tiene acceso a ${revoked} evento${revoked === 1 ? '' : 's'} de ${organizationName}.`
      )
      setConfirming(null)
      await mutate()
    } catch (requestError) {
      toast.error(eventClientErrorMessage(requestError, 'No se pudieron quitar los accesos.'))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <section aria-labelledby="organization-event-clients" className="premium-surface rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
          <UserIcon className="size-5" />
        </span>
        <div>
          <h2 id="organization-event-clients" className="text-sm font-semibold text-ink">
            Clientes de eventos
          </h2>
          <p className="text-sm text-ink-muted">Personas fuera del equipo que ven solo los eventos que se les asignan.</p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-500/10 p-3">
          <p className="text-sm text-red-700 dark:text-red-200">
            {eventClientErrorMessage(error, 'No pudimos cargar los clientes de eventos.')}
          </p>
          <Button outline className="min-h-11" onClick={() => void mutate()}>
            Reintentar
          </Button>
        </div>
      ) : isLoading && rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Cargando clientes…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">
          Nadie tiene acceso como cliente en esta organización.
        </p>
      ) : (
        <div className="mt-4">
          <div
            aria-hidden="true"
            className="hidden gap-3 border-b border-border-subtle px-3 pb-2 text-xs font-semibold text-ink-muted md:grid md:grid-cols-[1.4fr_1.2fr_1fr_0.7fr_auto]"
          >
            <span>Cliente</span>
            <span>Evento</span>
            <span>Asignado por</span>
            <span>Desde</span>
            <span />
          </div>
          <ul className="divide-y divide-border-subtle">
            {rows.map((grant) => (
              <li
                key={grant.grant_id}
                className="grid gap-1 px-3 py-3 text-sm md:grid-cols-[1.4fr_1.2fr_1fr_0.7fr_auto] md:items-center md:gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{eventClientDisplayName(grant.client)}</span>
                  <span className="block truncate text-xs text-ink-muted">{grant.client.email}</span>
                </span>
                <span className="min-w-0 truncate text-ink-secondary">
                  <span className="text-xs text-ink-muted md:sr-only">Evento: </span>
                  {grant.event_name}
                </span>
                <span className="min-w-0 truncate text-ink-secondary">
                  <span className="text-xs text-ink-muted md:sr-only">Asignado por: </span>
                  {eventClientDisplayName(grant.granted_by)}
                </span>
                <span className="text-ink-secondary">
                  <span className="text-xs text-ink-muted md:sr-only">Desde: </span>
                  {formatGrantedDate(grant.granted_at)}
                </span>
                <span className="mt-2 md:mt-0">
                  {confirming?.user_id === grant.client.user_id ? (
                    <span role="alertdialog" aria-label="Confirmar quitar todos los accesos" className="block space-y-2">
                      <span className="block text-xs text-ink-secondary">
                        ¿Quitar a {eventClientDisplayName(grant.client)} de todos los eventos de {organizationName}?
                      </span>
                      <span className="flex gap-2">
                        <Button
                          color="red"
                          className="min-h-11"
                          onClick={() => void revokeAll(grant.client)}
                          disabled={revoking}
                        >
                          Quitar todos sus accesos
                        </Button>
                        <Button outline className="min-h-11" onClick={() => setConfirming(null)} disabled={revoking}>
                          Cancelar
                        </Button>
                      </span>
                    </span>
                  ) : (
                    <Button outline className="min-h-11 w-full md:w-auto" onClick={() => setConfirming(grant.client)}>
                      Quitar todos sus accesos
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {(grants?.total ?? 0) > ORGANIZATION_EVENT_CLIENTS_PAGE_SIZE && (
            <Pagination
              total={grants?.total ?? 0}
              page={page}
              pageSize={ORGANIZATION_EVENT_CLIENTS_PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </section>
  )
}
