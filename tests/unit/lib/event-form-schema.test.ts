import { eventFormSchema } from '@/lib/event-form-schema'
import { emptyEventFormValues } from '@/lib/event-form-values'
import { describe, expect, it } from 'vitest'

describe('event form validation', () => {
  const validNewEvent = () => ({
    ...emptyEventFormValues('7f93c531-04b8-49ab-a1d4-143331d368fd'),
    name: 'Boda García y López',
    event_date_time: '2026-11-15T18:00',
  })

  it('accepts a new event without the hidden, server-generated URL', () => {
    const result = eventFormSchema.safeParse(validNewEvent())
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.identifier).toBeUndefined()
  })

  it.each(['', 'ab', 'Boda López', 'boda_con_guiones'])('rejects invalid edited URLs: %s', (identifier) => {
    expect(eventFormSchema.safeParse({ ...validNewEvent(), identifier }).success).toBe(false)
  })

  it('accepts a valid edited URL', () => {
    expect(eventFormSchema.safeParse({ ...validNewEvent(), identifier: 'boda-lopez-2026' }).success).toBe(true)
  })

  it('still requires a name and date', () => {
    expect(eventFormSchema.safeParse(emptyEventFormValues()).success).toBe(false)
  })
})
