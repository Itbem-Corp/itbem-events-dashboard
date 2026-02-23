'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { EventSection } from '@/models/EventSection'

import { Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import {
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Cog6ToothIcon,
  PhotoIcon as PhotoIconSmall,
} from '@heroicons/react/16/solid'
import {
  DocumentTextIcon,
  MapPinIcon,
  CalendarDaysIcon,
  MusicalNoteIcon,
  SparklesIcon,
  ClockIcon,
  AcademicCapIcon,
  UserGroupIcon,
  Squares2X2Icon,
  EnvelopeIcon,
  BuildingLibraryIcon,
  PhotoIcon as PhotoIconLarge,
} from '@heroicons/react/20/solid'
import { EmptyState } from '@/components/ui/empty-state'
import { EventSectionResources } from '@/components/events/event-section-resources'

// Image slots per SDUI type (for showing media button indicator)
const TYPES_WITH_IMAGES = new Set([
  'GraduationHero', 'EventVenue', 'Reception', 'GraduatesList', 'PhotoGrid', 'RSVPConfirmation', 'GALLERY',
])

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
  // Classic types
  {
    type: 'HERO',
    label: 'Portada clásica',
    icon: SparklesIcon,
    description: 'Imagen principal y título del evento',
    color: 'zinc',
    hasConfig: false,
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
    hasConfig: false,
  },
  {
    type: 'SCHEDULE',
    label: 'Agenda',
    icon: CalendarDaysIcon,
    description: 'Horario e itinerario del evento',
    color: 'zinc',
    hasConfig: true,
  },
  {
    type: 'MUSIC',
    label: 'Música',
    icon: MusicalNoteIcon,
    description: 'Playlist o lista de canciones',
    color: 'zinc',
    hasConfig: false,
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

function getSectionTypeDef(type: string): SectionTypeDef {
  const found = SECTION_TYPES.find((t) => t.type === type)
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
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={String(value[key] ?? '')}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      ) : (
        <input
          type={type}
          value={String(value[key] ?? '')}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}
    </div>
  )

  switch (componentType) {
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
      return (
        <div>
          {field('closing', 'Texto de cierre (ej. "¡Celebremos juntos!")')}
          <p className="mt-2 text-xs text-zinc-600">
            La lista de nombres se gestiona en la pestaña <span className="text-zinc-400">Invitados</span>.
          </p>
        </div>
      )

    case 'TEXT':
    case 'SCHEDULE':
      return (
        <div>
          {field('title', 'Título de la sección')}
          {field('content', 'Contenido / descripción', 'textarea')}
        </div>
      )

    default:
      return (
        <p className="text-xs text-zinc-600 py-2">
          Esta sección no requiere configuración adicional. Las imágenes y recursos
          se gestionan directamente desde el panel de recursos.
        </p>
      )
  }
}

// ─── Add Section Panel ────────────────────────────────────────────────────────

const SDUI_TYPES = SECTION_TYPES.slice(0, 7)
const CLASSIC_TYPES = SECTION_TYPES.slice(7)

interface AddSectionPanelProps {
  eventId: string
  existingCount: number
  onAdded: () => void
  onCancel: () => void
}

