import { canonicalSectionType, normalizeSectionTypeToken } from '@/lib/section-type-aliases'
import { describe, expect, it } from 'vitest'

describe('section-type-aliases', () => {
  it('normalizes backend and public renderer section tokens', () => {
    expect(normalizeSectionTypeToken('RSVP_CONFIRMATION')).toBe('rsvpconfirmation')
    expect(normalizeSectionTypeToken('legacy schedule')).toBe('legacyschedule')
    expect(normalizeSectionTypeToken('photo-grid')).toBe('photogrid')
  })

  it('keeps dashboard canonical section types aligned with Cafetton renderers', () => {
    expect(canonicalSectionType('AgendaSection')).toBe('Agenda')
    expect(canonicalSectionType('COUNTDOWN_HEADER')).toBe('CountdownHeader')
    expect(canonicalSectionType('EVENT_LOCATION')).toBe('EventVenue')
    expect(canonicalSectionType('SECOND_LOCATION')).toBe('Reception')
    expect(canonicalSectionType('GRADUATION_HEADER')).toBe('GraduationHero')
    expect(canonicalSectionType('HOST_SECTION')).toBe('Hosts')
    expect(canonicalSectionType('PHOTO_GALLERY')).toBe('PhotoGrid')
    expect(canonicalSectionType('RSVP_SECTION')).toBe('RSVPConfirmation')
    expect(canonicalSectionType('MOMENTS_WALL')).toBe('MomentWall')
    expect(canonicalSectionType('CONTACT_SECTION')).toBe('Contact')
    expect(canonicalSectionType('LEGACY_HERO')).toBe('HERO')
    expect(canonicalSectionType('LEGACY_TEXT')).toBe('TEXT')
    expect(canonicalSectionType('LEGACY_GALLERY')).toBe('GALLERY')
    expect(canonicalSectionType('LEGACY_MAP')).toBe('MAP')
    expect(canonicalSectionType('LEGACY_MUSIC')).toBe('MUSIC')
  })
})
