'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/20/solid'
import { inputCls, labelCls } from '@/components/studio/studio-constants'
import type { EventSection } from '@/models/EventSection'

interface SectionConfigEditorProps {
  section: EventSection
  onSave: (section: EventSection, config: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

export default function SectionConfigEditor({
  section,
  onSave,
  onClose,
}: SectionConfigEditorProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => section.config ?? section.content_json ?? {},
  )
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const set = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value }

        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(async () => {
          setSaveStatus('saving')
          await onSave(section, next)
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }, 800)

        return next
      })
    },
    [onSave, section],
  )

  const str = (key: string, fallback = '') =>
    (values[key] as string | undefined) ?? fallback

  // ─── Agenda helpers ──────────────────────────────────────────────────────────

  const agendaItems = (values.items as Record<string, string>[] | undefined) ?? []

  const setAgendaItem = (index: number, field: string, value: string) => {
    const items = [...agendaItems]
    items[index] = { ...items[index], [field]: value }
    set('items', items)
  }

  const addAgendaItem = () => {
    set('items', [
      ...agendaItems,
      { time: '', icon: 'default', title: '', location: '' },
    ])
  }

  const removeAgendaItem = (index: number) => {
    set(
      'items',
      agendaItems.filter((_, i) => i !== index),
    )
  }

  // ─── Field renderers ─────────────────────────────────────────────────────────

  const textField = (key: string, label: string, placeholder = '') => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        className={inputCls}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  const urlField = (key: string, label: string, placeholder = '') => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        type="url"
        className={inputCls}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  const datetimeField = (key: string, label: string) => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        type="datetime-local"
        className={inputCls}
        value={str(key)}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  const textareaField = (key: string, label: string, rows = 3, placeholder = '') => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <textarea
        className={inputCls}
        rows={rows}
        value={str(key)}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  // ─── renderFields ─────────────────────────────────────────────────────────────

  const renderFields = () => {
    const componentType = section.component_type || section.type || ''

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
        return <>{textareaField('closing', 'Texto de cierre', 3, '¡Felicidades a todos!')}</>

      case 'TEXT':
        return <>{textareaField('content', 'Contenido', 4, 'Escribe tu texto aqui...')}</>

      case 'HERO':
        return (
          <>
            {textField('title', 'Titulo')}
            {textField('subtitle', 'Subtitulo')}
          </>
        )

      case 'MAP':
        return <>{urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}</>

      case 'PhotoGrid':
      case 'RSVPConfirmation':
      case 'GALLERY':
        return (
          <p className="text-xs text-zinc-500 text-center py-4">
            Esta seccion no requiere configuracion de texto.<br />
            <span className="text-zinc-600">Gestiona su contenido desde la pestana del evento.</span>
          </p>
        )

      case 'Agenda':
        return (
          <>
            {textField('title', 'Titulo', 'Programa del dia')}

            <div className="space-y-2">
              <label className={labelCls}>Actividades</label>
              {agendaItems.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-700 p-3 space-y-2"
                >
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
                        <option value="default">✨ General</option>
                        <option value="ceremony">💍 Ceremonia</option>
                        <option value="reception">🥂 Recepcion</option>
                        <option value="dinner">🍽️ Cena</option>
                        <option value="party">🎉 Fiesta</option>
                        <option value="music">🎵 Musica</option>
                        <option value="photo">📸 Fotos</option>
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
                      onChange={(e) =>
                        setAgendaItem(i, 'location', e.target.value)
                      }
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeAgendaItem(i)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addAgendaItem}
                className="w-full py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                + Agregar actividad
              </button>
            </div>
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
                  setValues(parsed)

                  if (timerRef.current) clearTimeout(timerRef.current)
                  timerRef.current = setTimeout(async () => {
                    setSaveStatus('saving')
                    await onSave(section, parsed)
                    setSaveStatus('saved')
                    setTimeout(() => setSaveStatus('idle'), 2000)
                  }, 800)
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
      <div className="mt-1 rounded-b-xl border border-t-0 border-white/10 bg-zinc-900/80 p-3 space-y-3">
        {renderFields()}

        {/* Footer: auto-save status + close button */}
        <div className="flex items-center justify-between pt-1 border-t border-white/5">
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
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </motion.div>
  )
}
