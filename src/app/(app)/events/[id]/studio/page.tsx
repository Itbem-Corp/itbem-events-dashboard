'use client'

import { useState, useCallback, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { fetcher } from '@/lib/fetcher'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'
import type { EventSection } from '@/models/EventSection'
import type { EventConfig } from '@/models/EventConfig'

import {
  ChevronLeftIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  CheckIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  PaintBrushIcon,
  ListBulletIcon,
  PencilSquareIcon,
} from '@heroicons/react/20/solid'
import { Switch } from '@/components/switch'

const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://itbem.events'

// ─── Section type labels / colors ─────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CountdownHeader: 'Cuenta regresiva',
  GraduationHero: 'Hero graduación',
  EventVenue: 'Lugar',
  Reception: 'Recepción',
  GraduatesList: 'Graduados',
  PhotoGrid: 'Galería',
  RSVPConfirmation: 'RSVP',
  HERO: 'Portada',
  TEXT: 'Texto',
  GALLERY: 'Imágenes',
  SCHEDULE: 'Agenda',
  MUSIC: 'Música',
  MAP: 'Mapa',
}

const TYPE_COLORS: Record<string, string> = {
  CountdownHeader: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  GraduationHero: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  EventVenue: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Reception: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  GraduatesList: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  PhotoGrid: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  RSVPConfirmation: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
}

// ─── Device frame sizes ───────────────────────────────────────────────────────

type DeviceMode = 'desktop' | 'tablet' | 'mobile'

const DEVICE_DIMENSIONS: Record<DeviceMode, { width: string; maxW: string }> = {
  desktop: { width: '100%', maxW: '100%' },
  tablet: { width: '768px', maxW: '768px' },
  mobile: { width: '390px', maxW: '390px' },
}

type PanelId = 'sections' | 'config' | 'design'

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500'

const labelCls = 'block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide'

// ─── Section Config Editor ────────────────────────────────────────────────────

