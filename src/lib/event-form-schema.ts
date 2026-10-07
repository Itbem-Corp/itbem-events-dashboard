import * as z from 'zod'

export const eventFormSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
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
  max_guests: z.union([z.number().min(1, 'Mínimo 1 invitado'), z.nan().transform(() => null), z.null()]),
  is_active: z.boolean(),
})

