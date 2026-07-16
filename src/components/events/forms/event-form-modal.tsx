'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import useSWR, { mutate } from 'swr'
import * as z from 'zod'

import { Button } from '@/components/button'
import { Combobox, ComboboxLabel, ComboboxOption } from '@/components/combobox'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { useDebounce } from '@/hooks/useDebounce'
import { eventTypeLabel } from '@/lib/event-type-label'

import { createAccessProfile } from '@/lib/access-profile'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { clientsPagePath, eventPath, eventsPath, eventTypesPath } from '@/lib/api-paths'
import { toRFC3339 } from '@/lib/date-time'
import {
  isEventCacheKey,
  isEventCollectionCacheKey,
  isEventOverviewCacheKey,
  patchEventCacheValue,
} from '@/lib/event-cache'
import { emptyEventFormValues, eventFormValuesFromEvent, type EventFormValues } from '@/lib/event-form-values'
import { normalizeEventMutationPayload } from '@/lib/event-payload'
import { fetcher } from '@/lib/fetcher'
import { beginNavigationProgress } from '@/lib/navigation-progress'
import { trackProductEvent } from '@/lib/product-analytics'
import { getEventPublicUrlPrefix } from '@/lib/public-urls'
import { normalizeOptionalUuid } from '@/lib/uuid'
import type { Client, ClientsPageResponse } from '@/models/Client'
import type { Event } from '@/models/Event'
import type { EventType } from '@/models/EventType'
import { useStore } from '@/store/useStore'
import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { toast } from 'sonner'

// Zonas horarias relevantes
const TIMEZONES = [
  { value: 'America/Mexico_City', label: 'México (CDMX / Centro)' },
  { value: 'America/Monterrey', label: 'México (Monterrey / Norte)' },
  { value: 'America/Cancun', label: 'México (Cancún / Este)' },
  { value: 'America/Tijuana', label: 'México (Tijuana / Pacífico)' },
  { value: 'America/New_York', label: 'EE.UU. (Este)' },
  { value: 'America/Chicago', label: 'EE.UU. (Centro)' },
  { value: 'America/Denver', label: 'EE.UU. (Montaña)' },
  { value: 'America/Los_Angeles', label: 'EE.UU. (Pacífico)' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Lima', label: 'Perú' },
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
]

// Idiomas disponibles (alineados con el campo `language` del backend)
const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

const schema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  identifier: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones')
    .min(3, 'Mínimo 3 caracteres')
    .optional(),
  description: z.string().optional(),
  client_id: z.string().optional(),
  event_type_id: z.string().optional(),
  event_date_time: z.string().min(1, 'La fecha es requerida'),
  timezone: z.string().min(1, 'Selecciona una zona horaria'),
  language: z.string().optional(),
  address: z.string().optional(),
  second_address: z.string().optional(),
  music_url: z.string().url('URL inválida').optional().or(z.literal('')),
  organizer_name: z.string().optional(),
  organizer_email: z.string().email('Correo inválido').optional().or(z.literal('')),
  organizer_phone: z.string().optional(),
  max_guests: z.union([z.number().min(1, 'Mínimo 1 invitado'), z.nan().transform(() => null), z.null()]),
  is_active: z.boolean(),
})

type FormValues = EventFormValues

interface Props {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  event?: Event | null
  onSaved?: (event: Event) => Promise<void> | void
}

