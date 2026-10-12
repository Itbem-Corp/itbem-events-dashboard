'use client'

import { inputCls, labelCls } from '@/components/studio/studio-constants'
import { readEventSectionConfig } from '@/lib/event-section-config'
import { isSectionConflictError } from '@/lib/section-conflict'
import { canonicalSectionType } from '@/lib/section-type-aliases'
import type { EventSection } from '@/models/EventSection'
import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUnsavedChangesWarning } from '@/components/studio/use-unsaved-changes-warning'
import { Link } from '@/components/link'
import { countdownTargetDateInputValue, hasCountdownTargetDate } from '@/lib/countdown-target-date'

interface SectionConfigEditorProps {
  section: EventSection
  /**
   * Saves the config with `expectedUpdatedAt` as the backend's expected_updated_at. Resolves with the
   * saved section when the API returns it (its updated_at becomes the new baseline); rejects with
   * SectionConflictError when another tab saved first (409 section_conflict).
   */
  onSave: (
    section: EventSection,
    config: Record<string, unknown>,
    expectedUpdatedAt?: string | null
  ) => Promise<EventSection | null | void>
  onClose: () => void
  /**
   * The user chose to drop this section's failed or conflicting edits (closed the editor and
   * confirmed, or loaded the saved version), so Studio can stop warning about them.
   */
  onDiscardFailedSave?: (sectionId: string) => void
}

export const SECTION_CHANGED_ELSEWHERE_MESSAGE = 'Esta sección cambió en otra pestaña.'
export const SECTION_DISCARD_UNSAVED_MESSAGE =
  'Los últimos cambios de esta sección no se guardaron. ¿Cerrar y descartarlos?'

/** True when `latest` is a newer save than `baseline` (an older copy arriving late is not a change). */
function isNewerVersion(latest: string, baseline: string): boolean {
  const latestTime = Date.parse(latest)
  const baselineTime = Date.parse(baseline)
  if (Number.isNaN(latestTime) || Number.isNaN(baselineTime)) return latest !== baseline
  return latestTime > baselineTime
}

const RAW_JSON_INVALID = 'JSON inválido: revisa comas, comillas y llaves.'
const RAW_JSON_NOT_OBJECT = 'La configuración debe ser un objeto JSON, por ejemplo {"title": "Mi sección"}.'

/** Parses the raw JSON editor text. Only plain objects are valid section configs. */
export function parseRawSectionConfig(
  text: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: RAW_JSON_INVALID }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: RAW_JSON_NOT_OBJECT }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

