'use client'

import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventSectionsPath, eventSectionsReorderPath, sectionPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import {
  removeEventSectionCacheValue,
  reorderEventSectionsCacheValue,
  upsertEventSectionCacheValue,
} from '@/lib/event-section-cache'
import { hasEventSectionConfig, readEventSectionConfig } from '@/lib/event-section-config'
import { sortEventSectionsByRenderOrder } from '@/lib/event-section-order'
import { canonicalSectionType } from '@/lib/section-type-aliases'
import type { EventSection } from '@/models/EventSection'
import { toast } from 'sonner'

import { Button } from '@/components/button'
import { sectionImageSlotsForType } from '@/lib/section-image-slots'
import { Subheading } from '@/components/heading'
import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { EmptyState } from '@/components/ui/empty-state'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  Cog6ToothIcon,
  EyeIcon,
  EyeSlashIcon,
  PhotoIcon as PhotoIconSmall,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import {
  AcademicCapIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PhotoIcon as PhotoIconLarge,
  SparklesIcon,
  Squares2X2Icon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'

const EventSectionResources = dynamic(
  () => import('@/components/events/event-section-resources').then((module) => module.EventSectionResources),
  { ssr: false, loading: () => <div className="h-44 animate-pulse rounded-xl bg-zinc-900/60" /> }
)

export function sectionTypeHasImages(componentType: string): boolean {
  return sectionImageSlotsForType(componentType).length > 0
}

// ─── SDUI Section types aligned with public frontend registry ─────────────────

const SECTION_TYPES = [
  // SDUI — Public frontend components
  {
    type: 'CountdownHeader',
    label: 'Cuenta regresiva',
    icon: ClockIcon,
    description: 'Encabezado animado con cuenta regresiva al evento',
    color: 'indigo',
    hasConfig: true,
  },
  {
    type: 'GraduationHero',
    label: 'Hero de graduación',
    icon: AcademicCapIcon,
    description: 'Portada principal con nombre del evento y escuela',
    color: 'violet',
    hasConfig: true,
  },
  {
    type: 'EventVenue',
    label: 'Lugar del evento',
    icon: MapPinIcon,
    description: 'Descripción, fecha, dirección y mapa del venue',
    color: 'emerald',
    hasConfig: true,
  },
  {
    type: 'Reception',
    label: 'Recepción / Fiesta',
    icon: BuildingLibraryIcon,
    description: 'Venue de recepción o fiesta con mapa',
    color: 'amber',
    hasConfig: true,
  },
  {
    type: 'GraduatesList',
    label: 'Lista de graduados',
    icon: UserGroupIcon,
    description: 'Lista animada de asistentes o graduados',
    color: 'sky',
    hasConfig: true,
  },
  {
    type: 'PhotoGrid',
    label: 'Galería de fotos',
    icon: Squares2X2Icon,
    description: 'Cuadrícula 2+3 de imágenes del evento',
    color: 'pink',
    hasConfig: false,
  },
  {
    type: 'RSVPConfirmation',
    label: 'Confirmación RSVP',
    icon: EnvelopeIcon,
    description: 'Formulario de confirmación de asistencia personalizado',
    color: 'lime',
    hasConfig: false,
  },
  {
    type: 'Agenda',
    label: 'Agenda',
    icon: CalendarDaysIcon,
    description: 'Horario e itinerario del evento',
    color: 'indigo',
    hasConfig: true,
  },
  {
    type: 'MomentWall',
    label: 'Muro de momentos',
    icon: PhotoIconLarge,
    description: 'Galería pública de fotos y videos del evento',
    color: 'pink',
    hasConfig: false,
  },
  {
    type: 'Hosts',
    label: 'Anfitriones',
    icon: UserGroupIcon,
    description: 'Lista publica de anfitriones o personas destacadas',
    color: 'sky',
    hasConfig: true,
  },
  {
    type: 'Contact',
    label: 'Contacto',
    icon: DocumentTextIcon,
    description: 'Texto de contacto o informacion adicional',
    color: 'zinc',
    hasConfig: true,
  },
  // Classic types
  {
    type: 'HERO',
    label: 'Portada clásica',
    icon: SparklesIcon,
    description: 'Imagen principal y título del evento',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'TEXT',
    label: 'Texto libre',
    icon: DocumentTextIcon,
    description: 'Sección de texto y descripción',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'GALLERY',
    label: 'Galería',
    icon: PhotoIconLarge,
    description: 'Galería de fotos y videos',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'MAP',
    label: 'Mapa',
    icon: MapPinIcon,
    description: 'Mapa embebido del evento',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'SCHEDULE',
    label: 'Agenda legacy',
    icon: CalendarDaysIcon,
    description: 'Seccion antigua de agenda con texto libre',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'MUSIC',
    label: 'Música',
    icon: MusicalNoteIcon,
    description: 'Playlist o lista de canciones',
    color: 'zinc',
    hasConfig: true,
  },
] as const

type SectionTypeDef = {
  type: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  color: string
  hasConfig: boolean
}

const COLOR_MAP: Record<string, string> = {
  indigo: 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400',
  violet: 'border-violet-500/30 bg-violet-500/5 text-violet-400',
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
  amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  sky: 'border-sky-500/30 bg-sky-500/5 text-sky-400',
  pink: 'border-pink-500/30 bg-pink-500/5 text-pink-400',
  lime: 'border-lime-500/30 bg-lime-500/5 text-lime-400',
  zinc: 'border-white/10 bg-zinc-800/50 text-zinc-400',
}

export { canonicalSectionType }

export function getSectionTypeDef(type: string): SectionTypeDef {
  const found = SECTION_TYPES.find((t) => t.type === canonicalSectionType(type))
  if (found) return found as SectionTypeDef
  return {
    type,
    label: type,
    icon: DocumentTextIcon,
    description: 'Sección personalizada',
    color: 'zinc',
    hasConfig: true,
  }
}

// ─── Config Forms ─────────────────────────────────────────────────────────────

interface ConfigFormProps {
  componentType: string
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
}

function ConfigForm({ componentType, value, onChange }: ConfigFormProps) {
  const field = (key: string, label: string, type: 'text' | 'datetime-local' | 'url' | 'textarea' = 'text') => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={String(value[key] ?? '')}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          rows={3}
          className="w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      ) : (
        <input
          type={type}
          value={String(value[key] ?? '')}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      )}
    </div>
  )

  const agendaItems = Array.isArray(value.items) ? (value.items as Record<string, unknown>[]) : []

  const updateAgendaItem = (index: number, key: string, nextValue: string) => {
    const items = [...agendaItems]
    items[index] = { ...(items[index] ?? {}), [key]: nextValue }
    onChange({ ...value, items })
  }

  const addAgendaItem = () => {
    onChange({
      ...value,
      items: [...agendaItems, { time: '', title: '', icon: 'default', location: '' }],
    })
  }

  const removeAgendaItem = (index: number) => {
    onChange({
      ...value,
      items: agendaItems.filter((_, i) => i !== index),
    })
  }

  switch (canonicalSectionType(componentType)) {
    case 'CountdownHeader':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {field('heading', 'Encabezado / Título del evento')}
          {field('targetDate', 'Fecha objetivo del evento', 'datetime-local')}
        </div>
      )

    case 'GraduationHero':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {field('title', 'Título principal (ej. "Generación 2025")')}
          {field('years', 'Años (ej. "2022-2025")')}
          {field('school', 'Nombre de la escuela')}
        </div>
      )

    case 'EventVenue':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('date', 'Fecha del evento (texto display, ej. "Sábado 21 de junio 2025")')}
            {field('venueText', 'Nombre y dirección del venue')}
          </div>
          {field('text', 'Descripción general del evento', 'textarea')}
          {field('mapUrl', 'URL embed de Google Maps (iframe src)', 'url')}
          <p className="text-xs text-zinc-600">
            Para obtener el embed: Google Maps → Compartir → Insertar un mapa → Copiar el src del iframe.
          </p>
        </div>
      )

    case 'Reception':
      return (
        <div className="space-y-3">
          {field('venueText', 'Nombre y dirección del venue de recepción')}
          {field('mapUrl', 'URL embed de Google Maps (iframe src)', 'url')}
          <p className="text-xs text-zinc-600">
            Para obtener el embed: Google Maps → Compartir → Insertar un mapa → Copiar el src del iframe.
          </p>
        </div>
      )

    case 'GraduatesList':
    case 'Hosts':
    case 'HostsSection':
      return (
        <div>
          {field('closing', 'Texto de cierre (ej. "¡Celebremos juntos!")')}
          <p className="mt-2 text-xs text-zinc-600">
            La lista de nombres se gestiona en la pestaña <span className="text-zinc-400">Invitados</span>.
          </p>
        </div>
      )

    case 'HERO':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('title', 'Título principal')}
            {field('subtitle', 'Subtítulo')}
          </div>
          {field('content', 'Texto de portada', 'textarea')}
        </div>
      )

    case 'GALLERY':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {field('title', 'Título de galería')}
          {field('subtitle', 'Subtítulo')}
        </div>
      )

    case 'MAP':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('title', 'Titulo del mapa')}
            {field('mapUrl', 'URL embed de Google Maps (iframe src)', 'url')}
          </div>
          {field('content', 'Texto de apoyo', 'textarea')}
          <p className="text-xs text-zinc-600">
            Para obtener el embed: Google Maps - Compartir - Insertar un mapa - Copiar el src del iframe.
          </p>
        </div>
      )

    case 'MUSIC':
      return (
        <div>
          {field('musicUrl', 'URL de audio o playlist', 'url')}
          <p className="mt-2 text-xs text-zinc-600">
            Si el evento ya tiene música global configurada, esta sección puede quedar vacía.
          </p>
        </div>
      )

    case 'Agenda':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('title', 'Título de la sección')}
            {field('subtitle', 'Subtítulo')}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-zinc-400">Actividades</label>
              <button
                type="button"
                onClick={addAgendaItem}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
              >
                Agregar
              </button>
            </div>
            {agendaItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-zinc-600">
                Agrega al menos una actividad para que la agenda se renderice en la invitación pública.
              </p>
            ) : (
              agendaItems.map((item, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-white/10 bg-zinc-950 p-3">
                  <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                    <input
                      type="text"
                      value={String(item.time ?? '')}
                      onChange={(e) => updateAgendaItem(index, 'time', e.target.value)}
                      placeholder="14:00"
                      className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={String(item.title ?? '')}
                      onChange={(e) => updateAgendaItem(index, 'title', e.target.value)}
                      placeholder="Ceremonia"
                      className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={String(item.location ?? '')}
                    onChange={(e) => updateAgendaItem(index, 'location', e.target.value)}
                    placeholder="Ubicación"
                    className="w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={String(item.icon ?? 'default')}
                      onChange={(e) => updateAgendaItem(index, 'icon', e.target.value)}
                      className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="default">General</option>
                      <option value="ceremony">Ceremonia</option>
                      <option value="reception">Recepción</option>
                      <option value="dinner">Cena</option>
                      <option value="party">Fiesta</option>
                      <option value="music">Música</option>
                      <option value="photo">Fotos</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeAgendaItem(index)}
                      className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )

    case 'SCHEDULE':
    case 'TEXT':
    case 'Contact':
    case 'ContactSection':
      return (
        <div>
          {field('title', 'Título de la sección')}
          {field('content', 'Contenido / descripción', 'textarea')}
        </div>
      )

    default:
      return (
        <p className="py-2 text-xs text-zinc-600">
          Esta sección no requiere configuración adicional. Las imágenes y recursos se gestionan directamente desde el
          panel de recursos.
        </p>
      )
  }
}