function AddSectionPanel({ eventId, existingCount, onAdded, onCancel }: AddSectionPanelProps) {
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
      await api.post(`/events/${eventId}/sections`, {
        name: sectionName,
        title: sectionName,
        component_type: selectedType,
        type: selectedType,
        order: existingCount + 1,
        is_visible: true,
        config: Object.keys(config).length > 0 ? config : undefined,
      })
      await globalMutate(`/events/${eventId}/sections`)
      toast.success('Sección agregada')
      onAdded()
    } catch {
      toast.error('Error al agregar la sección')
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
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-5">
        <Subheading>Agregar sección</Subheading>

        {/* Tab: SDUI vs Classic */}
        <div className="flex rounded-lg overflow-hidden border border-white/10 w-fit">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {(tab === 'sdui' ? SDUI_TYPES : CLASSIC_TYPES).map((st) => {
            const Icon = st.icon
            const isSelected = selectedType === st.type
            const colorCls = isSelected
              ? COLOR_MAP[st.color] ?? COLOR_MAP.zinc
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
                <span className="text-xs font-medium leading-tight">{st.label}</span>
                <span className="text-[10px] text-zinc-600 leading-tight">{st.description}</span>
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
              className="space-y-4 pt-2 border-t border-white/10"
            >
              {/* Section name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nombre de la sección <span className="text-zinc-600">(para el admin)</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedDef?.label ?? selectedType}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Config form */}
              {selectedDef?.hasConfig && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-3 uppercase tracking-wider">
                    Configuración de contenido
                  </label>
                  <ConfigForm
                    componentType={selectedType}
                    value={config}
                    onChange={setConfig}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
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
  const [config, setConfig] = useState<Record<string, unknown>>(
    (section.config ?? section.content_json ?? {}) as Record<string, unknown>
  )
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
      className="rounded-xl border border-white/10 bg-zinc-900 p-5 space-y-5 shadow-xl"
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
      <div className="flex gap-2 justify-end border-t border-white/5 pt-4">
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
}: SectionRowProps) {
  const componentType = section.component_type || section.type || 'CUSTOM'
  const def = getSectionTypeDef(componentType)
  const Icon = def.icon
  const colorCls = COLOR_MAP[def.color] ?? COLOR_MAP.zinc
  const hasConfig = def.hasConfig
  const hasImages = TYPES_WITH_IMAGES.has(componentType)

  // Check if section has existing config data
  const configData = section.config ?? section.content_json
  const hasExistingConfig = configData && Object.keys(configData).length > 0

  return (
    <motion.div layout>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -8, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className={[
          'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
          section.is_visible
            ? 'border-white/10 bg-zinc-900/50'
            : 'border-white/5 bg-zinc-900/20 opacity-60',
        ].join(' ')}
      >
        {/* Order controls */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Subir"
          >
            <ArrowUpIcon className="size-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Bajar"
          >
            <ArrowDownIcon className="size-3" />
          </button>
        </div>

        {/* Order number */}
        <span className="text-xs text-zinc-700 w-4 text-center tabular-nums shrink-0">
          {index + 1}
        </span>

        {/* Icon */}
        <div className={['flex size-8 shrink-0 items-center justify-center rounded-lg border', colorCls].join(' ')}>
          <Icon className="size-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={['text-sm font-medium truncate', section.is_visible ? 'text-zinc-200' : 'text-zinc-500'].join(' ')}>
              {section.name}
            </p>
            {hasExistingConfig && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-lime-500/10 text-lime-400 border border-lime-500/20">
                Config ✓
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600">{def.label}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Media button */}
          {hasImages && (
            <button
              onClick={onToggleMedia}
              className={[
                'p-1.5 rounded-lg transition-colors',
                isMediaOpen
                  ? 'text-pink-400 bg-pink-500/10'
                  : 'text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10',
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
                'p-1.5 rounded-lg transition-colors',
                isEditOpen
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10',
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
              'p-1.5 rounded-lg transition-colors',
              section.is_visible
                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                : 'text-zinc-700 hover:text-zinc-400 hover:bg-white/5',
            ].join(' ')}
            aria-label={section.is_visible ? 'Ocultar sección' : 'Mostrar sección'}
          >
            {section.is_visible ? <EyeIcon className="size-4" /> : <EyeSlashIcon className="size-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-700 hover:text-pink-400 hover:bg-pink-500/10 transition-colors"
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
            <div className="ml-10 mt-2">
              <ConfigEditDrawer
                section={section}
                onSave={onSaveConfig}
                onClose={onToggleEdit}
              />
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
            <div className="ml-10 mt-2">
              <EventSectionResources
                section={section}
                onClose={onToggleMedia}
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
}

export function EventSectionsManager({ eventId }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mediaId, setMediaId] = useState<string | null>(null)

  const { data: sections = [], isLoading } = useSWR<EventSection[]>(
    eventId ? `/events/${eventId}/sections` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const sorted = [...sections].sort((a, b) => a.order - b.order)

  const revalidate = () => globalMutate(`/events/${eventId}/sections`)

  const handleMove = async (section: EventSection, direction: 'up' | 'down') => {
    const currentIndex = sorted.findIndex((s) => s.id === section.id)
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const swapSection = sorted[swapIndex]

    try {
      await Promise.all([
        api.put(`/sections/${section.id}`, {
          ...section,
          order: swapSection.order,
          component_type: section.component_type || section.type,
        }),
        api.put(`/sections/${swapSection.id}`, {
          ...swapSection,
          order: section.order,
          component_type: swapSection.component_type || swapSection.type,
        }),
      ])
      await revalidate()
    } catch {
      toast.error('Error al reordenar las secciones')
    }
  }

  const handleToggleVisibility = async (section: EventSection) => {
    try {
      await api.put(`/sections/${section.id}`, {
        ...section,
        component_type: section.component_type || section.type,
        is_visible: !section.is_visible,
      })
      await revalidate()
      toast.success(section.is_visible ? 'Sección ocultada' : 'Sección visible')
    } catch {
      toast.error('Error al actualizar la sección')
    }
  }

  const handleDelete = async (section: EventSection) => {
    if (!window.confirm(`¿Eliminar la sección "${section.component_type}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/sections/${section.id}`)
      if (editingId === section.id) setEditingId(null)
      if (mediaId === section.id) setMediaId(null)
      await revalidate()
      toast.success('Sección eliminada')
    } catch {
      toast.error('Error al eliminar la sección')
    }
  }

  const handleSaveConfig = async (section: EventSection, config: Record<string, unknown>) => {
    await api.put(`/sections/${section.id}`, {
      ...section,
      component_type: section.component_type || section.type,
      config,
    })
    await revalidate()
    toast.success('Configuración guardada')
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-zinc-800/50 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  const visibleCount = sorted.filter((s) => s.is_visible).length

  return (
    <div className="space-y-4">
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
                onDelete={() => handleDelete(section)}
                onToggleEdit={() => {
                  setEditingId(editingId === section.id ? null : section.id)
                  setMediaId(null)
                }}
                onToggleMedia={() => {
                  setMediaId(mediaId === section.id ? null : section.id)
                  setEditingId(null)
                }}
                onSaveConfig={(config) => handleSaveConfig(section, config)}
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
            existingCount={sorted.length}
            onAdded={() => setShowAdd(false)}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      {!showAdd && sorted.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-500 hover:text-zinc-300 hover:border-white/20 hover:bg-white/5 transition-all w-full justify-center"
        >
          <PlusIcon className="size-4" />
          Agregar sección
        </button>
      )}

      {sorted.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">
          {sorted.length} sección{sorted.length !== 1 ? 'es' : ''} ·{' '}
          {visibleCount} visible{visibleCount !== 1 ? 's' : ''}
          {sorted.filter((s) => {
            const configData = s.config ?? s.content_json
            return configData && Object.keys(configData).length > 0
          }).length > 0 && (
            <> · <span className="text-lime-600">
              {sorted.filter((s) => {
                const configData = s.config ?? s.content_json
                return configData && Object.keys(configData).length > 0
              }).length} con config
            </span></>
          )}
        </p>
      )}
    </div>
  )
}