export function EventFormModal({ isOpen, setIsOpen, event, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const debouncedClientSearch = useDebounce(clientSearch, 200)
  const router = useRouter()
  const isEdit = Boolean(event?.id)

  const currentClient = useStore((s) => s.currentClient)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const eventPublicUrlPrefix = getEventPublicUrlPrefix()
  const isRoot = Boolean(user?.is_root)
  const accessProfile = createAccessProfile(applicationSession, workspaceMode, currentClient?.id)
  const canChooseOrganization = isRoot && accessProfile.isPlatformContext

  // Root users search a bounded organization page instead of downloading the full catalog.
  const { data: clientsResponse } = useSWR<ClientsPageResponse>(
    isOpen && canChooseOrganization ? clientsPagePath({ page: 1, page_size: 25, search: debouncedClientSearch }) : null,
    fetcher,
    { shouldRetryOnError: false, keepPreviousData: true }
  )
  const clientPage = readApiData<ClientsPageResponse | undefined>(clientsResponse)
  const clientOptions = clientPage?.data ?? []

  // GET /api/event-types. If the catalog fails to load, the Select stays empty
  // and the form still degrades gracefully.
  const { data: eventTypes = [] } = useSWR<EventType[]>(isOpen ? eventTypesPath() : null, fetcher, {
    shouldRetryOnError: false,
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyEventFormValues(currentClient?.id ?? ''),
  })

  useEffect(() => {
    if (!isOpen) return

    setAdvancedOpen(false)

    if (isEdit && event) {
      reset(eventFormValuesFromEvent(event, currentClient?.id ?? ''))
    } else {
      reset(emptyEventFormValues(currentClient?.id ?? ''))
    }
  }, [isOpen, isEdit, event, currentClient?.id, reset])

  const hasAdvancedErrors = Boolean(errors.music_url || errors.organizer_email || errors.max_guests)

  useEffect(() => {
    if (hasAdvancedErrors) setAdvancedOpen(true)
  }, [hasAdvancedErrors])

  const onSubmit = async (data: FormValues) => {
    setLoading(true)

    if (!isEdit && !normalizeOptionalUuid(data.client_id)) {
      toast.error('Selecciona una organizacion para crear el evento')
      setLoading(false)
      return
    }

    // datetime-local gives "YYYY-MM-DDTHH:mm" — Go needs full RFC3339: "2026-02-27T16:03:00-06:00"
    const payload = normalizeEventMutationPayload({
      ...data,
      event_date_time: toRFC3339(data.event_date_time, data.timezone ?? 'America/Mexico_City'),
    })

    try {
      if (isEdit && event) {
        const res = await api.put(eventPath(event.id), payload)
        const updated = readApiData<Event>(res.data)
        const cacheEvent = updated ?? ({ ...event, ...payload } as Event)
        await mutate(
          (key) => isEventCacheKey(key, event.id),
          (current: unknown) => patchEventCacheValue(current, event.id, cacheEvent),
          { revalidate: false }
        )
        if (!updated) void mutate((key) => isEventCacheKey(key, event.id))
        void mutate(isEventOverviewCacheKey)
        await onSaved?.(cacheEvent)
      } else {
        const res = await api.post(eventsPath(), payload)
        const created = readApiData<Event>(res.data)
        if (created?.id) {
          trackProductEvent('event_created', {
            has_capacity: typeof payload.max_guests === 'number' && payload.max_guests > 0,
            has_organizer: Boolean(payload.organizer_name),
          })
          // Navigate to the newly created event
          beginNavigationProgress()
          router.push(`/events/${created.id}`)
        }
        void mutate(isEventCollectionCacheKey)
      }

      setIsOpen(false)
      toast.success(isEdit ? 'Evento actualizado' : 'Evento creado')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al guardar el evento'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => !loading && setIsOpen(false)}>
      <DialogTitle>{isEdit ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>

      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-5 py-4">
          {/* Nombre */}
          <Field>
            <Label>Nombre del evento</Label>
            <Input {...register('name')} placeholder="Ej. Boda García & López" />
            {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
          </Field>

          {/* Slug / URL del evento — solo en modo edición */}
          {isEdit && (
            <Field>
              <Label>URL del evento (slug)</Label>
              <Description className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                Cambiar esto romperá los códigos QR y enlaces ya distribuidos.
              </Description>
              <div className="mt-1 flex items-center gap-2">
                <span className="shrink-0 text-sm text-zinc-400 select-none">{eventPublicUrlPrefix}</span>
                <Input {...register('identifier')} placeholder="mi-evento" className="font-mono text-sm" />
              </div>
              {errors.identifier && <ErrorMessage>{errors.identifier.message}</ErrorMessage>}
            </Field>
          )}

          {/* Descripción */}
          <Field>
            <Label>Descripción</Label>
            <Description>Opcional — aparecerá en la página pública del evento.</Description>
            <Textarea
              {...register('description')}
              rows={3}
              placeholder="Cuenta brevemente qué hace especial este evento"
            />
          </Field>

          {/* Platform roots can target any organization; organization mode is locked. */}
          {(canChooseOrganization || !currentClient) && (
            <Field>
              <Label>Organización</Label>
              {canChooseOrganization ? (
                <Controller
                  control={control}
                  name="client_id"
                  render={({ field }) => {
                    const fallbackClient = event?.client ?? currentClient
                    const selectedClient =
                      clientOptions.find((client) => client.id === field.value) ??
                      (fallbackClient?.id === field.value ? (fallbackClient as Client) : null)

                    return (
                      <Combobox
                        value={selectedClient}
                        onChange={(client) => field.onChange(client?.id ?? '')}
                        options={clientOptions}
                        displayValue={(client) => client?.name}
                        aria-label="Organización"
                        placeholder={isEdit ? 'Sin organización' : 'Buscar organización…'}
                        remoteFiltering
                        onQueryChange={setClientSearch}
                      >
                        {(client) => (
                          <ComboboxOption value={client}>
                            <ComboboxLabel>{client.name}</ComboboxLabel>
                          </ComboboxOption>
                        )}
                      </Combobox>
                    )
                  }}
                />
              ) : (
                <Select {...register('client_id')}>
                  <option value="">{isEdit ? 'Sin organización' : 'Selecciona una organización'}</option>
                  {currentClient && <option value={currentClient.id}>{currentClient.name}</option>}
                </Select>
              )}
            </Field>
          )}

          {/* Tipo de evento */}
          <Field>
            <Label>Tipo de evento</Label>
            <Select {...register('event_type_id')} disabled={eventTypes.length === 0}>
              <option value="">{eventTypes.length === 0 ? 'Cargando tipos…' : 'Selecciona un tipo...'}</option>
              {eventTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {eventTypeLabel(et.name)}
                </option>
              ))}
            </Select>
          </Field>

          {/* Fecha + Timezone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" {...register('event_date_time')} />
              {errors.event_date_time && <ErrorMessage>{errors.event_date_time.message}</ErrorMessage>}
            </Field>

            <Field>
              <Label>Zona horaria</Label>
              <Select {...register('timezone')}>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <details
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            className="group overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
              <span>
                <span className="flex items-center gap-2">
                  Detalles adicionales
                  {hasAdvancedErrors && (
                    <span className="rounded-full bg-red-400/12 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                      Revisa estos campos
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                  Ubicaciones, contacto, música, capacidad y publicación
                </span>
              </span>
              <ChevronDownIcon className="size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-5 border-t border-white/7 px-4 py-5">
              {/* Idioma */}
              <Field>
                <Label>Idioma del evento</Label>
                <Select {...register('language')}>
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Dirección */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <Label>Dirección principal</Label>
                  <Description>Lugar de la ceremonia o evento.</Description>
                  <Input {...register('address')} placeholder="Calle, colonia, ciudad" />
                </Field>
                <Field>
                  <Label>Dirección secundaria</Label>
                  <Description>Lugar de recepción o fiesta (opcional).</Description>
                  <Input {...register('second_address')} placeholder="Ej. Salón de Fiestas El Encanto" />
                </Field>
              </div>

              {/* Música de fondo */}
              <Field>
                <Label>URL de música de fondo</Label>
                <Description>
                  URL de un archivo de audio (MP3, WAV) que se reproducirá en la página pública del evento. Usa S3,
                  Cloudinary u otro CDN.
                </Description>
                <Input {...register('music_url')} type="url" placeholder="https://cdn.example.com/cancion.mp3" />
                {errors.music_url && <ErrorMessage>{errors.music_url.message}</ErrorMessage>}
              </Field>

              {/* Organizador */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field>
                  <Label>Nombre del organizador</Label>
                  <Input {...register('organizer_name')} placeholder="Ej. Juan García" />
                </Field>
                <Field>
                  <Label>Correo del organizador</Label>
                  <Input {...register('organizer_email')} type="email" placeholder="correo@ejemplo.com" />
                  {errors.organizer_email && <ErrorMessage>{errors.organizer_email.message}</ErrorMessage>}
                </Field>
                <Field>
                  <Label>Teléfono del organizador</Label>
                  <Input {...register('organizer_phone')} placeholder="+52 55 1234 5678" />
                </Field>
              </div>

              {/* Máx. invitados */}
              <Field>
                <Label>Máximo de invitados</Label>
                <Input type="number" min={1} {...register('max_guests', { valueAsNumber: true })} />
                {errors.max_guests && <ErrorMessage>{errors.max_guests.message}</ErrorMessage>}
              </Field>

              {/* is_active */}
              <Field>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Estado</Label>
                    <Description>
                      Mantiene el evento disponible para la operación interna. La visibilidad para invitados se publica
                      desde Configuración o Studio.
                    </Description>
                  </div>
                  <Controller
                    control={control}
                    name="is_active"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onChange={field.onChange}
                        aria-label="Mantener el evento activo para la operación interna"
                      />
                    )}
                  />
                </div>
              </Field>
            </div>
          </details>
        </DialogBody>

        <DialogActions>
          <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading} data-testid="submit-event-form">
            {loading ? (isEdit ? 'Actualizando…' : 'Creando…') : isEdit ? 'Actualizar evento' : 'Crear evento'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
