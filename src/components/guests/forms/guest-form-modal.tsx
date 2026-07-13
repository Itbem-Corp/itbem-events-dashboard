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
import { PUBLIC_GUEST_ROLES, isHostGuestRole } from '@/lib/public-guest-roles'
import type { Guest } from '@/models/Guest'
import { toast } from 'sonner'

const schema = z.object({
  first_name: z.string().min(2, 'Mínimo 2 caracteres'),
  last_name: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  guests_count: z.number().min(1, 'Mínimo 1').max(20, 'Máximo 20'),
  max_guests: z.number().min(1).max(20).optional().nullable(),
  table_number: z.string().optional(),
  table_id: z.string().optional().nullable(),
  dietary_restrictions: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
  is_host: z.boolean().optional(),
  // Rich profile (used by GraduatesList / public page)
  nickname: z.string().optional(),
  order: z.number().int('Debe ser entero').min(0, 'Minimo 0').max(9999, 'Maximo 9999').optional().nullable(),
  image_url: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  signature: z.string().optional(),
})

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

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      guests_count: 1,
      max_guests: undefined,
      table_number: '',
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
        guests_count: guest.guests_count ?? 1,
        max_guests: guest.max_guests ?? undefined,
        table_number: guest.table_number ?? '',
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
        table_number: '',
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
      let savedGuest: Guest | null = null
      if (isEdit && guest) {
        const res = await api.put(guestPath(guest.id), { ...data, event_id: eventId })
        savedGuest = readApiData<Guest | null>(res.data)
      } else {
        const res = await api.post(guestsPath(), { ...data, event_id: eventId })
        savedGuest = readApiData<Guest | null>(res.data)
      }
      await onSaved?.(savedGuest)
      onPublicContentChanged?.()
      setIsOpen(false)
      toast.success(isEdit ? 'Invitado actualizado' : 'Invitado agregado')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al guardar el invitado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={setIsOpen}>
      <DialogTitle>{isEdit ? 'Editar invitado' : 'Nuevo invitado'}</DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
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
            </Field>
          </div>

          {/* Acompañantes + Máximo + Mesa */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field>
              <Label>Asistentes</Label>
              <Description>Confirmados.</Description>
              <Input type="number" min={1} max={20} {...register('guests_count', { valueAsNumber: true })} />
              {errors.guests_count && <ErrorMessage>{errors.guests_count.message}</ErrorMessage>}
            </Field>
            <Field>
              <Label>Máximo</Label>
              <Description>Cupo permitido.</Description>
              <Input
                type="number"
                min={1}
                max={20}
                placeholder="—"
                {...register('max_guests', {
                  setValueAs: (v) => {
                    if (v === '' || v == null) return null
                    const number = Number(v)
                    return Number.isFinite(number) ? number : null
                  },
                })}
              />
            </Field>
            <Field>
              <Label>Mesa asignada</Label>
              <Input {...register('table_number')} placeholder="Ej. 5" />
            </Field>
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
          </Field>

          {/* Notas internas */}
          <Field>
            <Label>Notas internas</Label>
            <Textarea {...register('notes')} placeholder="Notas privadas sobre este invitado…" rows={2} />
          </Field>

          {/* Perfil público — collapsible (for GraduatesList / public profile page) */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setProfileExpanded((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <span>
                Perfil público <span className="font-normal text-zinc-700">(graduados / perfiles)</span>
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
                    </Field>
                    <Field>
                      <Label>Titular / cargo</Label>
                      <Input {...register('headline')} placeholder="Ej. Ingeniería en Sistemas · Generación 2025" />
                    </Field>
                    <Field>
                      <Label>Biografía</Label>
                      <Textarea
                        {...register('bio')}
                        placeholder="Breve descripción que aparecerá en el programa del evento…"
                        rows={3}
                      />
                    </Field>
                    <Field>
                      <Label>Dedicatoria / firma</Label>
                      <Textarea {...register('signature')} placeholder="Frase o dedicatoria personal…" rows={2} />
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
