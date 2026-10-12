'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Pagination } from '@/components/ui/pagination'
import {
  eventClientAssignmentDelta,
  eventClientDisplayName,
  eventClientErrorMessage,
  eventClientRejectedEventIds,
  formatGrantedDate,
  isEventClientAccessDisabled,
  type EventClient,
  type EventClientCandidate,
} from '@/features/events/event-clients'
import {
  createEventClient,
  EVENT_CLIENT_ASSIGNMENTS_PAGE_SIZE,
  refreshEventClientCaches,
  resendEventClientInvitation,
  revokeEventClient,
  updateEventClientAssignments,
  useEventClientAssignments,
  useEventClientCandidates,
  useEventClients,
} from '@/features/events/use-event-clients'
import { useDebounce } from '@/hooks/useDebounce'
import { ArrowLeftIcon } from '@heroicons/react/16/solid'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

const INTRO =
  'Los clientes ven solo los eventos que les asignes. Pueden editar el diseño, invitados, mesas, check-in y momentos, pero no crear ni eliminar eventos, subir fuentes ni invitar a otras personas.'

const inputClass =
  'block min-h-11 w-full rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none dark:border-white/10 dark:bg-canvas dark:text-white'

type AddTab = 'existing' | 'new'

interface EventClientsModalProps {
  eventId: string
  isOpen: boolean
  onClose: () => void
}