interface SectionConfigEditorProps {
  section: EventSection
  onSave: (section: EventSection, config: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

function SectionConfigEditor({ section, onSave, onClose }: SectionConfigEditorProps) {
  const typeName = section.component_type || section.type || ''
  const raw = (section.config ?? section.content_json ?? {}) as Record<string, unknown>
  const [values, setValues] = useState<Record<string, unknown>>(raw)
  const [saving, setSaving] = useState(false)

  const set = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(section, values)
    setSaving(false)
  }

  const str = (key: string, fallback = '') =>
    (values[key] as string | undefined) ?? fallback

  // ── Per-type field renderers ─────────────────────────────────────────────

  function renderFields() {
    switch (typeName) {
      case 'CountdownHeader':
        return (
          <>
            <div>
              <label className={labelCls}>Encabezado</label>
              <input
                type="text"
                className={inputCls}
                value={str('heading')}
                onChange={(e) => set('heading', e.target.value)}
                placeholder="¡Nos graduamos!"
              />
            </div>
            <div>
              <label className={labelCls}>Fecha objetivo</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={str('targetDate')}
                onChange={(e) => set('targetDate', e.target.value)}
              />
            </div>
          </>
        )

      case 'GraduationHero':
        return (
          <>
            <div>
              <label className={labelCls}>Título</label>
              <input
                type="text"
                className={inputCls}
                value={str('title')}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Generación 2025"
              />
            </div>
            <div>
              <label className={labelCls}>Años</label>
              <input
                type="text"
                className={inputCls}
                value={str('years')}
                onChange={(e) => set('years', e.target.value)}
                placeholder="2022-2025"
              />
            </div>
            <div>
              <label className={labelCls}>Escuela / institución</label>
              <input
                type="text"
                className={inputCls}
                value={str('school')}
                onChange={(e) => set('school', e.target.value)}
                placeholder="UNAM — Facultad de Ingeniería"
              />
            </div>
          </>
        )

      case 'EventVenue':
        return (
          <>
            <div>
              <label className={labelCls}>Texto introductorio</label>
              <textarea
                rows={2}
                className={inputCls}
                value={str('text')}
                onChange={(e) => set('text', e.target.value)}
                placeholder="Te esperamos en..."
              />
            </div>
            <div>
              <label className={labelCls}>Fecha y hora (texto)</label>
              <input
                type="text"
                className={inputCls}
                value={str('date')}
                onChange={(e) => set('date', e.target.value)}
                placeholder="Sábado 14 de junio, 19:00 hrs"
              />
            </div>
            <div>
              <label className={labelCls}>Lugar</label>
              <input
                type="text"
                className={inputCls}
                value={str('venueText')}
                onChange={(e) => set('venueText', e.target.value)}
                placeholder="Salón Los Arcos, CDMX"
              />
            </div>
            <div>
              <label className={labelCls}>URL de mapa (embed)</label>
              <input
                type="url"
                className={inputCls}
                value={str('mapUrl')}
                onChange={(e) => set('mapUrl', e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </>
        )

      case 'Reception':
        return (
          <>
            <div>
              <label className={labelCls}>Lugar de recepción</label>
              <input
                type="text"
                className={inputCls}
                value={str('venueText')}
                onChange={(e) => set('venueText', e.target.value)}
                placeholder="Restaurante El Patio"
              />
            </div>
            <div>
              <label className={labelCls}>URL de mapa (embed)</label>
              <input
                type="url"
                className={inputCls}
                value={str('mapUrl')}
                onChange={(e) => set('mapUrl', e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </>
        )

      case 'GraduatesList':
        return (
          <div>
            <label className={labelCls}>Texto de cierre</label>
            <textarea
              rows={3}
              className={inputCls}
              value={str('closing')}
              onChange={(e) => set('closing', e.target.value)}
              placeholder="¡Felicidades a todos!"
            />
          </div>
        )

      case 'TEXT':
        return (
          <div>
            <label className={labelCls}>Contenido</label>
            <textarea
              rows={4}
              className={inputCls}
              value={str('content')}
              onChange={(e) => set('content', e.target.value)}
              placeholder="Escribe tu texto aquí..."
            />
          </div>
        )

      case 'HERO':
        return (
          <>
            <div>
              <label className={labelCls}>Título</label>
              <input
                type="text"
                className={inputCls}
                value={str('title')}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Subtítulo</label>
              <input
                type="text"
                className={inputCls}
                value={str('subtitle')}
                onChange={(e) => set('subtitle', e.target.value)}
              />
            </div>
          </>
        )

      case 'MAP':
        return (
          <div>
            <label className={labelCls}>URL de mapa (embed)</label>
            <input
              type="url"
              className={inputCls}
              value={str('mapUrl')}
              onChange={(e) => set('mapUrl', e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </div>
        )

      case 'PhotoGrid':
      case 'RSVPConfirmation':
      case 'GALLERY':
        return (
          <p className="text-xs text-zinc-500 text-center py-4">
            Esta sección no requiere configuración de texto.<br />
            <span className="text-zinc-600">Gestiona su contenido desde la pestaña del evento.</span>
          </p>
        )

      case 'Agenda': {
        type AgItem = { time: string; title: string; description?: string; icon?: string; location?: string }
        const items: AgItem[] = Array.isArray(values.items) ? values.items as AgItem[] : []
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Título</label>
              <input
                type="text"
                className={inputCls}
                value={str('title', 'Programa del día')}
                onChange={e => set('title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Actividades</p>
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-700 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Hora</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={item.time}
                        placeholder="14:00"
                        onChange={e => {
                          const next = [...items]; next[idx] = { ...next[idx], time: e.target.value }
                          set('items', next)
                        }}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Ícono</label>
                      <select
                        className={inputCls}
                        value={item.icon ?? 'default'}
                        onChange={e => {
                          const next = [...items]; next[idx] = { ...next[idx], icon: e.target.value }
                          set('items', next)
                        }}
                      >
                        <option value="default">✨ General</option>
                        <option value="ceremony">💍 Ceremonia</option>
                        <option value="reception">🥂 Recepción</option>
                        <option value="dinner">🍽️ Cena</option>
                        <option value="party">🎉 Fiesta</option>
                        <option value="music">🎵 Música</option>
                        <option value="photo">📸 Fotos</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Título</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={item.title}
                      placeholder="Ceremonia"
                      onChange={e => {
                        const next = [...items]; next[idx] = { ...next[idx], title: e.target.value }
                        set('items', next)
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Lugar (opcional)</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={item.location ?? ''}
                      placeholder="Salón principal"
                      onChange={e => {
                        const next = [...items]; next[idx] = { ...next[idx], location: e.target.value }
                        set('items', next)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    onClick={() => {
                      const next = items.filter((_, i) => i !== idx)
                      set('items', next)
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-full py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                onClick={() => {
                  const next = [...items, { time: '', title: '', icon: 'default' }]
                  set('items', next)
                }}
              >
                + Agregar actividad
              </button>
            </div>
          </div>
        )
      }

      default:
        return (
          <div>
            <label className={labelCls}>Configuración (JSON)</label>
            <textarea
              rows={5}
              className={`${inputCls} font-mono`}
              value={JSON.stringify(values, null, 2)}
              onChange={(e) => {
                try { setValues(JSON.parse(e.target.value)) } catch { /* ignore */ }
              }}
            />
          </div>
        )
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
      <div className="mt-2 rounded-lg border border-white/10 bg-zinc-900/80 p-3 space-y-3">
        {renderFields()}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? <ArrowPathIcon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
            Guardar
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Section Row ──────────────────────────────────────────────────────────────

interface SectionRowProps {
  section: EventSection
  onToggleVisible: (s: EventSection) => Promise<void>
  onMoveUp: (s: EventSection) => void
  onMoveDown: (s: EventSection) => void
  onSaveConfig: (section: EventSection, config: Record<string, unknown>) => Promise<void>
  isFirst: boolean
  isLast: boolean
  isExpanded: boolean
  onToggleExpand: (id: string) => void
}

function SectionRow({
  section,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
  onSaveConfig,
  isFirst,
  isLast,
  isExpanded,
  onToggleExpand,
}: SectionRowProps) {
  const [togglingVisible, setTogglingVisible] = useState(false)
  const typeName = section.component_type || section.type || 'unknown'
  const colorClass = TYPE_COLORS[typeName] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'

  // Section types that have editable config
  const hasEditableConfig = !['PhotoGrid', 'RSVPConfirmation', 'GALLERY', 'GraduatesList'].includes(typeName) ||
    typeName === 'GraduatesList'

  const handleToggle = async () => {
    setTogglingVisible(true)
    await onToggleVisible(section)
    setTogglingVisible(false)
  }

  return (
    <div>
      <div
        className={[
          'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
          section.is_visible ? 'border-white/10 bg-zinc-900/60' : 'border-white/5 bg-zinc-950/50 opacity-60',
          isExpanded ? 'rounded-b-none border-b-indigo-500/30 bg-indigo-500/5' : '',
        ].join(' ')}
      >
        {/* Expand button */}
        <button
          onClick={() => onToggleExpand(section.id)}
          title="Editar configuración"
          className={[
            'shrink-0 p-0.5 rounded transition-colors',
            isExpanded ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400',
          ].join(' ')}
        >
          <ChevronDownIcon
            className={['size-3.5 transition-transform', isExpanded ? 'rotate-180' : ''].join(' ')}
          />
        </button>

        {/* Type badge */}
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}>
          {TYPE_LABELS[typeName] ?? typeName}
        </span>

        {/* Name */}
        <span className="flex-1 min-w-0 text-xs text-zinc-300 truncate">{section.name}</span>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onMoveUp(section)}
            disabled={isFirst}
            className="p-2 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            title="Subir"
          >
            <ArrowUpIcon className="size-3" />
          </button>
          <button
            onClick={() => onMoveDown(section)}
            disabled={isLast}
            className="p-2 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            title="Bajar"
          >
            <ArrowDownIcon className="size-3" />
          </button>
          <button
            onClick={handleToggle}
            disabled={togglingVisible}
            className={[
              'p-2 rounded transition-colors',
              section.is_visible ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-700 hover:text-zinc-500',
            ].join(' ')}
            title={section.is_visible ? 'Ocultar' : 'Mostrar'}
          >
            {togglingVisible ? (
              <ArrowPathIcon className="size-3 animate-spin" />
            ) : section.is_visible ? (
              <EyeIcon className="size-3.5" />
            ) : (
              <EyeSlashIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Inline config editor */}
      <AnimatePresence>
        {isExpanded && hasEditableConfig && (
          <SectionConfigEditor
            section={section}
            onSave={onSaveConfig}
            onClose={() => onToggleExpand(section.id)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Quick Config Toggles ─────────────────────────────────────────────────────

interface QuickConfigProps {
  config: EventConfig | undefined
  eventId: string
  onSaved: () => void
}

function QuickConfigPanel({ config, eventId, onSaved }: QuickConfigProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState<string>('')
  const [thankYouMsg, setThankYouMsg] = useState<string>('')
  const [savingMsg, setSavingMsg] = useState(false)

  // Populate text fields from config
  if (config && welcomeMsg === '' && config.welcome_message) {
    setWelcomeMsg(config.welcome_message)
  }
  if (config && thankYouMsg === '' && config.thank_you_message) {
    setThankYouMsg(config.thank_you_message)
  }

  const toggle = async (field: keyof EventConfig, currentValue: boolean) => {
    setSaving(field as string)
    try {
      await api.put(`/events/${eventId}/config`, { ...config, [field]: !currentValue })
      await mutate(`/events/${eventId}/config`)
      onSaved()
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSaving(null)
    }
  }

  const saveMessages = async () => {
    if (!config) return
    setSavingMsg(true)
    try {
      await api.put(`/events/${eventId}/config`, {
        ...config,
        welcome_message: welcomeMsg,
        thank_you_message: thankYouMsg,
      })
      await mutate(`/events/${eventId}/config`)
      onSaved()
      toast.success('Mensajes guardados')
    } catch {
      toast.error('Error al guardar mensajes')
    } finally {
      setSavingMsg(false)
    }
  }

  if (!config) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded" />)}
      </div>
    )
  }

  const toggleRows = [
    { field: 'is_public' as const, label: 'Página pública', value: config.is_public },
    { field: 'show_rsvp' as const, label: 'Mostrar RSVP', value: config.show_rsvp ?? true },
    { field: 'show_countdown' as const, label: 'Cuenta regresiva', value: config.show_countdown ?? true },
    { field: 'show_location' as const, label: 'Ubicación', value: config.show_location ?? true },
    { field: 'show_gallery' as const, label: 'Galería', value: config.show_gallery ?? true },
    { field: 'show_wall' as const, label: 'Momentos', value: config.show_wall ?? true },
    { field: 'allow_uploads' as const, label: 'Subir fotos', value: config.allow_uploads ?? false },
    { field: 'allow_messages' as const, label: 'Mensajes de guests', value: config.allow_messages ?? false },
  ]

  return (
    <div className="space-y-4">
      {/* Toggle rows */}
      <div className="space-y-0.5">
        {toggleRows.map(({ field, label, value }) => (
          <div key={field} className="flex items-center justify-between py-1.5 px-1">
            <span className="text-xs text-zinc-400">{label}</span>
            <div className="flex items-center gap-1.5">
              {saving === field && <ArrowPathIcon className="size-3 text-zinc-600 animate-spin" />}
              <Switch
                checked={value ?? false}
                onChange={() => toggle(field, value ?? false)}
                disabled={saving !== null}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Text messages */}
      <div className="border-t border-white/10 pt-3 space-y-3">
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide px-1">Mensajes personalizados</p>
        <div>
          <label className={labelCls}>Mensaje de bienvenida</label>
          <textarea
            rows={2}
            className={inputCls}
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            placeholder="¡Bienvenido a nuestro evento!"
          />
        </div>
        <div>
          <label className={labelCls}>Mensaje de agradecimiento</label>
          <textarea
            rows={2}
            className={inputCls}
            value={thankYouMsg}
            onChange={(e) => setThankYouMsg(e.target.value)}
            placeholder="¡Gracias por confirmar tu asistencia!"
          />
        </div>
        <button
          onClick={saveMessages}
          disabled={savingMsg}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
        >
          {savingMsg ? <ArrowPathIcon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
          Guardar mensajes
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const { id } = useParams<{ id: string }>()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [activePanel, setActivePanel] = useState<PanelId>('sections')
  const [iframeKey, setIframeKey] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const { data: event } = useSWR<Event>(
    id ? `/events/${id}` : null,
    fetcher
  )

  const { data: sections = [], isLoading: sectionsLoading, mutate: mutateSections } = useSWR<EventSection[]>(
    event?.id ? `/events/${event.id}/sections` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const { data: config, mutate: mutateConfig } = useSWR<EventConfig>(
    event?.id ? `/events/${event.id}/config` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const previewUrl = event
    ? `${PUBLIC_FRONTEND_URL}/e/${event.identifier}?preview=1&t=${iframeKey}`
    : ''

  const refreshPreview = useCallback(() => {
    setIframeKey((k) => k + 1)
  }, [])

  const handleToggleExpand = useCallback((sectionId: string) => {
    setExpandedSectionId((prev) => (prev === sectionId ? null : sectionId))
  }, [])

  const handleToggleVisible = useCallback(async (section: EventSection) => {
    try {
      await api.put(`/sections/${section.id}`, { ...section, is_visible: !section.is_visible })
      await mutateSections()
      refreshPreview()
    } catch {
      toast.error('Error al actualizar la sección')
    }
  }, [mutateSections, refreshPreview])

  const handleMove = useCallback(async (section: EventSection, direction: 'up' | 'down') => {
    const sorted = [...sections].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((s) => s.id === section.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const swapSection = sorted[swapIdx]
    try {
      await Promise.all([
        api.put(`/sections/${section.id}`, { ...section, order: swapSection.order }),
        api.put(`/sections/${swapSection.id}`, { ...swapSection, order: section.order }),
      ])
      await mutateSections()
      refreshPreview()
    } catch {
      toast.error('Error al reordenar secciones')
    }
  }, [sections, mutateSections, refreshPreview])

  const handleSaveConfig = useCallback(async (section: EventSection, config: Record<string, unknown>) => {
    try {
      await api.put(`/sections/${section.id}`, { ...section, config })
      await mutateSections()
      refreshPreview()
      toast.success('Sección guardada')
      setExpandedSectionId(null)
    } catch {
      toast.error('Error al guardar configuración')
    }
  }, [mutateSections, refreshPreview])

  const handlePublish = async () => {
    if (!event || !config) return
    setPublishing(true)
    try {
      await api.put(`/events/${event.id}/config`, { ...config, is_public: true })
      await mutateConfig()
      setPublished(true)
      toast.success('¡Evento publicado! Ya está visible al público.')
      setTimeout(() => setPublished(false), 4000)
    } catch {
      toast.error('Error al publicar el evento')
    } finally {
      setPublishing(false)
    }
  }

  const isPublic = config?.is_public ?? false
  const sortedSections = [...sections].sort((a, b) => a.order - b.order)

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row overflow-hidden bg-zinc-950">

      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div className={[
        'flex flex-col w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-950',
        // On mobile: show sidebar when not showing preview; on lg always show
        showPreview ? 'hidden lg:flex' : 'flex',
      ].join(' ')}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <a
            href={`/events/${id}`}
            className="shrink-0 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeftIcon className="size-3.5" />
            Volver
          </a>
          <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-200 truncate">{event?.name ?? '…'}</p>
          {/* Mobile: toggle to preview */}
          <button
            onClick={() => setShowPreview(true)}
            className="lg:hidden shrink-0 flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <EyeIcon className="size-3.5" />
            <span className="sr-only">Ver preview</span>
          </button>
        </div>

        {/* Panel tabs */}
        <div className="flex overflow-x-auto border-b border-white/10 scrollbar-none">
          {([
            { id: 'sections' as PanelId, icon: ListBulletIcon, label: 'Secciones' },
            { id: 'config' as PanelId, icon: Cog6ToothIcon, label: 'Ajustes' },
            { id: 'design' as PanelId, icon: PaintBrushIcon, label: 'Diseño' },
          ]).map(({ id: tabId, icon: Icon, label }) => (
            <button
              key={tabId}
              onClick={() => setActivePanel(tabId)}
              className={[
                'flex shrink-0 flex-1 flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
                activePanel === tabId
                  ? 'text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-zinc-600 hover:text-zinc-400',
              ].join(' ')}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-3">
          <AnimatePresence mode="wait">

            {/* ── Sections panel ── */}
            {activePanel === 'sections' && (
              <motion.div
                key="sections"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-[10px] text-zinc-600">
                    {sections.length} sección{sections.length !== 1 ? 'es' : ''}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-700">
                    <PencilSquareIcon className="size-3" />
                    Haz clic en ∨ para editar
                  </span>
                </div>

                {sectionsLoading
                  ? [...Array(4)].map((_, i) => (
                      <div key={i} className="h-9 bg-zinc-800/50 animate-pulse rounded-lg" />
                    ))
                  : sortedSections.map((section, i) => (
                      <SectionRow
                        key={section.id}
                        section={section}
                        onToggleVisible={handleToggleVisible}
                        onMoveUp={(s) => handleMove(s, 'up')}
                        onMoveDown={(s) => handleMove(s, 'down')}
                        onSaveConfig={handleSaveConfig}
                        isFirst={i === 0}
                        isLast={i === sortedSections.length - 1}
                        isExpanded={expandedSectionId === section.id}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))}

                {sections.length === 0 && !sectionsLoading && (
                  <div className="py-8 text-center">
                    <Squares2X2Icon className="mx-auto size-6 text-zinc-700 mb-2" />
                    <p className="text-xs text-zinc-600">Sin secciones aún.</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Config panel ── */}
            {activePanel === 'config' && (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
              >
                <p className="text-[10px] text-zinc-600 px-1 mb-3">
                  Cambios se aplican en la vista previa al guardar.
                </p>
                <QuickConfigPanel
                  config={config}
                  eventId={event?.id ?? ''}
                  onSaved={refreshPreview}
                />
              </motion.div>
            )}

            {/* ── Design panel ── */}
            {activePanel === 'design' && (
              <motion.div
                key="design"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <p className="text-[10px] text-zinc-600 px-1">
                  Selecciona plantilla, paleta y tipografía.
                </p>
                <a
                  href={`/events/${id}?tab=configuracion`}
                  className="flex items-center justify-center gap-2 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <PaintBrushIcon className="size-4" />
                  Abrir editor de diseño completo
                </a>

                {config?.design_template ? (
                  <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 space-y-1">
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Plantilla activa</p>
                    <p className="text-xs font-semibold text-zinc-200">{config.design_template.name}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{config.design_template.identifier}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-4 text-center">
                    <p className="text-xs text-zinc-600">Sin plantilla seleccionada</p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Publish footer */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {isPublic && event && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(`${PUBLIC_FRONTEND_URL}/e/${event.identifier}`)
                toast.success('URL copiada')
              }}
              className="w-full flex items-center gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2 text-xs text-lime-400 hover:bg-lime-500/10 transition-colors"
            >
              <GlobeAltIcon className="size-3.5 shrink-0" />
              <span className="truncate flex-1 text-left font-mono text-[10px]">
                {PUBLIC_FRONTEND_URL}/e/{event.identifier}
              </span>
            </button>
          )}

          <button
            onClick={handlePublish}
            disabled={publishing || isPublic}
            className={[
              'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all',
              isPublic
                ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30 cursor-default'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 shadow-lg shadow-indigo-500/20',
            ].join(' ')}
          >
            {publishing ? (
              <><ArrowPathIcon className="size-4 animate-spin" /> Publicando…</>
            ) : isPublic ? (
              <><CheckIcon className="size-4" /> Publicado</>
            ) : (
              <><GlobeAltIcon className="size-4" /> Publicar evento</>
            )}
          </button>
        </div>
      </div>

      {/* ── Preview Area ────────────────────────────────────────────────────── */}
      <div className={[
        'flex flex-col flex-1 min-w-0 bg-zinc-900',
        // On mobile: only show when showPreview is true; on lg always show
        showPreview ? 'flex' : 'hidden lg:flex',
      ].join(' ')}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-zinc-950">
          {/* Mobile: back to editor button */}
          <button
            onClick={() => setShowPreview(false)}
            className="lg:hidden shrink-0 flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <ChevronLeftIcon className="size-3.5" />
            <span className="sr-only">Volver al editor</span>
          </button>
          {/* Device toggles */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {([
              { mode: 'desktop' as DeviceMode, icon: ComputerDesktopIcon, label: 'Desktop' },
              { mode: 'tablet' as DeviceMode, icon: Squares2X2Icon, label: 'Tablet' },
              { mode: 'mobile' as DeviceMode, icon: DevicePhoneMobileIcon, label: 'Móvil' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setDevice(mode)}
                title={label}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  device === mode ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5',
                ].join(' ')}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* URL bar — hidden on mobile to save space */}
          <div className="hidden sm:flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 min-w-0">
            <GlobeAltIcon className="size-3.5 text-zinc-600 shrink-0" />
            <span className="text-xs text-zinc-500 font-mono truncate">
              {previewUrl.replace(`?preview=1&t=${iframeKey}`, '?preview=1')}
            </span>
          </div>

          {/* Refresh */}
          <button
            onClick={refreshPreview}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="Refrescar vista previa"
          >
            <ArrowPathIcon className="size-4" />
          </button>

          {/* Open in new tab */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="Abrir en nueva pestaña"
          >
            ↗
          </a>
        </div>

        {/* IFrame container */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-2 sm:p-4 bg-zinc-900">
          <AnimatePresence mode="wait">
            <motion.div
              key={device}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-white w-full"
              style={{
                maxWidth: DEVICE_DIMENSIONS[device].maxW,
                minHeight: device === 'mobile' ? '812px' : '600px',
                height: device === 'desktop' ? 'calc(100vh - 120px)' : 'auto',
              }}
            >
              {/* Browser chrome for non-desktop */}
              {device !== 'desktop' && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 border-b border-zinc-200">
                  <div className="size-2.5 rounded-full bg-red-400" />
                  <div className="size-2.5 rounded-full bg-amber-400" />
                  <div className="size-2.5 rounded-full bg-lime-400" />
                  <div className="flex-1 rounded-md bg-white border border-zinc-200 h-4 mx-2 flex items-center px-2">
                    <span className="text-[9px] text-zinc-400 font-mono truncate">
                      {PUBLIC_FRONTEND_URL}/e/{event?.identifier}
                    </span>
                  </div>
                </div>
              )}

              {event ? (
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={previewUrl}
                  className="w-full border-0"
                  style={{
                    height: device === 'desktop' ? '100%' : '812px',
                    minHeight: '500px',
                  }}
                  title={`Vista previa — ${event.name}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <div className="flex items-center justify-center h-96">
                  <div className="size-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Published confirmation overlay */}
      <AnimatePresence>
        {published && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-lime-500/30 bg-lime-500/10 px-5 py-3 shadow-2xl backdrop-blur-md z-50"
          >
            <CheckIcon className="size-5 text-lime-400" />
            <div>
              <p className="text-sm font-semibold text-lime-300">¡Evento publicado!</p>
              <a
                href={`${PUBLIC_FRONTEND_URL}/e/${event?.identifier}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-lime-500 hover:text-lime-400 transition-colors"
              >
                {PUBLIC_FRONTEND_URL}/e/{event?.identifier}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
