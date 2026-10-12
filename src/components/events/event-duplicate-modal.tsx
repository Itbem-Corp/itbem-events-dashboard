'use client'

import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventConfigPath, eventDuplicatePath } from '@/lib/api-paths'
import { addDaysToLocalDateTime, toDateTimeLocalValue, toRFC3339 } from '@/lib/date-time'
import { planDuplicateSchedule } from '@/lib/event-duplicate-schedule'
import { EVENT_NAME_MAX_LENGTH } from '@/lib/event-form-schema'
import { normalizeEventMutationPayload } from '@/lib/event-payload'
import { eventWriteFieldError } from '@/lib/event-write-errors'
import { fetcher } from '@/lib/fetcher'
import type { Event } from '@/models/Event'
import type { EventConfig } from '@/models/EventConfig'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

interface Props {
  event: Event | null
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  onCreated?: (event: Event | null) => Promise<void> | void
}

export function EventDuplicateModal({ event, isOpen, setIsOpen, onCreated }: Props) {
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [dateTime, setDateTime] = useState('')
  const [shiftSchedule, setShiftSchedule] = useState(true)
  const [loading, setLoading] = useState(false)
  const timezone = event?.timezone ?? 'America/Mexico_City'

  // The copy inherits the source config, so read it to warn about dates that would leave the copy closed.
  const { data: sourceConfig } = useSWR<EventConfig>(isOpen && event?.id ? eventConfigPath(event.id) : null, fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  })
  const config = readApiData<EventConfig | undefined>(sourceConfig) ?? event?.event_config ?? event?.config ?? null
  const schedule = useMemo(() => planDuplicateSchedule(config), [config])

  useEffect(() => {
    if (!isOpen || !event) return
    setName(`${event.name} (copia)`)
    setNameError(null)
    setShiftSchedule(true)
    // Default: push date 30 days forward in the event's own wall time.
    setDateTime(
      addDaysToLocalDateTime(toDateTimeLocalValue(event.event_date_time, event.timezone ?? 'America/Mexico_City'), 30)
    )
  }, [isOpen, event])

  const closedReasonText = schedule.closedReasons.join(' y ')
  const closedWithSourceDates = !shiftSchedule && schedule.closedReasons.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!event || !trimmedName || !dateTime) return
    if (trimmedName.length > EVENT_NAME_MAX_LENGTH) {
      setNameError(`El nombre puede tener hasta ${EVENT_NAME_MAX_LENGTH} caracteres`)
      return
    }

    setLoading(true)
    setNameError(null)
    try {
      const payload = normalizeEventMutationPayload({
        name: trimmedName,
        event_date_time: toRFC3339(dateTime, timezone),
        timezone: event.timezone,
        is_active: false, // start inactive until organizer reviews
        // The backend moves the RSVP deadline and access window by the event-date offset
        // and clears any that stay in the past; false copies them unchanged.
        shift_dates: shiftSchedule,
      })

      const response = await api.post(eventDuplicatePath(event.id), payload)
      await onCreated?.(readApiData<Event | null>(response.data))
      toast.success('Evento duplicado correctamente')
      setIsOpen(false)
    } catch (err: unknown) {
      const fieldError = eventWriteFieldError(err)
      if (fieldError?.field === 'name' || fieldError?.field === 'identifier') {
        setNameError(
          fieldError.field === 'name' ? fieldError.message : 'Ya existe un evento con una URL igual. Cambia el nombre.'
        )
        return
      }
      toast.error(getApiErrorMessage(err, 'Error al duplicar el evento'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => !loading && setIsOpen(false)}>
      <DialogTitle>Duplicar evento</DialogTitle>
      <form onSubmit={handleSubmit} noValidate>
        <DialogBody className="space-y-4">
          <p className="text-sm text-ink-secondary">
            Se creará una copia de <span className="font-medium text-ink">{event?.name}</span> con los mismos ajustes.
            El evento duplicado comenzará como <span className="font-medium text-ink-secondary">inactivo</span>.
          </p>

          <Field>
            <Label>Nombre del nuevo evento</Label>
            <Input
              value={name}
              invalid={Boolean(nameError)}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
              required
              autoFocus
            />
            {nameError && <ErrorMessage>{nameError}</ErrorMessage>}
          </Field>

          <Field>
            <Label>Fecha y hora</Label>
            <Input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
          </Field>

          {schedule.hasScheduleDates && (
            <div
              className={[
                'rounded-xl border p-3',
                schedule.closedReasons.length > 0
                  ? 'border-amber-500/25 bg-amber-500/8'
                  : 'border-white/10 bg-white/[0.02]',
              ].join(' ')}
              data-testid="duplicate-schedule-hint"
            >
              <CheckboxField>
                <Checkbox checked={shiftSchedule} onChange={setShiftSchedule} name="shift_dates" />
                <Label>Mover la fecha límite de confirmación y la ventana de acceso con la nueva fecha</Label>
                <Description>
                  Se recorren el mismo tiempo que la fecha del evento. Si alguna sigue en el pasado, se quitará para que
                  la copia no nazca cerrada.
                </Description>
              </CheckboxField>
              {schedule.closedReasons.length > 0 && (
                <p className="mt-2 flex items-start gap-2 text-sm text-ink" role="status">
                  <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>
                    {closedWithSourceDates
                      ? `La copia conservará las fechas del original y nacerá cerrada: ${closedReasonText}. Ajústalas en Configuración después de duplicar.`
                      : `Con las fechas del original la copia nacería cerrada (${closedReasonText}). Al duplicar se recorrerán con la nueva fecha y la que siga en el pasado se quitará.`}
                  </span>
                </p>
              )}
            </div>
          )}
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
