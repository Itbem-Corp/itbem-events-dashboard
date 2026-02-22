'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { mutate } from 'swr'

// UI
import { Dialog, DialogBody, DialogActions, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Button } from '@/components/button'

// API
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { User } from '@/models/User'

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

interface Props {
    isOpen: boolean
    setIsOpen: (v: boolean) => void
    user?: User | null
}

export function UserFormModal({ isOpen, setIsOpen, user }: Props) {
    const [loading, setLoading] = useState(false)
    const isEdit = Boolean(user?.id)

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
            if (isEdit && user) {
                // ✏️ EDITAR (solo texto)
                await api.put(`/users/${user.id}`, {
                    first_name: data.first_name,
                    last_name: data.last_name,
                })
            } else {
                // ➕ INVITAR (Cognito manda email)
                await api.post('/users/invite', {
                    email: data.email,
                    first_name: data.first_name,
                    last_name: data.last_name,
                })
            }

            await mutate('/users/all')
            setIsOpen(false)
            toast.success(isEdit ? 'Usuario actualizado' : 'Invitación enviada')
        } catch {
            toast.error('Error al guardar usuario')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onClose={setIsOpen}>
            <DialogTitle>
                {isEdit ? 'Editar usuario' : 'Invitar usuario'}
            </DialogTitle>

            <form onSubmit={handleSubmit(onSubmit)}>
                <DialogBody className="space-y-6">
                    <Field>
                        <Label>Email</Label>
                        <Input {...register('email')} disabled={isEdit} />
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
                </DialogBody>

                <DialogActions>
                    <Button
                        type="button"
                        plain
                        onClick={() => setIsOpen(false)}
                        disabled={loading}
                    >
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
