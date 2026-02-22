'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { mutate } from 'swr'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage, Description } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Button } from '@/components/button'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Guest } from '@/models/Guest'

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
  headline: z.string().optional(),
  bio: z.string().optional(),
  signature: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  eventId: string
  eventIdentifier: string
  guest?: Guest | null
}

export function GuestFormModal({ isOpen, setIsOpen, eventId, eventIdentifier, guest }: Props) {
  const [loading, setLoading] = useState(false)
  const [profileExpanded, setProfileExpanded] = useState(false)
  const isEdit = Boolean(guest?.id)

  const {
    register,
    control,
    handleSubmit,
    reset,
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
      headline: '',
      bio: '',
      signature: '',
    },
  })

  useEffect(() => {
    if (!isOpen) return
    setProfileExpanded(false)
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
        headline: guest.headline ?? '',
        bio: guest.bio ?? '',
        signature: guest.signature ?? '',
      })
      // Auto-expand profile section if any profile data exists
      if (guest.headline || guest.bio || guest.signature) {
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
        headline: '',
        bio: '',
        signature: '',
      })
    }
  }, [isOpen, isEdit, guest, reset])

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    try {
      if (isEdit && guest) {
        await api.put(`/guests/${guest.id}`, data)
      } else {
        await api.post('/guests', { ...data, event_id: eventId })
      }
      await mutate(`/guests/all:${eventId}`)
      setIsOpen(false)
      toast.success(isEdit ? 'Invitado actualizado' : 'Invitado agregado')
    } catch {
      toast.error('Error al guardar el invitado')
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <Label>Asistentes</Label>
              <Description>Confirmados.</Description>
              <Input
                type="number"
                min={1}
                max={20}
                {...register('guests_count', { valueAsNumber: true })}
              />
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
                {...register('max_guests', { valueAsNumber: true, setValueAs: (v) => (v === '' || isNaN(v) ? null : Number(v)) })}
              />
            </Field>
            <Field>
              <Label>Mesa asignada</Label>
              <Input {...register('table_number')} placeholder="Ej. 5" />
            </Field>
          </div>

          {/* Rol + Host toggle */}
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <Label>Rol</Label>
              <Select {...register('role')}>
                <option value="">Sin rol</option>
                <option value="guest">Invitado</option>
                <option value="graduate">Graduado</option>
                <option value="host">Anfitrión</option>
                <option value="vip">VIP</option>
                <option value="speaker">Orador</option>
                <option value="staff">Staff</option>
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
            <Input {...register('dietary_restrictions')} placeholder="Ej. Vegetariano, sin gluten, alérgico a nueces…" />
          </Field>

          {/* Notas internas */}
          <Field>
            <Label>Notas internas</Label>
            <Textarea
              {...register('notes')}
              placeholder="Notas privadas sobre este invitado…"
              rows={2}
            />
          </Field>

          {/* Perfil público — collapsible (for GraduatesList / public profile page) */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setProfileExpanded((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <span>Perfil público <span className="text-zinc-700 font-normal">(graduados / perfiles)</span></span>
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
                    <Field>
                      <Label>Titular / cargo</Label>
                      <Input
                        {...register('headline')}
                        placeholder="Ej. Ingeniería en Sistemas · Generación 2025"
                      />
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
                      <Textarea
                        {...register('signature')}
                        placeholder="Frase o dedicatoria personal…"
                        rows={2}
                      />
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
            {loading
              ? isEdit ? 'Actualizando…' : 'Agregando…'
              : isEdit ? 'Actualizar invitado' : 'Agregar invitado'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
