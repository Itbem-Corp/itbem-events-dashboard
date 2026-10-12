'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { mutate } from 'swr'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field } from '@/components/fieldset'

import { api } from '@/lib/api'
import { readApiList } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { batchGuestsPath, eventGuestsPath } from '@/lib/api-paths'
import { upsertGuestListCacheValue } from '@/lib/guest-cache'
import { createIdempotencyKey } from '@/lib/idempotency-key'
import { PUBLIC_GUEST_ROLES, isHostGuestRole } from '@/lib/public-guest-roles'
import type { Guest } from '@/models/Guest'
import { ArrowDownTrayIcon, DocumentArrowUpIcon, PlusIcon, TrashIcon, UsersIcon } from '@heroicons/react/16/solid'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'

import {
  GUEST_COMPANIONS_MAX,
  type GuestDuplicate,
  decodeCsvBytes,
  findDuplicateGuestRows,
  guestRowProblems,
  parseGuestCsv,
  parsePublicOrder,
  partySizeFromCompanions,
} from './guest-csv'
import { readGuestWriteError } from './guest-write-errors'

interface GuestRow {
  id: string
  /** Line of the CSV file the row came from, for error messages. */
  line?: number
  first_name: string
  last_name: string
  email: string
  phone: string
  /** People who come with the guest, not counting the guest (GST-2). */
  companions: number
  order: number | ''
  role: string
}

interface RowErrors {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  companions?: string
}

export const GUEST_CSV_MAX_BYTES = 2 * 1024 * 1024
export const GUEST_CSV_MAX_ROWS = 1000
const ERROR_SUMMARY_LIMIT = 8

function createEmptyRow(): GuestRow {
  return {
    id: crypto.randomUUID(),
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    companions: 0,
    order: '',
    role: '',
  }
}

