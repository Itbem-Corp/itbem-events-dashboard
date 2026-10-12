import { createEventFormSchema, EVENT_NAME_MAX_LENGTH, eventFormSchema } from '@/lib/event-form-schema'
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

  // EVT-24: a name made only of spaces passed the client and failed with a generic toast.
  it('rejects a name made only of spaces on the name field', () => {
    const result = eventFormSchema.safeParse({ ...validNewEvent(), name: '    ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
      expect(result.error.issues[0]?.message).toBe('Escribe el nombre del evento')
    }
  })

  // EVT-25: a 300 character name was accepted and overflowed the header.
  it('limits the name length', () => {
    expect(eventFormSchema.safeParse({ ...validNewEvent(), name: 'a'.repeat(EVENT_NAME_MAX_LENGTH) }).success).toBe(true)
    const result = eventFormSchema.safeParse({ ...validNewEvent(), name: 'a'.repeat(300) })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/hasta 120 caracteres/)
  })

  it('still saves a legacy long name sent back unchanged, like the backend', () => {
    const legacy = 'b'.repeat(200)
    const schema = createEventFormSchema(legacy)
    expect(schema.safeParse({ ...validNewEvent(), name: legacy }).success).toBe(true)
    expect(schema.safeParse({ ...validNewEvent(), name: `${legacy}x` }).success).toBe(false)
  })
})
