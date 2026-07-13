import { canonicalSectionType } from '@/lib/section-type-aliases'
import {
  AcademicCapIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PhotoIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeviceMode = 'desktop' | 'tablet' | 'mobile'
export type PanelId = 'sections' | 'config' | 'design'

// ─── Device frame dimensions ─────────────────────────────────────────────────

export const DEVICE_DIMENSIONS: Record<DeviceMode, { maxW: string }> = {
  desktop: { maxW: '100%' },
  tablet: { maxW: '768px' },
  mobile: { maxW: '390px' },
}

// ─── Shared input styles ─────────────────────────────────────────────────────

export const inputCls =
  'w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500'

export const labelCls = 'block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide'

// ─── Section type metadata ───────────────────────────────────────────────────

export interface TypeMeta {
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorCls: string // badge/icon box classes
  iconBoxCls: string // colored icon container
  description: string
}

const meta = (
  label: string,
  icon: React.ComponentType<{ className?: string }>,
  color: string,
  description: string
): TypeMeta => {
  const colorMap: Record<string, { colorCls: string; iconBoxCls: string }> = {
    indigo: {
      colorCls: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      iconBoxCls: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
    },
    violet: {
      colorCls: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
      iconBoxCls: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    },
    emerald: {
      colorCls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      iconBoxCls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    },
    amber: {
      colorCls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      iconBoxCls: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    },
    sky: {
      colorCls: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      iconBoxCls: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    },
    pink: {
      colorCls: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      iconBoxCls: 'border-pink-500/30 bg-pink-500/10 text-pink-400',
    },
    lime: {
      colorCls: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
      iconBoxCls: 'border-lime-500/30 bg-lime-500/10 text-lime-400',
    },
    zinc: {
      colorCls: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      iconBoxCls: 'border-zinc-700 bg-zinc-800 text-zinc-400',
    },
  }
  const c = colorMap[color] ?? colorMap.zinc
  return { label, icon, ...c, description }
}

export const TYPE_META: Record<string, TypeMeta> = {
  CountdownHeader: meta('Cuenta regresiva', ClockIcon, 'indigo', 'Encabezado animado con cuenta regresiva al evento'),
  GraduationHero: meta(
    'Hero graduacion',
    AcademicCapIcon,
    'violet',
    'Portada principal con nombre del evento y escuela'
  ),
  EventVenue: meta('Lugar del evento', MapPinIcon, 'emerald', 'Descripcion, fecha, direccion y mapa del venue'),
  Reception: meta('Recepcion / Fiesta', BuildingLibraryIcon, 'amber', 'Venue de recepcion o fiesta con mapa'),
  GraduatesList: meta('Lista de graduados', UserGroupIcon, 'sky', 'Lista animada de asistentes o graduados'),
  PhotoGrid: meta('Galeria de fotos', Squares2X2Icon, 'pink', 'Cuadricula de imagenes del evento'),
  RSVPConfirmation: meta('Confirmacion RSVP', EnvelopeIcon, 'lime', 'Formulario de confirmacion de asistencia'),
  Agenda: meta('Agenda', CalendarDaysIcon, 'indigo', 'Horario e itinerario del evento'),
  AgendaSection: meta('Agenda', CalendarDaysIcon, 'indigo', 'Alias publico del componente AgendaSection'),
  MomentWall: meta('Muro de momentos', PhotoIcon, 'pink', 'Galeria publica de fotos y videos del evento'),
  Hosts: meta('Anfitriones', UserGroupIcon, 'sky', 'Lista publica de anfitriones o personas destacadas'),
  HostSection: meta('Anfitriones', UserGroupIcon, 'sky', 'Alias singular legacy para anfitriones'),
  HostsSection: meta('Anfitriones', UserGroupIcon, 'sky', 'Lista publica de anfitriones o personas destacadas'),
  Contact: meta('Contacto', DocumentTextIcon, 'zinc', 'Texto de contacto o informacion adicional'),
  ContactSection: meta('Contacto', DocumentTextIcon, 'zinc', 'Texto de contacto o informacion adicional'),
  HERO: meta('Portada clasica', SparklesIcon, 'zinc', 'Imagen principal y titulo del evento'),
  LegacyHero: meta('Portada clasica', SparklesIcon, 'zinc', 'Alias legacy de portada clasica'),
  TEXT: meta('Texto libre', DocumentTextIcon, 'zinc', 'Seccion de texto y descripcion'),
  LegacyText: meta('Texto libre', DocumentTextIcon, 'zinc', 'Alias legacy de texto libre'),
  GALLERY: meta('Galeria', PhotoIcon, 'zinc', 'Galeria de fotos y videos'),
  LegacyGallery: meta('Galeria', PhotoIcon, 'zinc', 'Alias legacy de galeria'),
  MAP: meta('Mapa', MapPinIcon, 'zinc', 'Mapa embebido del evento'),
  LegacyMap: meta('Mapa', MapPinIcon, 'zinc', 'Alias legacy de mapa'),
  SCHEDULE: meta('Agenda legacy', CalendarDaysIcon, 'zinc', 'Seccion antigua de agenda'),
  LegacySchedule: meta('Agenda legacy', CalendarDaysIcon, 'zinc', 'Alias legacy de agenda'),
  MUSIC: meta('Musica', MusicalNoteIcon, 'zinc', 'Playlist o lista de canciones'),
  LegacyMusic: meta('Musica', MusicalNoteIcon, 'zinc', 'Alias legacy de musica'),
}

export function getTypeMeta(componentType: string): TypeMeta {
  const canonicalType = canonicalSectionType(componentType)
  return (
    TYPE_META[canonicalType] ?? {
      label: componentType,
      icon: DocumentTextIcon,
      colorCls: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      iconBoxCls: 'border-zinc-700 bg-zinc-800 text-zinc-400',
      description: 'Seccion personalizada',
    }
  )
}