function downloadTemplate() {
  const headers = 'nombre,apellido,correo,telefono,acompanantes,orden,rol'
  const example = 'Ana,Garcia,ana@ejemplo.com,+52 55 1234 5678,1,1,graduate'
  const csv = `\uFEFF${headers}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-invitados.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function validateRows(rows: GuestRow[], current: Record<string, RowErrors> = {}): Record<string, RowErrors> {
  const errors: Record<string, RowErrors> = {}
  for (const row of rows) {
    const rowErrors: RowErrors = { ...guestRowProblems(row) }
    // Party-size problems come from the CSV and stay until the host edits the field.
    if (current[row.id]?.companions) rowErrors.companions = current[row.id].companions
    if (Object.keys(rowErrors).length > 0) errors[row.id] = rowErrors
  }
  return errors
}

const DUPLICATE_REASON: Record<GuestDuplicate['reason'], string> = {
  email: 'mismo correo',
  phone: 'mismo teléfono',
  name: 'mismo nombre',
}

function duplicateText(duplicate: GuestDuplicate): string {
  const where = duplicate.source === 'event' ? 'ya está en el evento' : 'repetido en el archivo'
  return `${where} (${DUPLICATE_REASON[duplicate.reason]})`
}

function rowLabel(row: GuestRow, index: number): string {
  return row.line ? `Fila ${row.line} del archivo` : `Fila ${index + 1}`
}

function importErrorMessage(err: unknown): string {
  const error = err as { code?: string; response?: { status?: number } }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return 'La importación tardó demasiado. Es posible que sí se haya guardado: reintenta con los mismos datos y no se duplicarán.'
  }
  const status = error?.response?.status
  if (status === 409) {
    return 'La importación anterior sigue en proceso o ya se usó con otros datos. Espera unos segundos y reintenta.'
  }
  if (status === 413)
    return 'El archivo es demasiado grande para importarse de una vez. Divídelo en partes más pequeñas.'
  if (status !== undefined && status >= 500) {
    return 'No pudimos crear los invitados y no se guardó ninguno. Revisa los datos y reintenta.'
  }
  return getApiErrorMessage(err, 'Error al importar los invitados')
}

interface Props {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  eventId: string
  onPublicContentChanged?: () => void
  onCreated?: (guests: Guest[]) => void
}

export function GuestBatchModal({ isOpen, setIsOpen, eventId, onPublicContentChanged, onCreated }: Props) {
  const [rows, setRows] = useState<GuestRow[]>([createEmptyRow()])
  const [errors, setErrors] = useState<Record<string, RowErrors>>({})
  const [csvNotice, setCsvNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [csvReading, setCsvReading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<FileReader | null>(null)
  const submissionRef = useRef<AbortController | null>(null)
  // One Idempotency-Key per payload: a retry of the same import (e.g. after a timeout) replays
  // the first result on the server instead of creating every guest again (GST-13).
  const importKeyRef = useRef<{ signature: string; key: string } | null>(null)
  // Guests already in the event, loaded once per opening to warn about repeats before sending (GST-21).
  const [existingGuests, setExistingGuests] = useState<Guest[] | null>(null)
  const [duplicateCheckFailed, setDuplicateCheckFailed] = useState(false)
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] = useState(false)
  const duplicates = useMemo(
    () => (existingGuests ? findDuplicateGuestRows(rows, existingGuests) : new Map<number, GuestDuplicate>()),
    [rows, existingGuests]
  )

  const loadExistingGuests = async (): Promise<Guest[] | null> => {
    if (existingGuests) return existingGuests
    try {
      const res = await api.get(eventGuestsPath(eventId))
      const list = readApiList<Guest>(res.data)
      setExistingGuests(list)
      setDuplicateCheckFailed(false)
      return list
    } catch {
      // The import still works; the host is told that repeats were not checked.
      setDuplicateCheckFailed(true)
      return null
    }
  }

  const skipDuplicates = () => {
    const skipped = duplicates.size
    if (skipped === 0) return
    const kept = rows.filter((_, index) => !duplicates.has(index))
    const keptIds = new Set(kept.map((row) => row.id))
    setRows(kept.length > 0 ? kept : [createEmptyRow()])
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => keptIds.has(id))))
    setDuplicatesAcknowledged(false)
    toast.success(skipped === 1 ? 'Omitimos 1 fila repetida' : `Omitimos ${skipped} filas repetidas`)
  }

  useEffect(
    () => () => {
      readerRef.current?.abort()
      submissionRef.current?.abort()
    },
    []
  )

  const errorSummary = rows.flatMap((row, index) =>
    Object.values(errors[row.id] ?? {}).map((message) => `${rowLabel(row, index)}: ${message}`)
  )

  const handleCSVFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Solo se aceptan archivos .csv')
      return
    }
    if (file.size <= 0) {
      toast.error('El archivo CSV está vacío')
      return
    }
    if (file.size > GUEST_CSV_MAX_BYTES) {
      toast.error('El CSV no puede superar los 2 MB')
      return
    }

    readerRef.current?.abort()
    const reader = new FileReader()
    readerRef.current = reader
    setCsvReading(true)
    reader.onload = (e) => {
      try {
        const result = e.target?.result
        const text = result instanceof ArrayBuffer ? decodeCsvBytes(result) : typeof result === 'string' ? result : ''
        const parsed = parseGuestCsv(text)
        if (parsed.dataRowCount > GUEST_CSV_MAX_ROWS) {
          toast.error(`El CSV no puede incluir más de ${GUEST_CSV_MAX_ROWS} invitados`)
          return
        }
        if (parsed.rows.length === 0) {
          toast.error('No se encontraron datos válidos en el CSV')
          return
        }
        const nextRows: GuestRow[] = parsed.rows.map((row) => ({ id: crypto.randomUUID(), ...row }))
        const companionIssues: Record<string, RowErrors> = {}
        for (const issue of parsed.issues) {
          const row = nextRows.find((candidate) => candidate.line === issue.line)
          if (row) companionIssues[row.id] = { companions: issue.message }
        }
        const nextErrors = validateRows(nextRows, companionIssues)
        setRows(nextRows)
        setErrors(nextErrors)
        setDuplicatesAcknowledged(false)
        void loadExistingGuests()
        const notices: string[] = []
        if (!parsed.headerDetected) {
          notices.push('El archivo no tiene encabezados: leímos las columnas en el orden de la plantilla.')
        }
        if (parsed.ignoredColumns.length > 0) {
          notices.push(
            `No importamos las columnas ${parsed.ignoredColumns.map((name) => `"${name}"`).join(', ')}. Las mesas se asignan en la pestaña Mesas.`
          )
        }
        setCsvNotice(notices.length > 0 ? notices.join(' ') : null)
        const invalidRows = Object.keys(nextErrors).length
        if (invalidRows > 0) {
          toast.error(
            `${nextRows.length} invitados cargados; ${invalidRows} fila${invalidRows !== 1 ? 's tienen' : ' tiene'} errores por corregir`
          )
        } else {
          toast.success(`${nextRows.length} invitados cargados desde CSV`)
        }
      } finally {
        if (readerRef.current === reader) {
          readerRef.current = null
          setCsvReading(false)
        }
      }
    }
    reader.onerror = () => {
      if (readerRef.current === reader) {
        readerRef.current = null
        setCsvReading(false)
        toast.error('No pudimos leer el CSV. Verifica el archivo e inténtalo de nuevo.')
      }
    }
    reader.onabort = () => {
      if (readerRef.current === reader) {
        readerRef.current = null
        setCsvReading(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const addRow = () => setRows((prev) => [...prev, createEmptyRow()])

  const removeRow = (id: string) => {
    if (rows.length === 1) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateRow = (id: string, field: keyof GuestRow, value: string | number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    // Clear error for the field when user edits
    if (errors[id]) {
      setErrors((prev) => {
        const rowErrors = { ...prev[id] }
        delete rowErrors[field as keyof RowErrors]
        return Object.keys(rowErrors).length === 0
          ? (() => {
              const next = { ...prev }
              delete next[id]
              return next
            })()
          : { ...prev, [id]: rowErrors }
      })
    }
  }

  const handleClose = () => {
    readerRef.current?.abort()
    readerRef.current = null
    submissionRef.current?.abort()
    submissionRef.current = null
    setCsvReading(false)
    setLoading(false)
    setIsOpen(false)
    setRows([createEmptyRow()])
    setErrors({})
    setCsvNotice(null)
    setExistingGuests(null)
    setDuplicateCheckFailed(false)
    setDuplicatesAcknowledged(false)
  }

  const handleSubmit = async () => {
    if (loading) return
    const validationErrors = validateRows(rows, errors)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.error('Corrige los errores marcados antes de importar')
      return
    }

    // Repeats are shown before anything is sent; a second click creates them anyway.
    if (!duplicatesAcknowledged) {
      setLoading(true)
      const existing = await loadExistingGuests()
      setLoading(false)
      const repeated = existing ? findDuplicateGuestRows(rows, existing).size : 0
      if (repeated > 0) {
        setDuplicatesAcknowledged(true)
        toast.error(
          `${repeated === 1 ? '1 fila repite' : `${repeated} filas repiten`} invitados. Omítelas o pulsa Importar de nuevo para crearlas igual.`
        )
        return
      }
    }

    submissionRef.current?.abort()
    const controller = new AbortController()
    submissionRef.current = controller
    setLoading(true)
    try {
      const payload = rows.map((r) => {
        const partySize = partySizeFromCompanions(r.companions)
        return {
          event_id: eventId,
          first_name: r.first_name.trim(),
          last_name: r.last_name.trim(),
          email: r.email.trim() || undefined,
          phone: r.phone.trim() || undefined,
          // The invitation allows the guest plus their companions (GST-2).
          guests_count: partySize,
          max_guests: partySize,
          ...(r.order !== '' ? { order: r.order } : {}),
          role: r.role.trim() || undefined,
          is_host: isHostGuestRole(r.role),
        }
      })

      const signature = JSON.stringify(payload)
      if (importKeyRef.current?.signature !== signature) {
        importKeyRef.current = { signature, key: createIdempotencyKey() }
      }

      const res = await api.post(batchGuestsPath(), payload, {
        signal: controller.signal,
        timeout: 2 * 60 * 1000,
        headers: { 'Idempotency-Key': importKeyRef.current.key },
      })
      if (controller.signal.aborted) return
      const createdGuests = readApiList<Guest>(res.data)
      if (createdGuests.length === 0) {
        throw new Error('El servidor no confirmó la importación. Reintenta sin cerrar esta ventana.')
      }
      importKeyRef.current = null
      if (onCreated) onCreated(createdGuests)
      else {
        await mutate(
          eventGuestsPath(eventId),
          (current: unknown) => upsertGuestListCacheValue(current, createdGuests),
          {
            revalidate: createdGuests.length === 0,
          }
        )
      }
      if (createdGuests.length > 0) onPublicContentChanged?.()

      const count = createdGuests.length
      toast.success(`${count} invitado${count !== 1 ? 's' : ''} agregado${count !== 1 ? 's' : ''} con sus invitaciones`)
      handleClose()
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        const writeError = readGuestWriteError(err)
        const rowIndex = writeError?.row ? writeError.row - 1 : -1
        const row = rowIndex >= 0 ? rows[rowIndex] : undefined
        if (writeError && row) {
          // The server names the refused row ("Invitado N"): mark it in the grid and the summary.
          const field: keyof RowErrors | null =
            writeError.field === 'first_name' ||
            writeError.field === 'last_name' ||
            writeError.field === 'email' ||
            writeError.field === 'phone'
              ? writeError.field
              : writeError.field === 'guests_count' || writeError.field === 'max_guests'
                ? 'companions'
                : null
          if (field) {
            setErrors((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [field]: writeError.message } }))
          }
          toast.error(`${rowLabel(row, rowIndex)}: ${writeError.message}`)
        } else {
          toast.error(writeError?.message ?? importErrorMessage(err))
        }
      }
    } finally {
      if (submissionRef.current === controller) {
        submissionRef.current = null
        setLoading(false)
      }
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} size="4xl">
      <DialogTitle>Importación masiva de invitados</DialogTitle>

      <DialogBody className="py-4">
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
          <UsersIcon className="size-4 shrink-0 text-indigo-400" />
          <p className="text-sm text-ink-secondary">
            Agrega múltiples invitados a la vez. Se crearán automáticamente sus invitaciones y tokens de RSVP.
          </p>
        </div>

        {/* CSV upload area */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!csvReading) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (csvReading) return
            const file = e.dataTransfer.files[0]
            if (file) handleCSVFile(file)
          }}
          className={[
            'mb-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
            isDragging
              ? 'border-indigo-500/60 bg-indigo-500/10'
              : 'border-white/10 hover:border-white/20 hover:bg-white/5',
          ].join(' ')}
          onClick={() => !csvReading && fileInputRef.current?.click()}
          aria-busy={csvReading}
        >
          <DocumentArrowUpIcon className="size-6 text-ink-muted" />
          <p className="text-sm text-ink-secondary">
            {csvReading ? (
              <span role="status" aria-live="polite">
                Leyendo CSV…
              </span>
            ) : (
              <>
                Arrastra un <span className="font-medium text-ink-secondary">.csv</span> o haz clic para seleccionar
              </>
            )}
          </p>
          <p className="text-xs text-ink-muted">Hasta 2 MB · máximo {GUEST_CSV_MAX_ROWS} invitados</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                downloadTemplate()
              }}
              className="flex items-center gap-1.5 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
            >
              <ArrowDownTrayIcon className="size-3.5" />
              Descargar plantilla CSV
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={csvReading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleCSVFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {csvNotice && (
          <p
            role="status"
            className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-secondary"
          >
            {csvNotice}
          </p>
        )}

        {duplicates.size > 0 && (
          <div
            role="status"
            data-testid="guest-import-duplicates"
            className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
          >
            <p className="font-medium">
              {duplicates.size === 1
                ? '1 fila parece repetir un invitado (mismo correo, teléfono o nombre):'
                : `${duplicates.size} filas parecen repetir invitados (mismo correo, teléfono o nombre):`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {Array.from(duplicates.entries())
                .slice(0, ERROR_SUMMARY_LIMIT)
                .map(([index, duplicate]) => {
                  const row = rows[index]
                  if (!row) return null
                  return (
                    <li key={row.id}>
                      {rowLabel(row, index)}: {`${row.first_name} ${row.last_name}`.trim()} — {duplicateText(duplicate)}
                    </li>
                  )
                })}
            </ul>
            {duplicates.size > ERROR_SUMMARY_LIMIT && <p className="mt-1">y {duplicates.size - ERROR_SUMMARY_LIMIT} más.</p>}
            <button
              type="button"
              onClick={skipDuplicates}
              className="mt-2 font-semibold text-amber-300 underline-offset-2 hover:text-white hover:underline"
            >
              Omitir {duplicates.size === 1 ? 'la fila repetida' : `las ${duplicates.size} filas repetidas`}
            </button>
          </div>
        )}

        {duplicateCheckFailed && (
          <p role="status" className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-secondary">
            No pudimos revisar si hay invitados repetidos. Puedes importar igual.
          </p>
        )}

        {errorSummary.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300"
          >
            <p className="font-medium">Corrige estas filas antes de importar:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {errorSummary.slice(0, ERROR_SUMMARY_LIMIT).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {errorSummary.length > ERROR_SUMMARY_LIMIT && (
              <p className="mt-1">y {errorSummary.length - ERROR_SUMMARY_LIMIT} más.</p>
            )}
          </div>
        )}

        <p className="mb-2 px-1 text-xs text-ink-muted">
          <span className="font-medium text-ink-secondary">Acompañantes</span>: personas que llegan con el invitado, sin
          contarlo. Su invitación permitirá 1 + acompañantes. Las mesas se asignan después en la pestaña Mesas.
        </p>

        {/* Desktop table header — hidden on mobile */}
        <div className="mb-2 hidden grid-cols-[1fr_1fr_1.2fr_0.8fr_0.7fr_0.55fr_0.8fr_auto] gap-2 px-1 md:grid">
          {['Nombre *', 'Apellido *', 'Correo', 'Teléfono', 'Acompañantes', 'Orden', 'Rol', ''].map((h) => (
            <p key={h} className="text-xs font-medium tracking-wide text-ink-muted uppercase">
              {h}
            </p>
          ))}
        </div>

        {/* Rows */}
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          <AnimatePresence>
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Desktop: table row */}
                <div className="hidden grid-cols-[1fr_1fr_1.2fr_0.8fr_0.7fr_0.55fr_0.8fr_auto] items-start gap-2 md:grid">
                  <Field>
                    <input
                      value={row.first_name}
                      onChange={(e) => updateRow(row.id, 'first_name', e.target.value)}
                      placeholder="Nombre"
                      aria-label="Nombre"
                      autoFocus={index === rows.length - 1 && index > 0}
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.first_name ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.first_name && (
                      <p className="mt-1 text-xs text-red-400">{errors[row.id].first_name}</p>
                    )}
                  </Field>

                  <Field>
                    <input
                      value={row.last_name}
                      onChange={(e) => updateRow(row.id, 'last_name', e.target.value)}
                      placeholder="Apellido"
                      aria-label="Apellido"
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.last_name ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.last_name && (
                      <p className="mt-1 text-xs text-red-400">{errors[row.id].last_name}</p>
                    )}
                  </Field>

                  <Field>
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                      placeholder="Correo"
                      aria-label="Correo electrónico"
                      aria-invalid={Boolean(errors[row.id]?.email)}
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.email ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.email && <p className="mt-1 text-xs text-red-400">{errors[row.id].email}</p>}
                  </Field>

                  <input
                    value={row.phone}
                    onChange={(e) => updateRow(row.id, 'phone', e.target.value)}
                    placeholder="Teléfono"
                    aria-label="Teléfono"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <Field>
                    <input
                      type="number"
                      min={0}
                      max={GUEST_COMPANIONS_MAX}
                      value={row.companions}
                      onChange={(e) => updateRow(row.id, 'companions', Math.max(0, parseInt(e.target.value) || 0))}
                      aria-label="Acompañantes"
                      title="Personas que llegan con el invitado, sin contarlo"
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-center text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.companions ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                  </Field>

                  <input
                    type="number"
                    min={0}
                    max={9999}
                    step={1}
                    value={row.order}
                    onChange={(e) =>
                      updateRow(row.id, 'order', e.target.value === '' ? '' : parsePublicOrder(e.target.value))
                    }
                    aria-label="Orden público"
                    placeholder="0"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-center text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <select
                    value={row.role}
                    onChange={(e) => updateRow(row.id, 'role', e.target.value)}
                    aria-label="Rol público"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">Sin rol</option>
                    {PUBLIC_GUEST_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-pink-500/10 hover:text-pink-400 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Eliminar fila"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>

                {/* Mobile: card layout */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-surface/50 p-3 md:hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">#{index + 1}</span>
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-pink-500/10 hover:text-pink-400 disabled:opacity-30"
                      aria-label="Eliminar fila"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">Nombre *</label>
                      <input
                        value={row.first_name}
                        onChange={(e) => updateRow(row.id, 'first_name', e.target.value)}
                        placeholder="Nombre"
                      aria-label="Nombre"
                        autoFocus={index === rows.length - 1 && index > 0}
                        className={[
                          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                          errors[row.id]?.first_name ? 'border-red-500/50' : 'border-white/10',
                        ].join(' ')}
                      />
                      {errors[row.id]?.first_name && (
                        <p className="mt-1 text-xs text-red-400">{errors[row.id].first_name}</p>
                      )}
                    </Field>
                    <Field>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">Apellido *</label>
                      <input
                        value={row.last_name}
                        onChange={(e) => updateRow(row.id, 'last_name', e.target.value)}
                        placeholder="Apellido"
                      aria-label="Apellido"
                        className={[
                          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                          errors[row.id]?.last_name ? 'border-red-500/50' : 'border-white/10',
                        ].join(' ')}
                      />
                      {errors[row.id]?.last_name && (
                        <p className="mt-1 text-xs text-red-400">{errors[row.id].last_name}</p>
                      )}
                    </Field>
                  </div>
                  <div>
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                      placeholder="Correo"
                      aria-label="Correo electrónico"
                      aria-invalid={Boolean(errors[row.id]?.email)}
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.email ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.email && <p className="mt-1 text-xs text-red-400">{errors[row.id].email}</p>}
                  </div>
                  <input
                    value={row.phone}
                    onChange={(e) => updateRow(row.id, 'phone', e.target.value)}
                    placeholder="Teléfono"
                    aria-label="Teléfono"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">
                        Acompañantes <span className="normal-case">(sin contar al invitado)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={GUEST_COMPANIONS_MAX}
                        value={row.companions}
                        onChange={(e) => updateRow(row.id, 'companions', Math.max(0, parseInt(e.target.value) || 0))}
                        aria-label="Acompañantes"
                        className={[
                          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                          errors[row.id]?.companions ? 'border-red-500/50' : 'border-white/10',
                        ].join(' ')}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">Orden</label>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step={1}
                        value={row.order}
                        onChange={(e) =>
                          updateRow(row.id, 'order', e.target.value === '' ? '' : parsePublicOrder(e.target.value))
                        }
                        aria-label="Orden público"
                        placeholder="0"
                        className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <select
                    value={row.role}
                    onChange={(e) => updateRow(row.id, 'role', e.target.value)}
                    aria-label="Rol público"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">Sin rol</option>
                    {PUBLIC_GUEST_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add row button */}
        <button
          onClick={addRow}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-2.5 text-sm text-ink-muted transition-all hover:border-white/20 hover:bg-white/5 hover:text-ink-secondary"
        >
          <PlusIcon className="size-4" />
          Agregar fila
        </button>

        <p className="mt-3 text-center text-xs text-ink-muted">
          {rows.length} invitado{rows.length !== 1 ? 's' : ''} · Los campos con * son obligatorios
        </p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose}>
          {loading ? 'Cancelar importación' : 'Cancelar'}
        </Button>
        <Button onClick={handleSubmit} disabled={loading || csvReading}>
          {loading ? 'Importando…' : `Importar ${rows.length} invitado${rows.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