export function EventClientsModal({ eventId, isOpen, onClose }: EventClientsModalProps) {
  const [managing, setManaging] = useState<EventClient | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<EventClient | null>(null)
  const [busy, setBusy] = useState(false)
  const { clients, error, isLoading, mutate } = useEventClients(eventId, isOpen)
  const disabled = isEventClientAccessDisabled(error)

  const close = () => {
    setManaging(null)
    setConfirmRevoke(null)
    onClose()
  }

  const revoke = async (client: EventClient) => {
    if (busy) return
    setBusy(true)
    try {
      await revokeEventClient(eventId, client.user_id)
      toast.success(`${eventClientDisplayName(client)} ya no tiene acceso a este evento.`)
      setConfirmRevoke(null)
      await Promise.all([mutate(), refreshEventClientCaches(eventId)])
    } catch (requestError) {
      toast.error(eventClientErrorMessage(requestError, 'No se pudo quitar el acceso.'))
    } finally {
      setBusy(false)
    }
  }

  const resend = async (client: EventClient) => {
    if (busy) return
    setBusy(true)
    try {
      await resendEventClientInvitation(eventId, client.user_id)
      toast.success(`Reenviamos la invitación a ${client.email}.`)
    } catch (requestError) {
      toast.error(eventClientErrorMessage(requestError, 'No se pudo reenviar la invitación.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={close} size="2xl">
      <DialogTitle>Clientes del evento</DialogTitle>
      <DialogDescription>{INTRO}</DialogDescription>
      <DialogBody className="space-y-6">
        {disabled ? (
          <p className="rounded-xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted dark:border-white/10">
            Esta función todavía no está disponible.
          </p>
        ) : managing ? (
          <EventClientAssignmentsPanel eventId={eventId} client={managing} onBack={() => setManaging(null)} />
        ) : (
          <>
            <section aria-labelledby="event-clients-with-access">
              <h3 id="event-clients-with-access" className="text-sm font-semibold text-ink dark:text-white">
                Con acceso
              </h3>
              {error && !disabled ? (
                <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-500/10 p-3">
                  <p className="text-sm text-red-700 dark:text-red-200">
                    {eventClientErrorMessage(error, 'No pudimos cargar los clientes.')}
                  </p>
                  <Button outline className="min-h-11" onClick={() => void mutate()}>
                    Reintentar
                  </Button>
                </div>
              ) : isLoading ? (
                <p className="mt-3 text-sm text-ink-muted">Cargando clientes…</p>
              ) : clients.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted dark:border-white/10">
                  Aún no hay clientes con acceso a este evento.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {clients.map((client) => (
                    <li
                      key={client.user_id}
                      className="flex flex-col gap-3 rounded-xl border border-border-subtle p-3 sm:flex-row sm:items-center dark:border-white/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink dark:text-white">
                          {eventClientDisplayName(client)}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{client.email}</p>
                        {client.granted_at && (
                          <p className="text-xs text-ink-muted">Desde {formatGrantedDate(client.granted_at)}</p>
                        )}
                      </div>
                      {confirmRevoke?.user_id === client.user_id ? (
                        <div role="alertdialog" aria-label="Confirmar quitar acceso" className="space-y-2 sm:max-w-xs">
                          <p className="text-xs text-ink-secondary">
                            ¿Quitar el acceso de {eventClientDisplayName(client)} a este evento? Seguirá viendo los
                            demás eventos que tenga asignados.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              color="red"
                              className="min-h-11"
                              onClick={() => void revoke(client)}
                              disabled={busy}
                            >
                              Quitar acceso
                            </Button>
                            <Button outline className="min-h-11" onClick={() => setConfirmRevoke(null)} disabled={busy}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button outline className="min-h-11" onClick={() => setManaging(client)}>
                            Gestionar eventos
                          </Button>
                          {client.invitation_pending !== false && (
                            <Button outline className="min-h-11" onClick={() => void resend(client)} disabled={busy}>
                              Reenviar invitación
                            </Button>
                          )}
                          <Button outline className="min-h-11" onClick={() => setConfirmRevoke(client)}>
                            Quitar acceso
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <AddEventClient eventId={eventId} onAdded={() => void mutate()} />
          </>
        )}
      </DialogBody>
      <DialogActions>
        <Button outline className="min-h-11" onClick={close}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function AddEventClient({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [tab, setTab] = useState<AddTab>('existing')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [selected, setSelected] = useState<EventClientCandidate | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const { candidates, isLoading } = useEventClientCandidates(eventId, debouncedSearch, tab === 'existing')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const body =
      tab === 'existing'
        ? selected
          ? { user_id: selected.user_id }
          : null
        : email.trim() && firstName.trim() && lastName.trim()
          ? { email: email.trim().toLowerCase(), first_name: firstName.trim(), last_name: lastName.trim() }
          : null
    if (!body) {
      setFormError(tab === 'existing' ? 'Elige a una persona de la lista.' : 'Completa correo, nombre y apellido.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const result = await createEventClient(eventId, body)
      const name = eventClientDisplayName(result.client)
      if (result.already_assigned) toast.info(`${name} ya tenía acceso a este evento.`)
      else if (result.account === 'created')
        toast.success(`Invitamos a ${result.client.email}. Recibirá un correo para crear su contraseña.`)
      else toast.success(`${name} podrá ver este evento al iniciar sesión.`)
      setSelected(null)
      setSearch('')
      setEmail('')
      setFirstName('')
      setLastName('')
      onAdded()
      await refreshEventClientCaches(eventId)
    } catch (requestError) {
      const message = eventClientErrorMessage(requestError, 'No se pudo asignar el cliente.')
      setFormError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="event-clients-add" className="rounded-2xl border border-border-subtle p-4 dark:border-white/10">
      <h3 id="event-clients-add" className="text-sm font-semibold text-ink dark:text-white">
        Agregar cliente
      </h3>
      <div role="tablist" aria-label="Tipo de cliente" className="mt-3 flex gap-2">
        {(
          [
            ['existing', 'Cliente existente'],
            ['new', 'Nuevo cliente'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value)
              setFormError('')
            }}
            className={[
              'min-h-11 flex-1 rounded-xl px-3 text-sm font-medium transition-colors',
              tab === value ? 'bg-indigo-600 text-white' : 'bg-surface-raised text-ink-secondary hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)} noValidate>
        {tab === 'existing' ? (
          <div>
            <label htmlFor="event-client-search" className="text-sm font-medium text-ink dark:text-white">
              Buscar cliente
            </label>
            <input
              id="event-client-search"
              type="search"
              role="combobox"
              aria-expanded={candidates.length > 0}
              aria-controls="event-client-candidates"
              autoComplete="off"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setSelected(null)
              }}
              placeholder="Nombre o correo"
              className={`${inputClass} mt-1`}
            />
            <ul id="event-client-candidates" role="listbox" aria-label="Clientes encontrados" className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {isLoading && candidates.length === 0 ? (
                <li className="px-2 py-2 text-xs text-ink-muted">Buscando…</li>
              ) : (
                candidates.map((candidate) => (
                  <li
                    key={candidate.user_id}
                    role="option"
                    aria-selected={selected?.user_id === candidate.user_id}
                    aria-disabled={candidate.assigned_to_event}
                    tabIndex={candidate.assigned_to_event ? -1 : 0}
                    onClick={() => !candidate.assigned_to_event && setSelected(candidate)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !candidate.assigned_to_event) {
                        event.preventDefault()
                        setSelected(candidate)
                      }
                    }}
                    className={[
                      'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm',
                      selected?.user_id === candidate.user_id
                        ? 'bg-indigo-500/15 ring-1 ring-indigo-500/40'
                        : 'hover:bg-surface-raised',
                      candidate.assigned_to_event ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink dark:text-white">
                        {eventClientDisplayName(candidate)}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">{candidate.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {candidate.assigned_to_event
                        ? 'Ya tiene acceso'
                        : `${candidate.assigned_events} evento${candidate.assigned_events === 1 ? '' : 's'} asignado${candidate.assigned_events === 1 ? '' : 's'}`}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">¿No aparece? Escribe su correo en Nuevo cliente.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="event-client-email" className="text-sm font-medium text-ink dark:text-white">
                Correo
              </label>
              <input
                id="event-client-email"
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="event-client-first-name" className="text-sm font-medium text-ink dark:text-white">
                Nombre
              </label>
              <input
                id="event-client-first-name"
                required
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="event-client-last-name" className="text-sm font-medium text-ink dark:text-white">
                Apellido
              </label>
              <input
                id="event-client-last-name"
                required
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>
        )}

        {formError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {formError}
          </p>
        )}

        <Button type="submit" color="indigo" className="min-h-11 w-full sm:w-auto" disabled={saving}>
          {saving ? 'Guardando…' : tab === 'existing' ? 'Asignar a este evento' : 'Invitar y asignar'}
        </Button>
      </form>
    </section>
  )
}

function EventClientAssignmentsPanel({
  eventId,
  client,
  onBack,
}: {
  eventId: string
  client: EventClient
  onBack: () => void
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [selection, setSelection] = useState<Map<string, boolean>>(new Map())
  const [original, setOriginal] = useState<Map<string, boolean>>(new Map())
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const { page: assignments, isLoading, error, mutate } = useEventClientAssignments(
    eventId,
    client.user_id,
    { page, search: debouncedSearch },
    true
  )
  const rows = useMemo(() => assignments?.data ?? [], [assignments])

  const isChecked = (eventIdValue: string, assigned: boolean) => selection.get(eventIdValue) ?? assigned
  const toggle = (eventIdValue: string, assigned: boolean) => {
    setOriginal((current) => (current.has(eventIdValue) ? current : new Map(current).set(eventIdValue, assigned)))
    setSelection((current) => new Map(current).set(eventIdValue, !isChecked(eventIdValue, assigned)))
  }
  const delta = eventClientAssignmentDelta(original, selection)
  const changes = delta.assign.length + delta.unassign.length

  const save = async () => {
    if (saving || changes === 0) return
    setSaving(true)
    setRejected(new Set())
    try {
      const result = await updateEventClientAssignments(eventId, client.user_id, delta)
      toast.success(
        `${eventClientDisplayName(client)} tiene ${result.assigned_events} evento${result.assigned_events === 1 ? '' : 's'} asignado${result.assigned_events === 1 ? '' : 's'}.`
      )
      setSelection(new Map())
      setOriginal(new Map())
      await Promise.all([mutate(), refreshEventClientCaches(eventId, [...delta.assign, ...delta.unassign])])
    } catch (requestError) {
      setRejected(new Set(eventClientRejectedEventIds(requestError)))
      toast.error(eventClientErrorMessage(requestError, 'No se pudieron guardar los cambios.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="event-client-assignments" className="space-y-4">
      <div className="flex items-center gap-3">
        <Button plain className="min-h-11" onClick={onBack} aria-label="Volver a clientes del evento">
          <ArrowLeftIcon />
          Volver
        </Button>
        <h3 id="event-client-assignments" className="min-w-0 truncate text-sm font-semibold text-ink dark:text-white">
          Eventos de {eventClientDisplayName(client)}
        </h3>
      </div>
      <div>
        <label htmlFor="event-client-assignment-search" className="sr-only">
          Buscar evento
        </label>
        <input
          id="event-client-assignment-search"
          type="search"
          placeholder="Buscar evento"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          className={inputClass}
        />
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-500/10 p-3">
          <p className="text-sm text-red-700 dark:text-red-200">
            {eventClientErrorMessage(error, 'No pudimos cargar los eventos.')}
          </p>
          <Button outline className="min-h-11" onClick={() => void mutate()}>
            Reintentar
          </Button>
        </div>
      ) : isLoading && rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Cargando eventos…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay eventos que coincidan.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const inputId = `event-client-assignment-${row.event_id}`
            const highlighted = rejected.has(row.event_id)
            return (
              <li
                key={row.event_id}
                className={[
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2',
                  highlighted ? 'bg-red-500/10 ring-1 ring-red-500/40' : '',
                ].join(' ')}
                title={row.can_manage ? undefined : 'No puedes gestionar clientes en este evento'}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={isChecked(row.event_id, row.assigned)}
                  disabled={!row.can_manage || saving}
                  aria-invalid={highlighted || undefined}
                  aria-describedby={row.can_manage ? undefined : `${inputId}-hint`}
                  onChange={() => toggle(row.event_id, row.assigned)}
                />
                <label htmlFor={inputId} className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium text-ink dark:text-white">{row.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {formatGrantedDate(row.event_date_time)}
                    {row.is_active ? '' : ' · Inactivo'}
                  </span>
                  {!row.can_manage && (
                    <span id={`${inputId}-hint`} className="block text-xs text-ink-muted">
                      No puedes gestionar clientes en este evento
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {(assignments?.total ?? 0) > EVENT_CLIENT_ASSIGNMENTS_PAGE_SIZE && (
        <Pagination
          total={assignments?.total ?? 0}
          page={page}
          pageSize={EVENT_CLIENT_ASSIGNMENTS_PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button color="indigo" className="min-h-11" onClick={() => void save()} disabled={saving || changes === 0}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {changes > 0 && (
          <span className="text-xs text-ink-muted">
            {changes} cambio{changes === 1 ? '' : 's'} sin guardar
          </span>
        )}
      </div>
    </section>
  )
}
