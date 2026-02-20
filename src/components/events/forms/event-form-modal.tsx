'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { mutate } from 'swr'
import useSWR from 'swr'

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
    event_type_id:     z.string().optional(),
    event_date_time:   z.string().min(1, 'La fecha es requerida'),
    timezone:          z.string().min(1, 'Selecciona una zona horaria'),
    language:          z.string().optional(),
    address:           z.string().optional(),
    organizer_name:    z.string().optional(),
    organizer_email:   z.string().email('Correo inválido').optional().or(z.literal('')),
    organizer_phone:   z.string().optional(),
    max_guests:        z.number().min(1, 'Mínimo 1 invitado').nullable(),
    is_active:         z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface Props {
    isOpen: boolean
    setIsOpen: (v: boolean) => void
    event?: Event | null
}

export function EventFormModal({ isOpen, setIsOpen, event }: Props) {
    const [loading, setLoading] = useState(false)
    const isEdit = Boolean(event?.id)

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
                event_type_id:   event.event_type_id,
                event_date_time: localDT,
                timezone:        event.timezone ?? 'America/Mexico_City',
                language:        event.language ?? 'es',
                address:         event.address ?? '',
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

        try {
            if (isEdit && event) {
                await api.put(`/events/${event.id}`, data)
                // Invalidar cache del evento editado y la lista general
                await mutate(`/events/${event.id}`)
            } else {
                await api.post('/events', data)
            }

            // Invalidar la lista global (Redis key "all:events")
            await mutate('/events/cache/all')
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

                    {/* Tipo de evento */}
                    <Field>
                        <Label>Tipo de evento</Label>
                        <Select {...register('event_type_id')} disabled={eventTypes.length === 0}>
                            <option value="">
                                {eventTypes.length === 0 ? 'Cargando tipos…' : 'Selecciona un tipo...'}
                            </option>
                            {eventTypes.map((et) => (
                                <option key={et.id} value={et.id}>
                                    {et.name}
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
                    <Field>
                        <Label>Dirección</Label>
                        <Input {...register('address')} placeholder="Calle, colonia, ciudad" />
                    </Field>

                    {/* Organizador */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
