const SECTION_TYPE_ALIASES: Record<string, string> = {
  agenda: 'Agenda',
  agendasection: 'Agenda',
  schedule: 'SCHEDULE',
  legacyschedule: 'SCHEDULE',
  countdown: 'CountdownHeader',
  countdownheader: 'CountdownHeader',
  eventvenue: 'EventVenue',
  eventlocation: 'EventVenue',
  venue: 'EventVenue',
  reception: 'Reception',
  secondlocation: 'Reception',
  graduationhero: 'GraduationHero',
  graduationheader: 'GraduationHero',
  graduateslist: 'GraduatesList',
  host: 'Hosts',
  hosts: 'Hosts',
  hostsection: 'Hosts',
  hostssection: 'Hosts',
  photogrid: 'PhotoGrid',
  photogallery: 'PhotoGrid',
  rsvp: 'RSVPConfirmation',
  rsvpsection: 'RSVPConfirmation',
  rsvpconfirmation: 'RSVPConfirmation',
  momentwall: 'MomentWall',
  momentswall: 'MomentWall',
  contact: 'Contact',
  contactsection: 'Contact',
  hero: 'HERO',
  legacyhero: 'HERO',
  text: 'TEXT',
  legacytext: 'TEXT',
  gallery: 'GALLERY',
  legacygallery: 'GALLERY',
  map: 'MAP',
  legacymap: 'MAP',
  music: 'MUSIC',
  legacymusic: 'MUSIC',
}

export function normalizeSectionTypeToken(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export function canonicalSectionType(type: string): string {
  const trimmed = type.trim()
  if (!trimmed) return trimmed
  return SECTION_TYPE_ALIASES[normalizeSectionTypeToken(trimmed)] ?? trimmed
}
