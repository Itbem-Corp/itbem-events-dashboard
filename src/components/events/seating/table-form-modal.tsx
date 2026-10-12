'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import type { Table } from '@/models/Table'

function buildSchema(minCapacity: number) {
  return z.object({
    name: z.string().min(1, 'Nombre requerido'),
    capacity: z
      .number()
      .min(1, 'Mínimo 1')
      .max(50, 'Máximo 50')
      .refine((value) => value >= minCapacity, {
        message: `Ya hay ${minCapacity} lugares ocupados en esta mesa. Mueve invitados antes de bajar la capacidad.`,
      }),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: FormValues) => void
  table?: Table | null
  /** Seats already taken at this table; the capacity cannot go below it (strict capacity, SEAT-1). */
  minCapacity?: number
}

export function TableFormModal({ isOpen, onClose, onSubmit, table, minCapacity = 0 }: Props) {
  const isEdit = Boolean(table)
  const schema = useMemo(() => buildSchema(minCapacity), [minCapacity])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', capacity: 8 },
  })

  useEffect(() => {
    if (!isOpen) return
    if (table) {
      reset({ name: table.name, capacity: table.capacity })
    } else {
      reset({ name: '', capacity: 8 })
    }
  }, [isOpen, table, reset])

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{isEdit ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle>
      <form
        onSubmit={handleSubmit((data) => {
          onSubmit(data)
          onClose()
        })}
      >
        <DialogBody className="space-y-4 py-4">
          <Field>
            <Label>Nombre de la mesa</Label>
            <Input {...register('name')} placeholder="Ej. Mesa 1, VIP, Familia" autoFocus />
            {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Capacidad (asistentes)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              {...register('capacity', { valueAsNumber: true })}
            />
            {errors.capacity && <ErrorMessage>{errors.capacity.message}</ErrorMessage>}
          </Field>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            {isEdit ? 'Guardar cambios' : 'Crear mesa'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
