'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

// UI
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

// API
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { userInvitePath, userPath } from '@/lib/api-paths'
import type { AdminUserResponse } from '@/models/User'
import { toast } from 'sonner'
import { motion, useReducedMotion } from 'motion/react'

/**
 * 🔐 IMPORTANTE
 * - Este modal SOLO gestiona identidad (users + Cognito)
 * - NO asigna clientes
 */

const schema = z.object({
  email: z.string().email('Email inválido'),
  first_name: z.string().min(2, 'Nombre requerido'),
  last_name: z.string().min(2, 'Apellido requerido'),
})

type FormValues = z.infer<typeof schema>

type UserFormUser = {
  id: string
  email: string
  first_name: string
  last_name: string
}

interface Props {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  user?: UserFormUser | null
  onSaved?: (user: AdminUserResponse | null) => Promise<void> | void
}

export function UserFormModal({ isOpen, setIsOpen, user, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const isEdit = Boolean(user?.id)
  const reducedMotion = useReducedMotion()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!isOpen) return

    if (isEdit && user) {
      reset({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      })
    } else {
      reset({
        email: '',
        first_name: '',
        last_name: '',
      })
    }
  }, [isOpen, isEdit, user, reset])

  const onSubmit = async (data: FormValues) => {
    setLoading(true)

    try {
      let savedUser: AdminUserResponse | null = null
      if (isEdit && user) {
        // ✏️ EDITAR (solo texto)
        const res = await api.put(userPath(user.id), {
          first_name: data.first_name,
          last_name: data.last_name,
        })
        savedUser = readApiData<AdminUserResponse | null>(res.data)
      } else {
        // ➕ INVITAR (Cognito manda email)
        const res = await api.post(userInvitePath(), {
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
        })
        savedUser = readApiData<AdminUserResponse | null>(res.data)
      }

      await onSaved?.(savedUser)
      setIsOpen(false)
      toast.success(isEdit ? 'Usuario actualizado' : 'Invitación enviada')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al guardar usuario'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={(open) => !loading && setIsOpen(open)}>
      <DialogTitle>{isEdit ? 'Editar usuario' : 'Invitar usuario'}</DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-6">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="space-y-6"
          >
          <p className="-mt-2 text-sm leading-6 text-zinc-400">
            {isEdit
              ? 'Los cambios se reflejan al instante en el directorio. Los roles y organizaciones se administran desde cada organización.'
              : 'Enviaremos una invitación segura. La persona elegirá su acceso al completar el registro.'}
          </p>
          <Field>
            <Label>Email</Label>
            <Input {...register('email')} readOnly={isEdit} />
            {errors.email && <ErrorMessage>{errors.email.message}</ErrorMessage>}
          </Field>

          <Field>
            <Label>Nombre</Label>
            <Input {...register('first_name')} />
            {errors.first_name && <ErrorMessage>{errors.first_name.message}</ErrorMessage>}
          </Field>

          <Field>
            <Label>Apellido</Label>
            <Input {...register('last_name')} />
            {errors.last_name && <ErrorMessage>{errors.last_name.message}</ErrorMessage>}
          </Field>
          </motion.div>
        </DialogBody>

        <DialogActions>
          <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>

          <Button type="submit" disabled={loading} data-testid="submit-user-form">
            {loading
              ? isEdit
                ? 'Actualizando…'
                : 'Enviando invitación…'
              : isEdit
                ? 'Actualizar'
                : 'Enviar invitación'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
