import {
  readCreatedSectionResourcePayload,
  readReplacedSectionResourcePayload,
  sectionImageSlotsForType,
} from '@/components/events/event-section-resources'
import {
  canonicalSectionType,
  getSectionTypeDef,
  sectionTypeHasImages,
} from '@/components/events/event-sections-manager'
import { ACCEPT_PRESETS } from '@/components/ui/file-upload'
import {
  isSupportedSectionImageUploadFile,
  SECTION_IMAGE_UPLOAD_ACCEPT,
  SECTION_IMAGE_UPLOAD_EXTENSIONS,
  SECTION_IMAGE_UPLOAD_HELP_TEXT,
  SECTION_IMAGE_UPLOAD_LIMIT_HELP_TEXT,
  SECTION_IMAGE_UPLOAD_MAX_BYTES,
  SECTION_IMAGE_UPLOAD_MAX_MB,
  SECTION_IMAGE_UPLOAD_MIME_TYPES,
  sectionImageUploadValidationError,
} from '@/lib/resource-upload-policy'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('event section media contract', () => {
  it('keeps dashboard slots aligned with public resource-backed sections', () => {
    expect(sectionImageSlotsForType('GraduationHero')).toEqual([
      { position: 0, label: 'Imagen principal (hero)', ratio: '3:2' },
      { position: 1, label: 'Logo de la escuela', ratio: '1:1' },
    ])
    expect(sectionImageSlotsForType('EventVenue')).toEqual([
      { position: 0, label: 'Foto izquierda (columna 2)', ratio: '3:2' },
      { position: 1, label: 'Foto derecha (columna 2)', ratio: '3:2' },
      { position: 2, label: 'Foto central (centrada)', ratio: '3:2' },
    ])
    expect(sectionImageSlotsForType('Reception')).toEqual([
      { position: 0, label: 'Foto superior izquierda', ratio: '3:2' },
      { position: 1, label: 'Foto superior derecha', ratio: '3:2' },
      { position: 2, label: 'Foto inferior izquierda', ratio: '3:2' },
      { position: 3, label: 'Foto inferior derecha', ratio: '3:2' },
    ])
    expect(sectionImageSlotsForType('PhotoGrid')).toEqual([
      { position: 0, label: 'Foto 1 (fila 2-col)', ratio: '3:2' },
      { position: 1, label: 'Foto 2 (fila 2-col)', ratio: '3:2' },
      { position: 2, label: 'Foto 3 (fila 3-col)', ratio: '4:3' },
      { position: 3, label: 'Foto 4 (fila 3-col)', ratio: '4:3' },
      { position: 4, label: 'Foto 5 (fila 3-col)', ratio: '4:3' },
    ])
    expect(sectionImageSlotsForType('RSVPConfirmation')).toEqual([
      { position: 0, label: 'Imagen "Declinado"', ratio: '3:2' },
      { position: 1, label: 'Imagen "Confirmado"', ratio: '3:2' },
    ])
  })

  it('exposes a media slot for legacy HERO sections rendered by the public frontend', () => {
    expect(sectionTypeHasImages('HERO')).toBe(true)
    expect(sectionImageSlotsForType('HERO')).toEqual([{ position: 0, label: 'Imagen de portada', ratio: '16:9' }])
    expect(sectionImageSlotsForType('LegacyHero')).toEqual(sectionImageSlotsForType('HERO'))
  })

  it('maps long legacy gallery aliases to public gallery slots', () => {
    expect(sectionTypeHasImages('LegacyGallery')).toBe(true)
    expect(sectionImageSlotsForType('LegacyGallery')).toEqual(sectionImageSlotsForType('GALLERY'))
  })

  it('maps host aliases to the public graduates list media slot', () => {
    expect(sectionTypeHasImages('Hosts')).toBe(true)
    expect(sectionImageSlotsForType('Hosts')).toEqual(sectionImageSlotsForType('GraduatesList'))
    expect(sectionTypeHasImages('HostSection')).toBe(true)
    expect(sectionImageSlotsForType('HostSection')).toEqual(sectionImageSlotsForType('GraduatesList'))
    expect(sectionTypeHasImages('HostsSection')).toBe(true)
    expect(sectionImageSlotsForType('HostsSection')).toEqual(sectionImageSlotsForType('GraduatesList'))
  })

  it('treats singular host aliases as editable host sections in the classic manager', () => {
    expect(canonicalSectionType('HostSection')).toBe('Hosts')
    expect(canonicalSectionType('HostsSection')).toBe('Hosts')
    expect(getSectionTypeDef('HostSection')).toMatchObject({
      type: 'Hosts',
      label: 'Anfitriones',
      hasConfig: true,
    })
    expect(getSectionTypeDef('HostsSection')).toMatchObject({
      type: 'Hosts',
      label: 'Anfitriones',
      hasConfig: true,
    })
  })

  it('maps imported or uppercase section aliases to dashboard editors and media slots', () => {
    expect(canonicalSectionType('HOSTS')).toBe('Hosts')
    expect(canonicalSectionType('PHOTO_GRID')).toBe('PhotoGrid')
    expect(canonicalSectionType('RSVP')).toBe('RSVPConfirmation')
    expect(canonicalSectionType('MOMENT_WALL')).toBe('MomentWall')
    expect(canonicalSectionType('AGENDA')).toBe('Agenda')

    expect(getSectionTypeDef('PHOTO_GRID')).toMatchObject({
      type: 'PhotoGrid',
      label: 'Galería de fotos',
    })
    expect(sectionImageSlotsForType('PHOTO_GRID')).toEqual(sectionImageSlotsForType('PhotoGrid'))
    expect(sectionImageSlotsForType('RSVP')).toEqual(sectionImageSlotsForType('RSVPConfirmation'))
    expect(sectionImageSlotsForType('HOSTS')).toEqual(sectionImageSlotsForType('GraduatesList'))
  })

  it('keeps contact aliases editable without listing duplicate section types', () => {
    expect(canonicalSectionType('ContactSection')).toBe('Contact')
    expect(getSectionTypeDef('ContactSection')).toMatchObject({
      type: 'Contact',
      label: 'Contacto',
      hasConfig: true,
    })
  })

  it('returns no media slots for text-only legacy sections', () => {
    expect(sectionTypeHasImages('TEXT')).toBe(false)
    expect(sectionImageSlotsForType('TEXT')).toEqual([])
    expect(sectionTypeHasImages('MAP')).toBe(false)
    expect(sectionImageSlotsForType('MAP')).toEqual([])
  })

  it('unwraps backend envelopes from section resource mutations', () => {
    expect(
      readCreatedSectionResourcePayload({
        status: 201,
        message: 'Resource created',
        data: {
          id: 'resource-1',
          event_section_id: 'section-1',
          path: 'events/section-1/resource-1.webp',
          position: 0,
          view_url: 'https://cdn.example.com/resource-1.webp',
        },
      })
    ).toEqual({
      id: 'resource-1',
      event_section_id: 'section-1',
      path: 'events/section-1/resource-1.webp',
      position: 0,
      view_url: 'https://cdn.example.com/resource-1.webp',
    })

    expect(
      readReplacedSectionResourcePayload({
        status: 200,
        message: 'File replaced',
        data: {
          path: 'events/section-1/replaced.webp',
          view_url: 'https://cdn.example.com/replaced.webp',
          view_url_expires_at: '2026-03-01T12:05:00.000Z',
        },
      })
    ).toEqual({
      path: 'events/section-1/replaced.webp',
      view_url: 'https://cdn.example.com/replaced.webp',
      view_url_expires_at: '2026-03-01T12:05:00.000Z',
    })
  })

  it('keeps section image uploads aligned with backend-supported image resource types', () => {
    expect(SECTION_IMAGE_UPLOAD_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/heic',
      'image/heif',
      'image/avif',
    ])
    expect(SECTION_IMAGE_UPLOAD_EXTENSIONS).toContain('.heic')
    expect(SECTION_IMAGE_UPLOAD_EXTENSIONS).toContain('.avif')
    expect(SECTION_IMAGE_UPLOAD_ACCEPT).toContain('image/svg+xml')
    expect(SECTION_IMAGE_UPLOAD_ACCEPT).toContain('.heif')
    expect(SECTION_IMAGE_UPLOAD_HELP_TEXT).toContain('HEIC')
    expect(SECTION_IMAGE_UPLOAD_LIMIT_HELP_TEXT).toBe(`${SECTION_IMAGE_UPLOAD_HELP_TEXT} · Hasta 10 MB`)
    expect(SECTION_IMAGE_UPLOAD_MAX_MB).toBe(10)
    expect(SECTION_IMAGE_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(isSupportedSectionImageUploadFile({ name: 'foto.HEIC', type: '' })).toBe(true)
    expect(isSupportedSectionImageUploadFile({ name: 'cover.avif', type: ' ' })).toBe(true)
    expect(isSupportedSectionImageUploadFile({ name: 'cover.bin', type: 'image/jpg' })).toBe(true)
    expect(isSupportedSectionImageUploadFile({ name: 'cover.bin', type: 'image/webp' })).toBe(true)
    expect(isSupportedSectionImageUploadFile({ name: 'cover.tiff', type: 'image/tiff' })).toBe(false)
    expect(isSupportedSectionImageUploadFile({ name: 'renamed.png', type: 'image/tiff' })).toBe(false)
    expect(
      sectionImageUploadValidationError({
        name: 'cover.png',
        type: 'image/png',
        size: SECTION_IMAGE_UPLOAD_MAX_BYTES,
      })
    ).toBeNull()
    expect(
      sectionImageUploadValidationError({
        name: 'cover.png',
        type: 'image/png',
        size: SECTION_IMAGE_UPLOAD_MAX_BYTES + 1,
      })
    ).toBe('La imagen no puede superar los 10 MB')
    expect(sectionImageUploadValidationError({ name: 'cover.tiff', type: 'image/tiff', size: 1 })).toBe(
      `Solo se aceptan imágenes (${SECTION_IMAGE_UPLOAD_HELP_TEXT})`
    )
    expect(sectionImageUploadValidationError({ name: 'empty.png', type: 'image/png', size: 0 })).toBe(
      'La imagen está vacía o no se pudo leer'
    )
  })

  it('keeps the reusable dashboard image picker preset aligned with section image uploads', () => {
    expect(Object.values(ACCEPT_PRESETS.IMAGES).flat()).toEqual(
      expect.arrayContaining(['.jpg', '.png', '.webp', '.gif', '.svg', '.heic', '.heif', '.avif'])
    )
  })

  it('blocks ambiguous resource loads and uses managed multipart transport', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/events/event-section-resources.tsx'), 'utf8')

    expect(source).toContain('resourcesError')
    expect(source).toContain('resourceTypesError')
    expect(source).toContain('<UploadStatus')
    expect(source).toContain('requestConfig')
    expect(source).not.toContain("'Content-Type': 'multipart/form-data'")
  })
})
