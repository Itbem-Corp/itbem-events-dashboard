'use client'

import { useState, useEffect } from 'react'
import { mutate } from 'swr'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'

interface Props {
  event: Event | null
  isOpen: boolean
  setIsOpen: (v: boolean) => void
}

export function EventDuplicateModal({ event, isOpen, setIsOpen }: Props) {
  const [name, setName] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !event) return
    setName(`${event.name} (copia)`)
    // Default: push date 30 days forward
    const future = new Date(event.event_date_time)
    future.setDate(future.getDate() + 30)
    setDateTime(future.toISOString().substring(0, 16))
  }, [isOpen, event])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!event || !name.trim() || !dateTime) return

    setLoading(true)
    try {
      await api.post('/events', {
        name: name.trim(),
        event_date_time: dateTime,
        timezone: event.timezone,
        language: event.language ?? 'es',
        event_type_id: event.event_type_id,
        description: event.description ?? '',
        address: event.address ?? '',
        organizer_name: event.organizer_name ?? '',
        organizer_email: event.organizer_email ?? '',
        organizer_phone: event.organizer_phone ?? '',
        max_guests: event.max_guests ?? null,
        is_active: false, // start inactive until organizer reviews
      })
      await mutate('/events/all')
      toast.success('Evento duplicado correctamente')
      setIsOpen(false)
    } catch {
      toast.error('Error al duplicar el evento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => !loading && setIsOpen(false)}>
      <DialogTitle>Duplicar evento</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <p className="text-sm text-zinc-400">
            Se creará una copia de <span className="font-medium text-zinc-200">{event?.name}</span> con los mismos ajustes.
            El evento duplicado comenzará como <span className="font-medium text-zinc-300">inactivo</span>.
          </p>

          <Field>
            <Label>Nombre del nuevo evento</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field>
            <Label>Fecha y hora</Label>
            <Input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading || !name.trim() || !dateTime}>
            {loading ? 'Duplicando…' : 'Duplicar evento'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
