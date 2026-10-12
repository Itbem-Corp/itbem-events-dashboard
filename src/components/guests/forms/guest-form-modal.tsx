'use client'

import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { guestPath, guestsPath } from '@/lib/api-paths'
import { getEffectiveStatus } from '@/lib/guest-utils'
import { PUBLIC_GUEST_ROLES, isHostGuestRole } from '@/lib/public-guest-roles'
import type { Guest } from '@/models/Guest'
import { toast } from 'sonner'

import {
  GUEST_PARTY_SIZE_MAX,
  GUEST_TEXT_LIMITS,
  type GuestTextField,
  readGuestWriteError,
  tooLongMessage,
} from './guest-write-errors'

// Same limits as the backend (models/GuestLimits.go), so most refusals never reach the server.
const text = (field: GuestTextField) =>
  z.string().max(GUEST_TEXT_LIMITS[field], tooLongMessage(GUEST_TEXT_LIMITS[field]))
const PROFILE_FIELDS = new Set(['nickname', 'image_url', 'headline', 'bio', 'signature'])

const schema = z
  .object({
    first_name: text('first_name').min(2, 'Mínimo 2 caracteres'),
    last_name: text('last_name').min(2, 'Mínimo 2 caracteres'),
    email: text('email').email('Correo inválido').optional().or(z.literal('')),
    phone: text('phone').optional(),
    // Party size is only edited for new guests and confirmed guests (GST-16); otherwise it is undefined.
    // The server accepts 0..100; a new or confirmed guest counts at least themselves.
    guests_count: z.number().min(1, 'Mínimo 1').max(GUEST_PARTY_SIZE_MAX, `Máximo ${GUEST_PARTY_SIZE_MAX}`).optional(),
    max_guests: z
      .number()
      .min(0, 'Mínimo 0')
      .max(GUEST_PARTY_SIZE_MAX, `Máximo ${GUEST_PARTY_SIZE_MAX}`)
      .optional()
      .nullable(),
    // Table assignment lives in the seating tab; the form only carries the real table link (GST-18).
    table_id: z.string().optional().nullable(),
    dietary_restrictions: text('dietary_restrictions').optional(),
    role: text('role').optional(),
    notes: text('notes').optional(),
    is_host: z.boolean().optional(),
    // Rich profile (used by GraduatesList / public page)
    nickname: text('nickname').optional(),
    order: z.number().int('Debe ser entero').min(0, 'Mínimo 0').max(9999, 'Máximo 9999').optional().nullable(),
    image_url: text('image_url').optional(),
    headline: text('headline').optional(),
    bio: text('bio').optional(),
    signature: text('signature').optional(),
  })
  .refine(
    // max_guests 0 means no cap on the server (party_size_exceeds_max_guests only applies above 0).
    (values) => values.guests_count == null || !values.max_guests || values.guests_count <= values.max_guests,
    {
      message: 'No puede superar el máximo',
      path: ['guests_count'],
    }
  )

type FormValues = z.infer<typeof schema>

interface Props {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  eventId: string
  guest?: Guest | null
  onPublicContentChanged?: () => void
  onSaved?: (guest: Guest | null) => Promise<void> | void
}

