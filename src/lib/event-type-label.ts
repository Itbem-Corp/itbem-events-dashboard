/**
 * Maps backend event-type names to user-facing Spanish labels.
 * If a name isn't in the map, returns it with the first letter capitalised.
 */

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'Boda',
  birthday: 'Cumpleaños',
  graduation: 'Graduación',
  corporate: 'Corporativo',
  conference: 'Conferencia',
  party: 'Fiesta',
  baby_shower: 'Baby shower',
  babyshower: 'Baby shower',
  bridal_shower: 'Despedida de soltera',
  anniversary: 'Aniversario',
  quinceañera: 'Quinceañera',
  quinceanera: 'Quinceañera',
  baptism: 'Bautizo',
  communion: 'Comunión',
  reunion: 'Reunión',
  gala: 'Gala',
  concert: 'Concierto',
  workshop: 'Taller',
  seminar: 'Seminario',
  other: 'Otro',
}

export function eventTypeLabel(name: string | undefined | null): string {
  if (!name) return ''
  const key = name.trim().toLowerCase()
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key]
  // Fallback: capitalise first letter
  return name.charAt(0).toUpperCase() + name.slice(1)
}