// ─── Add Section Panel ────────────────────────────────────────────────────────

const CLASSIC_TYPE_NAMES = new Set(['HERO', 'TEXT', 'GALLERY', 'MAP', 'SCHEDULE', 'MUSIC', 'Contact', 'ContactSection'])
const SDUI_TYPES = SECTION_TYPES.filter((t) => !CLASSIC_TYPE_NAMES.has(t.type))
const CLASSIC_TYPES = SECTION_TYPES.filter((t) => CLASSIC_TYPE_NAMES.has(t.type))

interface AddSectionPanelProps {
  eventId: string
  nextOrder: number
  onAdded: (section: EventSection | null) => Promise<void>
  onCancel: () => void
}

function AddSectionPanel({ eventId, nextOrder, onAdded, onCancel }: AddSectionPanelProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'sdui' | 'classic'>('sdui')

  const selectedDef = selectedType ? getSectionTypeDef(selectedType) : null

  const handleAdd = async () => {
    if (!selectedType) {
      toast.error('Selecciona un tipo de sección')
      return
    }
    const sectionName = name.trim() || (selectedDef?.label ?? selectedType)
    setLoading(true)
    try {
      const res = await api.post<EventSection>(eventSectionsPath(eventId), {
        name: sectionName,
        title: sectionName,
        component_type: selectedType,
        type: selectedType,
        order: nextOrder,
        is_visible: true,
        config: Object.keys(config).length > 0 ? config : undefined,
      })
      const created = readApiData<EventSection | null>(res.data)
      await onAdded(created)
      toast.success('Sección agregada')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al agregar la sección'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="space-y-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
        <Subheading>Agregar sección</Subheading>

        {/* Tab: SDUI vs Classic */}
        <div className="flex w-fit overflow-hidden rounded-lg border border-white/10">
          <button
            onClick={() => setTab('sdui')}
            className={[
              'px-4 py-1.5 text-xs font-medium transition-colors',
              tab === 'sdui' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            Componentes SDUI
          </button>
          <button
            onClick={() => setTab('classic')}
            className={[
              'px-4 py-1.5 text-xs font-medium transition-colors',
              tab === 'classic' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            Clásicos
          </button>
        </div>

        {/* Type selector grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(tab === 'sdui' ? SDUI_TYPES : CLASSIC_TYPES).map((st) => {
            const Icon = st.icon
            const isSelected = selectedType === st.type
            const colorCls = isSelected
              ? (COLOR_MAP[st.color] ?? COLOR_MAP.zinc)
              : 'border-white/10 bg-zinc-900/50 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
            return (
              <button
                key={st.type}
                onClick={() => {
                  setSelectedType(st.type)
                  setConfig({})
                  if (!name || name === getSectionTypeDef(selectedType ?? '').label) {
                    setName(st.label)
                  }
                }}
                className={[
                  'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
                  colorCls,
                ].join(' ')}
              >
                <Icon className="size-5" />
                <span className="text-xs leading-tight font-medium">{st.label}</span>
                <span className="text-[10px] leading-tight text-zinc-600">{st.description}</span>
              </button>
            )
          })}
        </div>

        {/* Selected type — name + config */}
        <AnimatePresence>
          {selectedType && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="space-y-4 border-t border-white/10 pt-2"
            >
              {/* Section name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Nombre de la sección <span className="text-zinc-600">(para el admin)</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedDef?.label ?? selectedType}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Config form */}
              {selectedDef?.hasConfig && (
                <div>
                  <label className="mb-3 block text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Configuración de contenido
                  </label>
                  <ConfigForm componentType={selectedType} value={config} onChange={setConfig} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 border-t border-white/5 pt-2">
          <Button plain onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={loading || !selectedType}>
            {loading ? 'Agregando…' : 'Agregar sección'}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Section Config Edit Drawer ───────────────────────────────────────────────

interface ConfigEditDrawerProps {
  section: EventSection
  onSave: (config: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

function ConfigEditDrawer({ section, onSave, onClose }: ConfigEditDrawerProps) {
  const componentType = section.component_type || section.type || ''
  const [config, setConfig] = useState<Record<string, unknown>>(() => readEventSectionConfig(section))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const def = getSectionTypeDef(componentType)
  const colorCls = COLOR_MAP[def.color] ?? COLOR_MAP.zinc
  const Icon = def.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="space-y-5 rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={['flex size-9 shrink-0 items-center justify-center rounded-xl border', colorCls].join(' ')}>
          <Icon className="size-4.5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">{section.name}</p>
          <p className="text-xs text-zinc-500">{def.label} — Configuración</p>
        </div>
      </div>

      {/* Form */}
      <div className="border-t border-white/5 pt-4">
        <ConfigForm componentType={componentType} value={config} onChange={setConfig} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
        <Button plain onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar config'}
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Section Row ──────────────────────────────────────────────────────────────

interface SectionRowProps {
  section: EventSection
  index: number
  total: number
  isEditOpen: boolean
  isMediaOpen: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleVisibility: () => void
  onDelete: () => void
  onToggleEdit: () => void
  onToggleMedia: () => void
  onSaveConfig: (config: Record<string, unknown>) => Promise<void>
  onResourcesChanged?: () => void
}

function SectionRow({
  section,
  index,
  total,
  isEditOpen,
  isMediaOpen,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDelete,
  onToggleEdit,
  onToggleMedia,
  onSaveConfig,
  onResourcesChanged,
}: SectionRowProps) {
  const componentType = section.component_type || section.type || 'CUSTOM'
  const def = getSectionTypeDef(componentType)
  const Icon = def.icon
  const colorCls = COLOR_MAP[def.color] ?? COLOR_MAP.zinc
  const hasConfig = def.hasConfig
  const hasImages = sectionTypeHasImages(componentType)

  // Check if section has existing config data
  const hasExistingConfig = hasEventSectionConfig(section)

  return (
    <motion.div layout>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -8, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className={[
          'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
          section.is_visible ? 'border-white/10 bg-zinc-900/50' : 'border-white/5 bg-zinc-900/20 opacity-60',
        ].join(' ')}
      >
        {/* Order controls */}
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-1 text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-20"
            aria-label="Subir"
          >
            <ArrowUpIcon className="size-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded p-1 text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-20"
            aria-label="Bajar"
          >
            <ArrowDownIcon className="size-3" />
          </button>
        </div>

        {/* Order number */}
        <span className="w-4 shrink-0 text-center text-xs text-zinc-700 tabular-nums">{index + 1}</span>

        {/* Icon */}
        <div className={['flex size-8 shrink-0 items-center justify-center rounded-lg border', colorCls].join(' ')}>
          <Icon className="size-4" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={['truncate text-sm font-medium', section.is_visible ? 'text-zinc-200' : 'text-zinc-500'].join(
                ' '
              )}
            >
              {section.name}
            </p>
            {hasExistingConfig && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-lime-500/20 bg-lime-500/10 px-1.5 py-0.5 text-[10px] font-medium text-lime-400">
                <CheckIcon aria-hidden="true" className="size-3" />
                Configurada
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600">{def.label}</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Media button */}
          {hasImages && (
            <button
              onClick={onToggleMedia}
              className={[
                'rounded-lg p-1.5 transition-colors',
                isMediaOpen ? 'bg-pink-500/10 text-pink-400' : 'text-zinc-500 hover:bg-pink-500/10 hover:text-pink-400',
              ].join(' ')}
              aria-label="Gestionar imágenes"
              title="Gestionar imágenes"
            >
              <PhotoIconSmall className="size-4" />
            </button>
          )}
          {/* Config button (only if section type has config) */}
          {hasConfig && (
            <button
              onClick={onToggleEdit}
              className={[
                'rounded-lg p-1.5 transition-colors',
                isEditOpen
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-zinc-500 hover:bg-indigo-500/10 hover:text-indigo-400',
              ].join(' ')}
              aria-label="Editar configuración"
              title="Editar configuración"
            >
              <Cog6ToothIcon className="size-4" />
            </button>
          )}
          <button
            onClick={onToggleVisibility}
            className={[
              'rounded-lg p-1.5 transition-colors',
              section.is_visible
                ? 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                : 'text-zinc-700 hover:bg-white/5 hover:text-zinc-400',
            ].join(' ')}
            aria-label={section.is_visible ? 'Ocultar sección' : 'Mostrar sección'}
          >
            {section.is_visible ? <EyeIcon className="size-4" /> : <EyeSlashIcon className="size-4" />}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-pink-500/10 hover:text-pink-400"
            aria-label="Eliminar sección"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </motion.div>

      {/* Inline config editor */}
      <AnimatePresence>
        {isEditOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-10">
              <ConfigEditDrawer section={section} onSave={onSaveConfig} onClose={onToggleEdit} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline media manager */}
      <AnimatePresence>
        {isMediaOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-10">
              <EventSectionResources
                section={section}
                onClose={onToggleMedia}
                onResourcesChanged={onResourcesChanged}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  eventId: string
  initialSections?: EventSection[]
  onResourcesChanged?: () => void
  onPublicContentChanged?: () => void
}

export function EventSectionsManager({ eventId, initialSections, onResourcesChanged, onPublicContentChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [sectionToDelete, setSectionToDelete] = useState<EventSection | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const {
    data: rawSections,
    isLoading,
    isValidating,
    error: sectionsError,
    mutate: retrySections,
  } = useSWR<EventSection[]>(
    eventId ? eventSectionsPath(eventId) : null,
    fetcher,
    {
      ...responsiveListSwrOptions,
      fallbackData: initialSections,
      revalidateOnMount: !initialSections,
    }
  )

  const sectionsErrorState = getDataErrorState(sectionsError, rawSections)
  const sorted = useMemo(() => sortEventSectionsByRenderOrder(rawSections ?? []), [rawSections])
  const nextSectionOrder =
    sorted.reduce((max, section) => {
      const order = Number(section.order)
      return Math.max(max, Number.isFinite(order) ? order : 0)
    }, 0) + 1

  const notifyPublicContentChanged = () => {
    const callbacks = new Set([onPublicContentChanged, onResourcesChanged].filter(Boolean))
    callbacks.forEach((callback) => callback?.())
  }

  const handleMove = async (section: EventSection, direction: 'up' | 'down') => {
    const currentIndex = sorted.findIndex((s) => s.id === section.id)
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const swapSection = sorted[swapIndex]
    const updates = [
      { id: section.id, order: swapSection.order },
      { id: swapSection.id, order: section.order },
    ]

    const snapshot = rawSections
    await retrySections((current) => reorderEventSectionsCacheValue(current, updates) as EventSection[], false)
    try {
      await api.patch(eventSectionsReorderPath(eventId), { sections: updates })
      notifyPublicContentChanged()
    } catch (err: unknown) {
      await retrySections(snapshot, false)
      toast.error(getApiErrorMessage(err, 'Error al reordenar las secciones'))
    }
  }

  const handleToggleVisibility = async (section: EventSection) => {
    const nextVisible = !section.is_visible
    const snapshot = rawSections
    await retrySections(
      (current) =>
        upsertEventSectionCacheValue(current, { ...section, is_visible: nextVisible }) as EventSection[],
      false
    )
    try {
      const res = await api.put<EventSection>(sectionPath(section.id), { is_visible: nextVisible })
      const updated = readApiData<EventSection | null>(res.data)
      await retrySections(
        (current: unknown) =>
          upsertEventSectionCacheValue(
            current,
            cacheRecordId(updated) ? updated : { ...section, is_visible: nextVisible }
          ) as EventSection[],
        false
      )
      notifyPublicContentChanged()
      toast.success(section.is_visible ? 'Sección ocultada' : 'Sección visible')
    } catch (err: unknown) {
      await retrySections(snapshot, false)
      toast.error(getApiErrorMessage(err, 'Error al actualizar la sección'))
    }
  }

  const handleDelete = async () => {
    const section = sectionToDelete
    if (!section || isDeleting) return
    const snapshot = rawSections
    const previousEditingId = editingId
    const previousMediaId = mediaId
    setIsDeleting(true)
    setSectionToDelete(null)
    if (editingId === section.id) setEditingId(null)
    if (mediaId === section.id) setMediaId(null)
    await retrySections((current) => removeEventSectionCacheValue(current, section.id) as EventSection[], false)
    try {
      await api.delete(sectionPath(section.id))
      notifyPublicContentChanged()
      toast.success('Sección eliminada')
    } catch (err: unknown) {
      await retrySections(snapshot, false)
      setEditingId(previousEditingId)
      setMediaId(previousMediaId)
      toast.error(getApiErrorMessage(err, 'Error al eliminar la sección'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSaveConfig = async (section: EventSection, config: Record<string, unknown>) => {
    const snapshot = rawSections
    await retrySections(
      (current) => upsertEventSectionCacheValue(current, { ...section, config }) as EventSection[],
      false
    )
    try {
      const res = await api.put<EventSection>(sectionPath(section.id), { config })
      const updated = readApiData<EventSection | null>(res.data)
      await retrySections(
        (current: unknown) =>
          upsertEventSectionCacheValue(current, cacheRecordId(updated) ? updated : { ...section, config }) as EventSection[],
        false
      )
      notifyPublicContentChanged()
      toast.success('Configuración guardada')
    } catch (err: unknown) {
      await retrySections(snapshot, false)
      toast.error(getApiErrorMessage(err, 'Error al guardar la configuración'))
    }
  }

  if (isLoading && rawSections === undefined) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-800/50" />
        ))}
      </div>
    )
  }

  if (sectionsErrorState === 'fatal') {
    return (
      <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-10 text-center">
        <p className="text-sm font-medium text-amber-200">No pudimos cargar las secciones de la página.</p>
        <button
          type="button"
          onClick={() => void retrySections()}
          disabled={isValidating}
          aria-busy={isValidating}
          className="mt-3 text-xs font-semibold text-amber-300 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {isValidating ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  const visibleCount = sorted.filter((s) => s.is_visible).length

  return (
    <div className="space-y-4">
      {sectionsErrorState === 'stale' && (
        <StaleDataNotice
          label="las secciones"
          onRetry={() => void retrySections()}
          retrying={isValidating}
        />
      )}

      {/* Sections list */}
      {sorted.length === 0 && !showAdd ? (
        <EmptyState
          icon={SparklesIcon}
          title="Sin secciones"
          description="Diseña la estructura de tu página pública agregando secciones SDUI."
          action={{ label: 'Agregar primera sección', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {sorted.map((section, i) => (
              <SectionRow
                key={section.id}
                section={section}
                index={i}
                total={sorted.length}
                isEditOpen={editingId === section.id}
                isMediaOpen={mediaId === section.id}
                onMoveUp={() => handleMove(section, 'up')}
                onMoveDown={() => handleMove(section, 'down')}
                onToggleVisibility={() => handleToggleVisibility(section)}
                onDelete={() => setSectionToDelete(section)}
                onToggleEdit={() => {
                  setEditingId(editingId === section.id ? null : section.id)
                  setMediaId(null)
                }}
                onToggleMedia={() => {
                  setMediaId(mediaId === section.id ? null : section.id)
                  setEditingId(null)
                }}
                onSaveConfig={(config) => handleSaveConfig(section, config)}
                onResourcesChanged={notifyPublicContentChanged}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add section */}
      <AnimatePresence>
        {showAdd && (
          <AddSectionPanel
            eventId={eventId}
            nextOrder={nextSectionOrder}
            onAdded={async (created) => {
              if (created?.id) {
                await retrySections(
                  (current) => upsertEventSectionCacheValue(current, created) as EventSection[],
                  false
                )
              } else {
                await retrySections()
              }
              setShowAdd(false)
              notifyPublicContentChanged()
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      {!showAdd && sorted.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-500 transition-all hover:border-white/20 hover:bg-white/5 hover:text-zinc-300"
        >
          <PlusIcon className="size-4" />
          Agregar sección
        </button>
      )}

      {sorted.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          {sorted.length} sección{sorted.length !== 1 ? 'es' : ''} · {visibleCount} visible
          {visibleCount !== 1 ? 's' : ''}
          {sorted.filter((s) => {
            return hasEventSectionConfig(s)
          }).length > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="text-lime-600">
                {
                  sorted.filter((s) => {
                    return hasEventSectionConfig(s)
                  }).length
                }{' '}
                con config
              </span>
            </>
          )}
        </p>
      )}
      <ConfirmAlert
        open={Boolean(sectionToDelete)}
        title="¿Eliminar esta sección?"
        description={
          <>
            <strong className="text-zinc-200">
              {sectionToDelete ? getSectionTypeDef(sectionToDelete.component_type).label : ''}
            </strong>{' '}
            desaparecerá de la página pública. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar sección"
        busy={isDeleting}
        onClose={() => setSectionToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
