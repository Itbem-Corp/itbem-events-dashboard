'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { mutate } from 'swr'
import useSWR from 'swr'

import { eventTypeLabel } from '@/lib/event-type-label'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage, Description } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Button } from '@/components/button'
import { Switch } from '@/components/switch'

import { api } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'
import type { EventType } from '@/models/EventType'
import { useStore } from '@/store/useStore'

// Zonas horarias relevantes
const TIMEZONES = [
    { value: 'America/Mexico_City', label: 'México (CDMX / Centro)' },
    { value: 'America/Monterrey',   label: 'México (Monterrey / Norte)' },
    { value: 'America/Cancun',      label: 'México (Cancún / Este)' },
    { value: 'America/Tijuana',     label: 'México (Tijuana / Pacífico)' },
    { value: 'America/New_York',    label: 'EE.UU. (Este)' },
    { value: 'America/Chicago',     label: 'EE.UU. (Centro)' },
    { value: 'America/Denver',      label: 'EE.UU. (Montaña)' },
    { value: 'America/Los_Angeles', label: 'EE.UU. (Pacífico)' },
    { value: 'America/Bogota',      label: 'Colombia' },
    { value: 'America/Lima',        label: 'Perú' },
    { value: 'America/Santiago',    label: 'Chile' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
]

// Idiomas disponibles (alineados con el campo `language` del backend)
const LANGUAGES = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
]

const schema = z.object({
    name:              z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
    description:       z.string().optional(),
    client_id:         z.string().optional(),
    event_type_id:     z.string().optional(),
    event_date_time:   z.string().min(1, 'La fecha es requerida'),
    timezone:          z.string().min(1, 'Selecciona una zona horaria'),
    language:          z.string().optional(),
    address:           z.string().optional(),
    second_address:    z.string().optional(),
    music_url:         z.string().url('URL inválida').optional().or(z.literal('')),
    organizer_name:    z.string().optional(),
    organizer_email:   z.string().email('Correo inválido').optional().or(z.literal('')),
    organizer_phone:   z.string().optional(),
    max_guests:        z.number().min(1, 'Mínimo 1 invitado').nullable(),
    is_active:         z.boolean(),
})

type FormValues = z.infer<typeof schema>

// Converts "2026-02-27T16:03" + "America/Mexico_City" → "2026-02-27T16:03:00-06:00"
function toRFC3339(localDT: string, tz: string): string {
    if (!localDT) return localDT
    const withSeconds = localDT.length === 16 ? localDT + ':00' : localDT
    // Parse as UTC just to have a Date instance near the target date (for DST lookup)
    const approxDate = new Date(withSeconds + 'Z')
    const s = approxDate.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    // s looks like: "2/27/2026, 4:03:00 PM GMT-6"
    const match = s.match(/GMT([+-]\d+(?::\d+)?)$/)
    if (!match) return withSeconds + 'Z'
    const raw = match[1] // e.g. "-6" or "+5:30"
    const negative = raw.startsWith('-')
    const parts = raw.replace(/[+-]/, '').split(':')
    const hh = parts[0].padStart(2, '0')
    const mm = (parts[1] ?? '00').padStart(2, '0')
    return `${withSeconds}${negative ? '-' : '+'}${hh}:${mm}`
}

interface Props {
    isOpen: boolean
    setIsOpen: (v: boolean) => void
    event?: Event | null
}

