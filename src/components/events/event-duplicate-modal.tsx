'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventDuplicatePath } from '@/lib/api-paths'
import { addDaysToLocalDateTime, toDateTimeLocalValue, toRFC3339 } from '@/lib/date-time'
import { normalizeEventMutationPayload } from '@/lib/event-payload'
import type { Event } from '@/models/Event'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Props {
  event: Event | null
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  onCreated?: (event: Event | null) => Promise<void> | void
}

export function EventDuplicateModal({ event, isOpen, setIsOpen, onCreated }: Props) {
  const [name, setName] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !event) return
    setName(`${event.name} (copia)`)
    // Default: push date 30 days forward in the event's own wall time.
    const timezone = event.timezone ?? 'America/Mexico_City'
    setDateTime(addDaysToLocalDateTime(toDateTimeLocalValue(event.event_date_time, timezone), 30))
  }, [isOpen, event])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!event || !name.trim() || !dateTime) return

    setLoading(true)
    try {
      const payload = normalizeEventMutationPayload({
        name: name.trim(),
        event_date_time: toRFC3339(dateTime, event.timezone ?? 'America/Mexico_City'),
        timezone: event.timezone,
        is_active: false, // start inactive until organizer reviews
      })

      const response = await api.post(eventDuplicatePath(event.id), payload)
      await onCreated?.(readApiData<Event | null>(response.data))
      toast.success('Evento duplicado correctamente')
      setIsOpen(false)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al duplicar el evento'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => !loading && setIsOpen(false)}>
      <DialogTitle>Duplicar evento</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <p className="text-sm text-ink-secondary">
            Se creará una copia de <span className="font-medium text-ink">{event?.name}</span> con los mismos
            ajustes. El evento duplicado comenzará como <span className="font-medium text-ink-secondary">inactivo</span>.
          </p>

          <Field>
            <Label>Nombre del nuevo evento</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>

          <Field>
            <Label>Fecha y hora</Label>
            <Input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
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