export default function SectionConfigEditor({ section, onSave, onClose, onDiscardFailedSave }: SectionConfigEditorProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => readEventSectionConfig(section))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasPendingSave, setHasPendingSave] = useState(false)
  const [rawDraft, setRawDraft] = useState<string | null>(null)
  const [rawError, setRawError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const mountedRef = useRef(true)
  const valuesRef = useRef(values)
  // The debounced payload that has not been sent yet. It is flushed (not
  // dropped) when the editor closes or unmounts.
  const pendingRef = useRef<Record<string, unknown> | null>(null)
  const onSaveRef = useRef(onSave)
  const sectionRef = useRef(section)

  // STU-N3: the API has no version check (PUT sends the whole config), so a second Studio
  // tab would silently overwrite this one. The editor remembers the updated_at it last saw
  // or saved; when the section arrives with another one (Studio revalidates when the tab
  // gets focus) it reloads the saved version if nothing is pending here, or stops
  // autosaving and asks the host what to keep.
  const baselineRef = useRef<string | null>(section.updated_at || null)
  const savingRef = useRef(false)
  // When a save response carries no section, the version this tab saved over; the next
  // different version is taken as this tab's own save.
  const preSaveVersionRef = useRef<string | null>(null)
  const saveFailedRef = useRef(false)
  const conflictRef = useRef(false)
  // The section the server reported with a 409, when it is newer than the props.
  const conflictSectionRef = useRef<EventSection | null>(null)
  const [conflict, setConflict] = useState(false)
  const [reloadedFromElsewhere, setReloadedFromElsewhere] = useState(false)

  useEffect(() => {
    onSaveRef.current = onSave
    sectionRef.current = section
  }, [onSave, section])

  const loadSavedVersion = useCallback((latest: EventSection) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
    saveFailedRef.current = false
    conflictRef.current = false
    conflictSectionRef.current = null
    baselineRef.current = latest.updated_at || null
    const fresh = readEventSectionConfig(latest)
    valuesRef.current = fresh
    setValues(fresh)
    setRawDraft(null)
    setRawError(null)
    setHasPendingSave(false)
    setConflict(false)
    setSaveStatus('idle')
  }, [])

  const reconcileWithSaved = useCallback(() => {
    if (savingRef.current || conflictRef.current) return
    const latest = sectionRef.current
    const latestVersion = latest.updated_at || null
    if (!latestVersion) return
    if (!baselineRef.current) {
      if (preSaveVersionRef.current && latestVersion === preSaveVersionRef.current) return
      preSaveVersionRef.current = null
      baselineRef.current = latestVersion
      return
    }
    if (!isNewerVersion(latestVersion, baselineRef.current)) return
    if (pendingRef.current || saveFailedRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      conflictRef.current = true
      setConflict(true)
      return
    }
    loadSavedVersion(latest)
    setReloadedFromElsewhere(true)
  }, [loadSavedVersion])

  useEffect(() => {
    sectionRef.current = section
    reconcileWithSaved()
  }, [section, section.updated_at, reconcileWithSaved])

  const runSave = useCallback(
    async (next: Record<string, unknown>) => {
      if (conflictRef.current) {
        // Never overwrite the other tab's change while the host has not chosen.
        pendingRef.current = next
        if (mountedRef.current) setHasPendingSave(true)
        return
      }
      pendingRef.current = null
      if (mountedRef.current) {
        setHasPendingSave(false)
        setSaveStatus('saving')
        setReloadedFromElsewhere(false)
      }
      savingRef.current = true
      try {
        const versionBefore = sectionRef.current.updated_at || null
        const saved = await onSaveRef.current(sectionRef.current, next, baselineRef.current)
        saveFailedRef.current = false
        baselineRef.current = (saved && saved.updated_at) || null
        preSaveVersionRef.current = baselineRef.current ? null : versionBefore
        savingRef.current = false
        reconcileWithSaved()
        if (!mountedRef.current) return
        setSaveStatus('saved')
        statusTimerRef.current = setTimeout(() => {
          statusTimerRef.current = null
          if (mountedRef.current) setSaveStatus('idle')
        }, 2000)
      } catch (error: unknown) {
        savingRef.current = false
        if (isSectionConflictError(error)) {
          // 409 section_conflict: keep this tab's values pending and let the host choose.
          conflictSectionRef.current = error.current
          pendingRef.current = next
          conflictRef.current = true
          if (mountedRef.current) {
            setHasPendingSave(true)
            setConflict(true)
            setSaveStatus('idle')
          }
          return
        }
        saveFailedRef.current = true
        // The error stays visible (and keeps the unload warning) until the next save succeeds.
        if (mountedRef.current) setSaveStatus('error')
      }
    },
    [reconcileWithSaved]
  )

  // The newest copy of the section this tab knows: the 409 body or the props, whichever is newer.
  const latestKnownSection = useCallback((): EventSection => {
    const fromConflict = conflictSectionRef.current
    const fromProps = sectionRef.current
    if (!fromConflict?.updated_at) return fromProps
    if (!fromProps.updated_at) return fromConflict
    return isNewerVersion(fromProps.updated_at, fromConflict.updated_at) ? fromProps : fromConflict
  }, [])

  const keepLocalChanges = useCallback(() => {
    conflictRef.current = false
    // Resend with the version the other tab produced, so this save is accepted on purpose.
    baselineRef.current = latestKnownSection().updated_at || null
    conflictSectionRef.current = null
    setConflict(false)
    void runSave(valuesRef.current)
  }, [latestKnownSection, runSave])

  const flushPendingSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const pending = pendingRef.current
    // With an unresolved conflict nothing is sent: the host has not chosen which version to keep.
    if (!pending || conflictRef.current) return Promise.resolve()
    return runSave(pending)
  }, [runSave])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      // Closing the editor, switching tab, selecting another section, starting a
      // drag or leaving Studio unmounts it: send the last edits instead of dropping them.
      void flushPendingSave()
    }
  }, [flushPendingSave])

  useUnsavedChangesWarning(hasPendingSave || saveStatus === 'saving' || saveStatus === 'error' || conflict)

  const scheduleSave = useCallback(
    (next: Record<string, unknown>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      pendingRef.current = next
      setHasPendingSave(true)
      setSaveStatus((current) => (current === 'error' ? current : 'idle'))

      timerRef.current = setTimeout(() => {
        timerRef.current = null
        const pending = pendingRef.current
        if (pending) void runSave(pending)
      }, 800)
    },
    [runSave]
  )

  const handleClose = useCallback(() => {
    const sectionId = sectionRef.current.id
    // Closing with a failed save (and no newer edit to resend) or an unresolved conflict
    // drops those edits: ask first, and only then stop Studio's unsaved-changes warning.
    // Unmounting any other way (tab switch, drag, header toggle) keeps the warning.
    const losesEdits = conflictRef.current || (saveFailedRef.current && !pendingRef.current)
    if (losesEdits) {
      if (!window.confirm(SECTION_DISCARD_UNSAVED_MESSAGE)) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = null
      onDiscardFailedSave?.(sectionId)
    } else if (!pendingRef.current && !saveFailedRef.current) {
      // Closed without changes: a failure left from an earlier editing session is moot.
      onDiscardFailedSave?.(sectionId)
    }
    void flushPendingSave()
    onClose()
  }, [flushPendingSave, onClose, onDiscardFailedSave])

  const loadSavedVersionOnPurpose = useCallback(() => {
    loadSavedVersion(latestKnownSection())
    onDiscardFailedSave?.(sectionRef.current.id)
  }, [latestKnownSection, loadSavedVersion, onDiscardFailedSave])

  const set = useCallback(
    (key: string, value: unknown) => {
      const next = { ...valuesRef.current, [key]: value }
      valuesRef.current = next
      setValues(next)
      scheduleSave(next)
    },
    [scheduleSave]
  )

  const remove = useCallback(
    (key: string) => {
      const next = { ...valuesRef.current }
      delete next[key]
      valuesRef.current = next
      setValues(next)
      scheduleSave(next)
    },
    [scheduleSave]
  )

  const str = (key: string, fallback = '') => (values[key] as string | undefined) ?? fallback

  // ─── Agenda helpers ──────────────────────────────────────────────────────────

  const agendaItems = Array.isArray(values.items) ? (values.items as Record<string, string>[]) : []

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
      case 'CountdownHeader': {
        const hasOwnDate = hasCountdownTargetDate(values.targetDate)
        const inputValue = countdownTargetDateInputValue(values.targetDate)
        const helpId = `countdown-date-help-${section.id}`
        return (
          <>
            {textField('heading', 'Encabezado', '¡Nos graduamos!')}
            <div className="space-y-1.5">
              <label className="block">
                <span className={labelCls}>Fecha y hora de la cuenta regresiva</span>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={inputValue}
                  aria-describedby={helpId}
                  onChange={(e) => (e.target.value ? set('targetDate', e.target.value) : remove('targetDate'))}
                />
              </label>
              <p id={helpId} className="text-[11px] text-ink-muted">
                {hasOwnDate
                  ? inputValue
                    ? 'La cuenta regresiva usa esta fecha, en la hora del evento.'
                    : `La cuenta regresiva usa la fecha guardada ${String(values.targetDate)}.`
                  : 'Sin fecha propia: la cuenta regresiva usa la fecha del evento.'}
              </p>
              {hasOwnDate && (
                <button
                  type="button"
                  onClick={() => remove('targetDate')}
                  className="text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  Usar la fecha del evento
                </button>
              )}
            </div>
          </>
        )
      }

      case 'MomentWall':
        return (
          <>
            {textField('title', 'Título', 'Momentos')}
            {textField('subtitle', 'Subtítulo')}
            {textareaField('moment_request_message', 'Mensaje para pedir fotos', 2, 'Comparte tus fotos del evento')}
            <p className="rounded-lg border border-white/10 bg-surface-raised/60 p-2.5 text-[11px] leading-5 text-ink-muted">
              Subir fotos, mensajes, aprobación automática y publicar el muro no se configuran aquí: se controlan en la{' '}
              <Link
                href={`/events/${section.event_id}?tab=configuracion`}
                className="font-medium text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
              >
                configuración del evento
              </Link>
              .
            </p>
          </>
        )

      case 'GraduationHero':
        return (
          <>
            {textField('title', 'Título principal', 'Generación 2025')}
            {textField('years', 'Años', '2022-2025')}
            {textField('school', 'Escuela / institución', 'UNAM — Facultad de Ingeniería')}
          </>
        )

      case 'EventVenue':
        return (
          <>
            {textareaField('text', 'Descripción general', 2, 'Te esperamos en...')}
            {textField('date', 'Fecha y hora (texto)', 'Sábado 14 de junio, 19:00 hrs')}
            {textField('venueText', 'Lugar', 'Salón Los Arcos, CDMX')}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'Reception':
        return (
          <>
            {textField('venueText', 'Lugar de recepción', 'Restaurante El Patio')}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'GraduatesList':
      case 'Hosts':
      case 'HostSection':
      case 'HostsSection':
        return (
          <>
            {textField('title', 'Encabezado', componentType === 'GraduatesList' ? 'Graduados' : 'Anfitriones')}
            {textareaField('closing', 'Texto de cierre', 3, '¡Felicidades a todos!')}
          </>
        )

      case 'TEXT':
      case 'LegacyText':
      case 'Contact':
      case 'ContactSection':
        return (
          <>
            {textField('title', 'Título')}
            {textareaField('content', 'Contenido', 4, 'Escribe tu texto aquí...')}
          </>
        )

      case 'HERO':
      case 'LegacyHero':
        return (
          <>
            {textField('title', 'Título')}
            {textField('subtitle', 'Subtítulo')}
            {textareaField('content', 'Texto de portada', 3)}
          </>
        )

      case 'MAP':
      case 'LegacyMap':
        return (
          <>
            {textField('title', 'Título del mapa')}
            {textareaField('content', 'Texto de apoyo', 2)}
            {urlField('mapUrl', 'URL de mapa (embed)', 'https://maps.google.com/...')}
          </>
        )

      case 'RSVPConfirmation':
        return (
          <p className="py-4 text-center text-xs text-ink-muted">
            Esta sección no requiere configuración de texto.
            <br />
            <span className="text-ink-muted">Gestiona su contenido desde la pestaña del evento.</span>
          </p>
        )

      case 'PhotoGrid':
        return (
          <p className="py-4 text-center text-xs text-ink-muted">
            Esta sección no requiere configuración de texto.
            <br />
            <span className="text-ink-muted">Gestiona sus imágenes desde recursos.</span>
          </p>
        )

      case 'GALLERY':
      case 'LegacyGallery':
        return (
          <>
            {textField('title', 'Título de galería')}
            {textField('subtitle', 'Subtítulo')}
          </>
        )

      case 'MUSIC':
      case 'LegacyMusic':
        return <>{urlField('musicUrl', 'URL de audio o playlist', 'https://...')}</>

      case 'Agenda':
      case 'AgendaSection':
        return (
          <>
            {textField('title', 'Título', 'Programa del día')}

            <div className="space-y-2">
              <label className={labelCls}>Actividades</label>
              {agendaItems.map((item, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border-subtle p-3">
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
                    <label className={labelCls}>Título</label>
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
                      placeholder="Salón principal"
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
                className="w-full rounded-lg border border-dashed border-border-subtle py-2 text-xs text-ink-secondary transition-colors hover:border-border-subtle hover:text-ink"
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
            {textField('title', 'Título', 'Programa del día')}
            {textareaField('content', 'Contenido', 4, 'Ceremonia a las 18:00...')}
          </>
        )

      default: {
        const raw = rawDraft ?? JSON.stringify(values, null, 2)
        return (
          <div>
            <label htmlFor={`raw-config-${section.id}`} className={labelCls}>
              Configuración (JSON)
            </label>
            <textarea
              id={`raw-config-${section.id}`}
              className={inputCls}
              rows={6}
              value={raw}
              aria-invalid={rawError ? true : undefined}
              aria-describedby={rawError ? `raw-config-error-${section.id}` : undefined}
              onChange={(e) => {
                const text = e.target.value
                setRawDraft(text)
                const result = parseRawSectionConfig(text)
                if (!result.ok) {
                  setRawError(result.error)
                  return
                }
                setRawError(null)
                valuesRef.current = result.value
                setValues(result.value)
                scheduleSave(result.value)
              }}
            />
            {rawError && (
              <p id={`raw-config-error-${section.id}`} role="alert" className="mt-1 text-xs text-red-400">
                {rawError} No se guardará hasta corregirlo.
              </p>
            )}
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
      <div className="mt-1 space-y-3 rounded-b-xl border border-t-0 border-white/10 bg-surface/80 p-3">
        {conflict && (
          <div
            role="alert"
            data-testid="section-conflict"
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200"
          >
            <p className="flex items-start gap-1.5 font-medium">
              <ExclamationTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {SECTION_CHANGED_ELSEWHERE_MESSAGE} El guardado automático está en pausa para no borrar ese cambio.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSavedVersionOnPurpose}
                className="min-h-9 rounded-lg border border-amber-500/30 px-3 text-xs font-medium transition-colors hover:bg-amber-500/15"
              >
                Cargar la versión guardada
              </button>
              <button
                type="button"
                onClick={keepLocalChanges}
                className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
              >
                Conservar mis cambios
              </button>
            </div>
          </div>
        )}
        {!conflict && reloadedFromElsewhere && (
          <p role="status" data-testid="section-reloaded" className="text-[11px] text-ink-muted">
            {SECTION_CHANGED_ELSEWHERE_MESSAGE} Se cargó la versión más reciente.
          </p>
        )}
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
                className="flex items-center gap-1 text-[10px] text-ink-muted"
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
                className="text-[10px] text-ink-muted"
              >
                Auto-guardado activo
              </motion.span>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink-secondary"
          >
            Cerrar
          </button>
        </div>
      </div>
    </motion.div>
  )
}
