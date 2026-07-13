'use client'

import { inputCls, labelCls } from '@/components/studio/studio-constants'
import { readEventSectionConfig } from '@/lib/event-section-config'
import { canonicalSectionType } from '@/lib/section-type-aliases'
import type { EventSection } from '@/models/EventSection'
import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SectionConfigEditorProps {
  section: EventSection
  onSave: (section: EventSection, config: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

export default function SectionConfigEditor({ section, onSave, onClose }: SectionConfigEditorProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => readEventSectionConfig(section))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const mountedRef = useRef(true)
  const valuesRef = useRef(values)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  const scheduleSave = useCallback(
    (next: Record<string, unknown>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      setSaveStatus('idle')

      timerRef.current = setTimeout(async () => {
        timerRef.current = null
        if (!mountedRef.current) return
        setSaveStatus('saving')
        try {
          await onSave(section, next)
          if (!mountedRef.current) return
          setSaveStatus('saved')
        } catch {
          if (!mountedRef.current) return
          setSaveStatus('error')
        }
        statusTimerRef.current = setTimeout(() => {
          statusTimerRef.current = null
          if (mountedRef.current) setSaveStatus('idle')
        }, 2000)
      }, 800)
    },
    [onSave, section]
  )

  const set = useCallback(
    (key: string, value: unknown) => {
      const next = { ...valuesRef.current, [key]: value }
      valuesRef.current = next
      setValues(next)
      scheduleSave(next)
    },
    [scheduleSave]
  )

  const str = (key: string, fallback = '') => (values[key] as string | undefined) ?? fallback

  // ─── Agenda helpers ──────────────────────────────────────────────────────────

  const agendaItems = (values.items as Record<string, string>[] | undefined) ?? []

  const setAgendaItem = (index: number, field: string, value: string) => {
    const items = [...agendaItems]
    items[index] = { ...items[index], [field]: value }
    set('items', items)
  }

  const addAgendaItem = () => {
    set('items', [...agendaItems, { time: '', icon: 'default', title: '', location: '' }])
  }

  const removeAgendaItem = (index: number) => {
    set(
      'items',
      agendaItems.filter((_, i) => i !== index)
    )
  }

  // ─── Field renderers ─────────────────────────────────────────────────────────

  const textField = (key: string, label: string, placeholder = '') => (
    <label key={key} className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="text"
        className={inputCls}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  )

  const urlField = (key: string, label: string, placeholder = '') => (
    <label key={key} className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="url"
        className={inputCls}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  )

  const datetimeField = (key: string, label: string) => (
    <label key={key} className="block">
      <span className={labelCls}>{label}</span>
      <input type="datetime-local" className={inputCls} value={str(key)} onChange={(e) => set(key, e.target.value)} />
    </label>
  )

  const textareaField = (key: string, label: string, rows = 3, placeholder = '') => (
    <label key={key} className="block">
      <span className={labelCls}>{label}</span>
      <textarea
        className={inputCls}
        rows={rows}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  )

  // ─── renderFields ─────────────────────────────────────────────────────────────

  const renderFields = () => {
    const componentType = canonicalSectionType(section.component_type || section.type || '')

    switch (componentType) {
      case 'CountdownHeader':
        return (
          <>
            {textField('heading', 'Encabezado', '¡Nos graduamos!')}
            {datetimeField('targetDate', 'Fecha objetivo')}
          </>
        )

      case 'GraduationHero':
        return (
          <>
            {textField('title', 'Titulo principal', 'Generacion 2025')}
            {textField('years', 'Anos', '2022-2025')}
            {textField('school', 'Escuela / institucion', 'UNAM — Facultad de Ingenieria')}
          </>
        )

      case 'EventVenue':
        return (
          <>
            {textareaField('text', 'Descripcion general', 2, 'Te esperamos en...')}
            {textField('date', 'Fecha y hora (texto)', 'Sabado 14 de junio, 19:00 hrs')}
            {textField('venueText', 'Lugar', 'Salon Los Arcos, CDMX')}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'Reception':
        return (
          <>
            {textField('venueText', 'Lugar de recepcion', 'Restaurante El Patio')}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'GraduatesList':
      case 'Hosts':
      case 'HostSection':
      case 'HostsSection':
        return <>{textareaField('closing', 'Texto de cierre', 3, '¡Felicidades a todos!')}</>

      case 'TEXT':
      case 'LegacyText':
      case 'Contact':
      case 'ContactSection':
        return <>{textareaField('content', 'Contenido', 4, 'Escribe tu texto aqui...')}</>

      case 'HERO':
      case 'LegacyHero':
        return (
          <>
            {textField('title', 'Titulo')}
            {textField('subtitle', 'Subtitulo')}
            {textareaField('content', 'Texto de portada', 3)}
          </>
        )

      case 'MAP':
      case 'LegacyMap':
        return (
          <>
            {textField('title', 'Titulo del mapa')}
            {textareaField('content', 'Texto de apoyo', 2)}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'RSVPConfirmation':
        return (
          <p className="py-4 text-center text-xs text-zinc-500">
            Esta seccion no requiere configuracion de texto.
            <br />
            <span className="text-zinc-600">Gestiona su contenido desde la pestana del evento.</span>
          </p>
        )

      case 'PhotoGrid':
        return (
          <p className="py-4 text-center text-xs text-zinc-500">
            Esta seccion no requiere configuracion de texto.
            <br />
            <span className="text-zinc-600">Gestiona sus imagenes desde recursos.</span>
          </p>
        )

      case 'GALLERY':
      case 'LegacyGallery':
        return (
          <>
            {textField('title', 'Titulo de galeria')}
            {textField('subtitle', 'Subtitulo')}
          </>
        )

      case 'MUSIC':
      case 'LegacyMusic':
        return <>{urlField('musicUrl', 'URL de audio o playlist', 'https://...')}</>

      case 'Agenda':
      case 'AgendaSection':
        return (
          <>
            {textField('title', 'Titulo', 'Programa del dia')}

            <div className="space-y-2">
              <label className={labelCls}>Actividades</label>
              {agendaItems.map((item, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-zinc-700 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Hora</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={item.time ?? ''}
                        placeholder="14:00"
                        onChange={(e) => setAgendaItem(i, 'time', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Icono</label>
                      <select
                        className={inputCls}
                        value={item.icon ?? 'default'}
                        onChange={(e) => setAgendaItem(i, 'icon', e.target.value)}
                      >
                        <option value="default">General</option>
                        <option value="ceremony">Ceremonia</option>
                        <option value="reception">Recepción</option>
                        <option value="dinner">Cena</option>
                        <option value="party">Fiesta</option>
                        <option value="music">Música</option>
                        <option value="photo">Fotos</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Titulo</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={item.title ?? ''}
                      placeholder="Ceremonia"
                      onChange={(e) => setAgendaItem(i, 'title', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Lugar (opcional)</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={item.location ?? ''}
                      placeholder="Salon principal"
                      onChange={(e) => setAgendaItem(i, 'location', e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeAgendaItem(i)}
                    className="text-xs text-red-400 transition-colors hover:text-red-300"
                  >
                    Eliminar
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addAgendaItem}
                className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
              >
                + Agregar actividad
              </button>
            </div>
          </>
        )

      case 'SCHEDULE':
      case 'LegacySchedule':
        return (
          <>
            {textField('title', 'Titulo', 'Programa del dia')}
            {textareaField('content', 'Contenido', 4, 'Ceremonia a las 18:00...')}
          </>
        )

      default: {
        const raw = JSON.stringify(values, null, 2)
        return (
          <div>
            <label className={labelCls}>Configuracion (JSON)</label>
            <textarea
              className={inputCls}
              rows={6}
              value={raw}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value) as Record<string, unknown>
                  valuesRef.current = parsed
                  setValues(parsed)
                  scheduleSave(parsed)
                } catch {
                  // ignore invalid JSON while typing
                }
              }}
            />
          </div>
        )
      }
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-1 space-y-3 rounded-b-xl border border-t-0 border-white/10 bg-zinc-900/80 p-3">
        {renderFields()}

        {/* Footer: auto-save status + close button */}
        <div className="flex items-center justify-between border-t border-white/5 pt-1">
          <AnimatePresence mode="wait">
            {saveStatus === 'saving' && (
              <motion.span
                key="saving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-[10px] text-zinc-500"
              >
                <ArrowPathIcon className="size-3 animate-spin" /> Guardando...
              </motion.span>
            )}
            {saveStatus === 'saved' && (
              <motion.span
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-[10px] text-lime-400"
              >
                <CheckIcon className="size-3" /> Guardado
              </motion.span>
            )}
            {saveStatus === 'error' && (
              <motion.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-[10px] text-red-400"
              >
                <ExclamationTriangleIcon className="size-3" /> No se pudo guardar
              </motion.span>
            )}
            {saveStatus === 'idle' && (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-zinc-700"
              >
                Auto-guardado activo
              </motion.span>
            )}
          </AnimatePresence>

          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    </motion.div>
  )
}
