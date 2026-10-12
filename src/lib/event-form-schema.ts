import * as z from 'zod'

/** Longest event name the form accepts; longer names overflow the event header and the URL. */
export const EVENT_NAME_MAX_LENGTH = 120

/**
 * Event form schema. `storedName` is the name the event already has: the backend
 * still saves a legacy name longer than the limit when it is sent back unchanged.
 */
export function createEventFormSchema(storedName?: string | null) {
  const keptName = storedName?.trim()
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre del evento')
      .min(3, 'El nombre debe tener al menos 3 caracteres')
      .refine((name) => name.length <= EVENT_NAME_MAX_LENGTH || (Boolean(keptName) && name === keptName), {
        message: `El nombre puede tener hasta ${EVENT_NAME_MAX_LENGTH} caracteres`,
      }),
    identifier: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones')
      .min(3, 'Mínimo 3 caracteres')
      .optional(),
    description: z.string().optional(),
    client_id: z.string().optional(),
    event_type_id: z.string().optional(),
    event_date_time: z.string().min(1, 'La fecha es requerida'),
    timezone: z.string().min(1, 'Selecciona una zona horaria'),
    language: z.string().optional(),
    address: z.string().optional(),
    second_address: z.string().optional(),
    music_url: z.string().url('URL inválida').optional().or(z.literal('')),
    organizer_name: z.string().optional(),
    organizer_email: z.string().email('Correo inválido').optional().or(z.literal('')),
    organizer_phone: z.string().optional(),
    is_active: z.boolean(),
  })
}

export const eventFormSchema = createEventFormSchema()
