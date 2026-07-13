import { canonicalSectionType } from '@/lib/section-type-aliases'

export interface SectionImageSlot {
  position: number
  label: string
  ratio: string
}

const slots = (labels: string[], ratio: string): SectionImageSlot[] =>
  labels.map((label, position) => ({ position, label, ratio }))

const SECTION_IMAGES: Record<string, SectionImageSlot[]> = {
  GraduationHero: [
    { position: 0, label: 'Imagen principal (hero)', ratio: '3:2' },
    { position: 1, label: 'Logo de la escuela', ratio: '1:1' },
  ],
  EventVenue: slots(['Foto izquierda (columna 2)', 'Foto derecha (columna 2)', 'Foto central (centrada)'], '3:2'),
  Reception: slots(['Foto superior izquierda', 'Foto superior derecha', 'Foto inferior izquierda', 'Foto inferior derecha'], '3:2'),
  GraduatesList: [{ position: 0, label: 'Foto grupal (footer)', ratio: '5:2' }],
  PhotoGrid: [
    ...slots(['Foto 1 (fila 2-col)', 'Foto 2 (fila 2-col)'], '3:2'),
    ...slots(['Foto 3 (fila 3-col)', 'Foto 4 (fila 3-col)', 'Foto 5 (fila 3-col)'], '4:3').map((slot) => ({
      ...slot,
      position: slot.position + 2,
    })),
  ],
  RSVPConfirmation: slots(['Imagen "Declinado"', 'Imagen "Confirmado"'], '3:2'),
  HERO: [{ position: 0, label: 'Imagen de portada', ratio: '16:9' }],
  GALLERY: slots(['Foto 1', 'Foto 2', 'Foto 3', 'Foto 4', 'Foto 5', 'Foto 6'], '4:3'),
}

export function sectionImageSlotsForType(componentType: string): SectionImageSlot[] {
  const type = canonicalSectionType(componentType)
  return type === 'Hosts' ? SECTION_IMAGES.GraduatesList : (SECTION_IMAGES[type] ?? [])
}