export function EventFormModal({ isOpen, setIsOpen, event }: Props) {
    const [loading, setLoading] = useState(false)
    const isEdit = Boolean(event?.id)

    const currentClient = useStore((s) => s.currentClient)
    const user = useStore((s) => s.user)
    const isRoot = Boolean(user?.is_root)

    // For root users: fetch all clients to allow selecting which client to assign
    const { data: allClients = [] } = useSWR<Array<{ id: string; name: string }>>(
        isOpen && isRoot ? '/clients' : null,
        fetcher,
        { shouldRetryOnError: false }
    )

    // GET /api/event-types — endpoint pendiente en el backend.
    // Cuando exista, este useSWR lo carga automáticamente.
    // Si no existe aún, devuelve [] y el Select queda vacío (error manejado gracefully).
    const { data: eventTypes = [] } = useSWR<EventType[]>(
        isOpen ? '/event-types' : null,
        fetcher,
        { shouldRetryOnError: false }
    )

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name:            '',
            description:     '',
            client_id:       currentClient?.id ?? '',
            event_type_id:   '',
            event_date_time: '',
            timezone:        'America/Mexico_City',
            language:        'es',
            address:         '',
            second_address:  '',
            music_url:       '',
            organizer_name:  '',
            organizer_email: '',
            organizer_phone: '',
            max_guests:      100,
            is_active:       true,
        },
    })

    useEffect(() => {
        if (!isOpen) return

        if (isEdit && event) {
            // Recortar ISO a "YYYY-MM-DDTHH:mm" para datetime-local
            const localDT = event.event_date_time
                ? event.event_date_time.substring(0, 16)
                : ''

            reset({
                name:            event.name,
                description:     event.description ?? '',
                client_id:       event.client_id ?? currentClient?.id ?? '',
                event_type_id:   event.event_type_id,
                event_date_time: localDT,
                timezone:        event.timezone ?? 'America/Mexico_City',
                language:        event.language ?? 'es',
                address:         event.address ?? '',
                second_address:  event.second_address ?? '',
                music_url:       event.music_url ?? '',
                organizer_name:  event.organizer_name ?? '',
                organizer_email: event.organizer_email ?? '',
                organizer_phone: event.organizer_phone ?? '',
                max_guests:      event.max_guests ?? 100,
                is_active:       event.is_active,
            })
        } else {
            reset({
                name:            '',
                description:     '',
                client_id:       currentClient?.id ?? '',
                event_type_id:   '',
                event_date_time: '',
                timezone:        'America/Mexico_City',
                language:        'es',
                address:         '',
                organizer_name:  '',
                organizer_email: '',
                organizer_phone: '',
                max_guests:      100,
                is_active:       true,
            })
        }
    }, [isOpen, isEdit, event, reset])

    const onSubmit = async (data: FormValues) => {
        setLoading(true)

        // datetime-local gives "YYYY-MM-DDTHH:mm" — Go needs full RFC3339: "2026-02-27T16:03:00-06:00"
        const payload = {
            ...data,
            event_date_time: toRFC3339(data.event_date_time, data.timezone ?? 'America/Mexico_City'),
        }

        try {
            if (isEdit && event) {
                await api.put(`/events/${event.id}`, payload)
                // Invalidar cache del evento editado y la lista general
                await mutate(`/events/${event.id}`)
            } else {
                const res = await api.post('/events', payload)
                const created = res.data?.data ?? res.data
                if (created?.id) {
                    // Navigate to the newly created event
                    window.location.href = `/events/${created.id}`
                }
            }

            // Invalidar la lista de eventos (scoped + legacy)
            await mutate('/events/all')
            await mutate((key: string) => typeof key === 'string' && key.startsWith('/events'), undefined, { revalidate: true })
            setIsOpen(false)
            toast.success(isEdit ? 'Evento actualizado' : 'Evento creado')
        } catch {
            toast.error('Error al guardar el evento')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onClose={setIsOpen}>
            <DialogTitle>{isEdit ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>

            <form onSubmit={handleSubmit(onSubmit)}>
                <DialogBody className="space-y-5 py-4">
                    {/* Nombre */}
                    <Field>
                        <Label>Nombre del evento</Label>
                        <Input {...register('name')} placeholder="Ej. Boda García & López" />
                        {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
                    </Field>

                    {/* Descripción */}
                    <Field>
                        <Label>Descripción</Label>
                        <Description>Opcional — aparecerá en la página pública del evento.</Description>
                        <Input {...register('description')} placeholder="Breve descripción del evento" />
                    </Field>

                    {/* Cliente (visible para root o cuando no hay currentClient) */}
                    {(isRoot || !currentClient) && (
                        <Field>
                            <Label>Organización</Label>
                            <Select {...register('client_id')}>
                                <option value="">Sin asignar</option>
                                {(isRoot ? allClients : []).map((cl) => (
                                    <option key={cl.id} value={cl.id}>
                                        {cl.name}
                                    </option>
                                ))}
                                {!isRoot && currentClient && (
                                    <option value={currentClient.id}>{currentClient.name}</option>
                                )}
                            </Select>
                        </Field>
                    )}

                    {/* Tipo de evento */}
                    <Field>
                        <Label>Tipo de evento</Label>
                        <Select {...register('event_type_id')} disabled={eventTypes.length === 0}>
                            <option value="">
                                {eventTypes.length === 0 ? 'Cargando tipos…' : 'Selecciona un tipo...'}
                            </option>
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
                            URL de un archivo de audio (MP3, WAV) que se reproducirá en la página pública del evento.
                            Usa S3, Cloudinary u otro CDN.
                        </Description>
                        <Input
                            {...register('music_url')}
                            type="url"
                            placeholder="https://cdn.example.com/cancion.mp3"
                        />
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
                        <Input
                            type="number"
                            min={1}
                            {...register('max_guests', { valueAsNumber: true })}
                        />
                        {errors.max_guests && <ErrorMessage>{errors.max_guests.message}</ErrorMessage>}
                    </Field>

                    {/* is_active */}
                    <Field>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Estado</Label>
                                <Description>Los eventos activos son visibles para los invitados.</Description>
                            </div>
                            <Controller
                                control={control}
                                name="is_active"
                                render={({ field }) => (
                                    <Switch checked={field.value} onChange={field.onChange} />
                                )}
                            />
                        </div>
                    </Field>
                </DialogBody>

                <DialogActions>
                    <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={loading} data-testid="submit-event-form">
                        {loading
                            ? isEdit ? 'Actualizando…' : 'Creando…'
                            : isEdit ? 'Actualizar evento' : 'Crear evento'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    )
}