export function GuestFormModal({ isOpen, setIsOpen, eventId, guest, onPublicContentChanged, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [profileExpanded, setProfileExpanded] = useState(false)
  const autoCheckedHostRef = useRef(false)
  const isEdit = Boolean(guest?.id)
  const rsvpStatus = isEdit && guest ? getEffectiveStatus(guest) : null
  // New guests set their expected party; existing guests only once they confirmed (GST-16).
  const partySizeEditable = !isEdit || rsvpStatus === 'CONFIRMED'
  const assignedTableName = guest?.table?.name?.trim() || ''

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      guests_count: 1,
      max_guests: undefined,
      table_id: '',
      dietary_restrictions: '',
      role: '',
      notes: '',
      is_host: false,
      nickname: '',
      order: undefined,
      image_url: '',
      headline: '',
      bio: '',
      signature: '',
    },
  })

  useEffect(() => {
    if (!isOpen) return
    setProfileExpanded(false)
    autoCheckedHostRef.current = false
    if (isEdit && guest) {
      reset({
        first_name: guest.first_name,
        last_name: guest.last_name,
        email: guest.email ?? '',
        phone: guest.phone ?? '',
        guests_count: getEffectiveStatus(guest) === 'CONFIRMED' ? Math.max(guest.guests_count ?? 1, 1) : undefined,
        max_guests: guest.max_guests ?? undefined,
        table_id: guest.table_id ?? '',
        dietary_restrictions: guest.dietary_restrictions ?? '',
        role: guest.role ?? '',
        notes: guest.notes ?? '',
        is_host: guest.is_host ?? false,
        nickname: guest.nickname ?? '',
        order: guest.order ?? undefined,
        image_url: guest.image_url ?? '',
        headline: guest.headline ?? '',
        bio: guest.bio ?? '',
        signature: guest.signature ?? '',
      })
      // Auto-expand profile section if any profile data exists
      if (
        guest.nickname ||
        guest.image_url ||
        guest.headline ||
        guest.bio ||
        guest.signature ||
        (guest.order ?? 0) > 0
      ) {
        setProfileExpanded(true)
      }
    } else {
      reset({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        guests_count: 1,
        max_guests: undefined,
        table_id: '',
        dietary_restrictions: '',
        role: '',
        notes: '',
        is_host: false,
        nickname: '',
        order: undefined,
        image_url: '',
        headline: '',
        bio: '',
        signature: '',
      })
    }
  }, [isOpen, isEdit, guest, reset])

  const selectedRole = watch('role')

  useEffect(() => {
    if (isHostGuestRole(selectedRole)) {
      setValue('is_host', true, { shouldDirty: true })
      autoCheckedHostRef.current = true
      return
    }
    if (autoCheckedHostRef.current) {
      setValue('is_host', false, { shouldDirty: true })
      autoCheckedHostRef.current = false
    }
  }, [selectedRole, setValue])

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    try {
      // The backend parses table_id as a UUID and rejects "" with 400; null means "no table".
      const { guests_count: partySize, ...rest } = data
      const payload: Record<string, unknown> = { ...rest, table_id: data.table_id || null, event_id: eventId }
      // Sending guests_count overwrites the RSVP party size on the server: only send it when the
      // host set it (new guest) or changed it on a confirmed guest (GST-16).
      if (partySize != null && partySizeEditable && (!isEdit || dirtyFields.guests_count)) {
        payload.guests_count = partySize
      }
      let savedGuest: Guest | null = null
      if (isEdit && guest) {
        const res = await api.put(guestPath(guest.id), payload)
        savedGuest = readApiData<Guest | null>(res.data)
      } else {
        const res = await api.post(guestsPath(), payload)
        savedGuest = readApiData<Guest | null>(res.data)
      }
      await onSaved?.(savedGuest)
      onPublicContentChanged?.()
      setIsOpen(false)
      toast.success(isEdit ? 'Invitado actualizado' : 'Invitado agregado')
    } catch (err: unknown) {
      const writeError = readGuestWriteError(err)
      if (writeError?.field) {
        // Field-level Spanish error from the server (length, party size, table capacity).
        if (PROFILE_FIELDS.has(writeError.field)) setProfileExpanded(true)
        setError(writeError.field, { type: 'server', message: writeError.message }, { shouldFocus: true })
      }
      toast.error(writeError?.message ?? getApiErrorMessage(err, 'Error al guardar el invitado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={setIsOpen}>
      <DialogTitle>{isEdit ? 'Editar invitado' : 'Nuevo invitado'}</DialogTitle>

      {/* noValidate: the zod schema shows Spanish messages; the browser bubbles would use its own language (GST-4). */}
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4 py-4">
          {/* Nombre + Apellido */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>Nombre</Label>
              <Input {...register('first_name')} placeholder="Ana" autoFocus />
              {errors.first_name && <ErrorMessage>{errors.first_name.message}</ErrorMessage>}
            </Field>
            <Field>
              <Label>Apellido</Label>
              <Input {...register('last_name')} placeholder="García" />
              {errors.last_name && <ErrorMessage>{errors.last_name.message}</ErrorMessage>}
            </Field>
          </div>

          {/* Email + Teléfono */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>Correo electrónico</Label>
              <Input {...register('email')} type="email" placeholder="ana@ejemplo.com" />
              {errors.email && <ErrorMessage>{errors.email.message}</ErrorMessage>}
            </Field>
            <Field>
              <Label>Teléfono</Label>
              <Input {...register('phone')} placeholder="+52 55 0000 0000" />
              {errors.phone && <ErrorMessage>{errors.phone.message}</ErrorMessage>}
            </Field>
          </div>

          {/* Asistentes + Máximo + Mesa */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {partySizeEditable ? (
              <Field>
                <Label>Asistentes</Label>
                <Description>{isEdit ? 'Confirmados.' : 'Personas en total, con el invitado.'}</Description>
                <Input
                  type="number"
                  min={1}
                  max={GUEST_PARTY_SIZE_MAX}
                  {...register('guests_count', { valueAsNumber: true })}
                />
                {errors.guests_count && <ErrorMessage>{errors.guests_count.message}</ErrorMessage>}
              </Field>
            ) : (
              <div>
                <p className="text-sm/6 font-medium text-ink">Asistentes</p>
                <p className="mt-1 text-sm/6 text-ink-muted">
                  {rsvpStatus === 'DECLINED' ? 'Declinó la invitación.' : 'Se define cuando el invitado confirme.'}
                </p>
              </div>
            )}
            <Field>
              <Label>Máximo</Label>
              <Description>Cupo permitido.</Description>
              <Input
                type="number"
                min={0}
                max={GUEST_PARTY_SIZE_MAX}
                placeholder="—"
                {...register('max_guests', {
                  setValueAs: (v) => {
                    if (v === '' || v == null) return null
                    const number = Number(v)
                    return Number.isFinite(number) ? number : null
                  },
                })}
              />
              {errors.max_guests && <ErrorMessage>{errors.max_guests.message}</ErrorMessage>}
            </Field>
            <div>
              <p className="text-sm/6 font-medium text-ink">Mesa</p>
              <p className="mt-1 text-sm/6 text-ink-secondary">{assignedTableName || 'Sin mesa'}</p>
              <p className="text-xs text-ink-muted">Asigna o cambia la mesa en la pestaña Mesas.</p>
            </div>
          </div>

          {/* Rol + Host toggle */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>Rol</Label>
              <Select {...register('role')}>
                <option value="">Sin rol</option>
                {PUBLIC_GUEST_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field className="flex flex-col justify-end pb-1">
              <Controller
                name="is_host"
                control={control}
                render={({ field }) => (
                  <CheckboxField>
                    <Checkbox checked={field.value ?? false} onChange={field.onChange} />
                    <Label>Es anfitrión</Label>
                  </CheckboxField>
                )}
              />
            </Field>
          </div>

          {/* Restricciones alimentarias */}
          <Field>
            <Label>Restricciones alimentarias</Label>
            <Input
              {...register('dietary_restrictions')}
              placeholder="Ej. Vegetariano, sin gluten, alérgico a nueces…"
            />
            {errors.dietary_restrictions && <ErrorMessage>{errors.dietary_restrictions.message}</ErrorMessage>}
          </Field>

          {/* Notas internas */}
          <Field>
            <Label>Notas internas</Label>
            <Textarea {...register('notes')} placeholder="Notas privadas sobre este invitado…" rows={2} />
            {errors.notes && <ErrorMessage>{errors.notes.message}</ErrorMessage>}
          </Field>

          {/* Perfil público — collapsible (for GraduatesList / public profile page) */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setProfileExpanded((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-ink-muted transition-colors hover:text-ink-secondary"
            >
              <span>
                Perfil público <span className="font-normal text-ink-muted">(graduados / perfiles)</span>
              </span>
              <ChevronDownIcon
                className={['size-4 transition-transform', profileExpanded ? 'rotate-180' : ''].join(' ')}
              />
            </button>

            <AnimatePresence>
              {profileExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-4">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <Field>
                        <Label>Nombre publico / apodo</Label>
                        <Input {...register('nickname')} placeholder="Anita o Generacion 2026" />
                        {errors.nickname && <ErrorMessage>{errors.nickname.message}</ErrorMessage>}
                      </Field>
                      <Field>
                        <Label>Orden publico</Label>
                        <Input
                          type="number"
                          min={0}
                          max={9999}
                          step={1}
                          placeholder="0"
                          {...register('order', {
                            setValueAs: (v) => {
                              if (v === '' || v == null) return undefined
                              const number = Number(v)
                              return Number.isFinite(number) ? number : undefined
                            },
                          })}
                        />
                        {errors.order && <ErrorMessage>{errors.order.message}</ErrorMessage>}
                      </Field>
                    </div>
                    <Field>
                      <Label>Imagen publica</Label>
                      <Input {...register('image_url')} placeholder="profiles/ana.webp o https://..." />
                      {errors.image_url && <ErrorMessage>{errors.image_url.message}</ErrorMessage>}
                    </Field>
                    <Field>
                      <Label>Titular / cargo</Label>
                      <Input {...register('headline')} placeholder="Ej. Ingeniería en Sistemas · Generación 2025" />
                      {errors.headline && <ErrorMessage>{errors.headline.message}</ErrorMessage>}
                    </Field>
                    <Field>
                      <Label>Biografía</Label>
                      <Textarea
                        {...register('bio')}
                        placeholder="Breve descripción que aparecerá en el programa del evento…"
                        rows={3}
                      />
                      {errors.bio && <ErrorMessage>{errors.bio.message}</ErrorMessage>}
                    </Field>
                    <Field>
                      <Label>Dedicatoria / firma</Label>
                      <Textarea {...register('signature')} placeholder="Frase o dedicatoria personal…" rows={2} />
                      {errors.signature && <ErrorMessage>{errors.signature.message}</ErrorMessage>}
                    </Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogBody>

        <DialogActions>
          <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (isEdit ? 'Actualizando…' : 'Agregando…') : isEdit ? 'Actualizar invitado' : 'Agregar invitado'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
