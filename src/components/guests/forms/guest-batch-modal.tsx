'use client'

import { useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field } from '@/components/fieldset'

import { api } from '@/lib/api'
import { readApiList } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { batchGuestsPath, eventGuestsPath } from '@/lib/api-paths'
import { upsertGuestListCacheValue } from '@/lib/guest-cache'
import { PUBLIC_GUEST_ROLES, isHostGuestRole } from '@/lib/public-guest-roles'
import type { Guest } from '@/models/Guest'
import { ArrowDownTrayIcon, DocumentArrowUpIcon, PlusIcon, TrashIcon, UsersIcon } from '@heroicons/react/16/solid'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'

interface GuestRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  guests_count: number
  table_number: string
  order: number | ''
  role: string
}

interface RowErrors {
  first_name?: string
  last_name?: string
}

export const GUEST_CSV_MAX_BYTES = 2 * 1024 * 1024
export const GUEST_CSV_MAX_ROWS = 1000

function createEmptyRow(): GuestRow {
  return {
    id: crypto.randomUUID(),
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    guests_count: 1,
    table_number: '',
    order: '',
    role: '',
  }
}

function downloadTemplate() {
  const headers = 'nombre,apellido,correo,telefono,acompanantes,mesa,orden,rol'
  const example = 'Ana,Garcia,ana@ejemplo.com,+52 55 1234 5678,1,Mesa 1,1,graduate'
  const csv = `\uFEFF${headers}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-invitados.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parsePublicOrder(value: string): number | '' {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const number = Number(trimmed)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : ''
}

function parseOrderAndRole(orderOrRole: string, explicitRole = ''): Pick<GuestRow, 'order' | 'role'> {
  const order = parsePublicOrder(orderOrRole)
  const role = explicitRole.trim()
  if (role) return { order, role }
  if (order === '' && orderOrRole.trim()) return { order: '', role: orderOrRole }
  return { order, role: '' }
}

function parseCSV(text: string): GuestRow[] {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []

  // Skip header row
  const dataLines = lines.slice(1)
  return dataLines
    .map((line) => {
      // Handle quoted commas
      const cols: string[] = []
      let current = ''
      let inQuotes = false
      for (const ch of line) {
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          cols.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      cols.push(current.trim())

      const [
        first_name = '',
        last_name = '',
        email = '',
        phone = '',
        guests_count_str = '1',
        table_number = '',
        order_or_role = '',
        explicit_role = '',
      ] = cols
      if (!first_name && !last_name) return null
      const publicFields = parseOrderAndRole(order_or_role, explicit_role)
      return {
        id: crypto.randomUUID(),
        first_name,
        last_name,
        email,
        phone,
        guests_count: parseInt(guests_count_str) || 1,
        table_number,
        ...publicFields,
      } satisfies GuestRow
    })
    .filter((r): r is GuestRow => r !== null)
}

function validateRows(rows: GuestRow[]): Record<string, RowErrors> {
  const errors: Record<string, RowErrors> = {}
  for (const row of rows) {
    const rowErrors: RowErrors = {}
    if (row.first_name.trim().length < 2) rowErrors.first_name = 'Mínimo 2 caracteres'
    if (row.last_name.trim().length < 2) rowErrors.last_name = 'Mínimo 2 caracteres'
    if (Object.keys(rowErrors).length > 0) errors[row.id] = rowErrors
  }
  return errors
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
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [csvReading, setCsvReading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<FileReader | null>(null)
  const submissionRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      readerRef.current?.abort()
      submissionRef.current?.abort()
    },
    []
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
        const text = typeof e.target?.result === 'string' ? e.target.result : ''
        const dataRowCount = Math.max(0, text.split(/\r?\n/).filter(Boolean).length - 1)
        if (dataRowCount > GUEST_CSV_MAX_ROWS) {
          toast.error(`El CSV no puede incluir más de ${GUEST_CSV_MAX_ROWS} invitados`)
          return
        }
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          toast.error('No se encontraron datos válidos en el CSV')
          return
        }
        setRows(parsed)
        setErrors({})
        toast.success(`${parsed.length} invitados cargados desde CSV`)
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
    reader.readAsText(file, 'UTF-8')
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
  }

  const handleSubmit = async () => {
    const validationErrors = validateRows(rows)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.error('Corrige los errores antes de continuar')
      return
    }

    submissionRef.current?.abort()
    const controller = new AbortController()
    submissionRef.current = controller
    setLoading(true)
    try {
      const payload = rows.map((r) => ({
        event_id: eventId,
        first_name: r.first_name.trim(),
        last_name: r.last_name.trim(),
        email: r.email.trim() || undefined,
        phone: r.phone.trim() || undefined,
        guests_count: r.guests_count,
        max_guests: r.guests_count,
        table_number: r.table_number.trim() || undefined,
        ...(r.order !== '' ? { order: r.order } : {}),
        role: r.role.trim() || undefined,
        is_host: isHostGuestRole(r.role),
      }))

      const res = await api.post(batchGuestsPath(), payload, {
        signal: controller.signal,
        timeout: 2 * 60 * 1000,
      })
      if (controller.signal.aborted) return
      const createdGuests = readApiList<Guest>(res.data)
      if (createdGuests.length === 0) {
        throw new Error('El servidor no confirmó la importación. Reintenta sin cerrar esta ventana.')
      }
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

      toast.success(
        `${rows.length} invitado${rows.length !== 1 ? 's' : ''} agregado${rows.length !== 1 ? 's' : ''} con sus invitaciones`
      )
      handleClose()
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        toast.error(getApiErrorMessage(err, 'Error al importar los invitados'))
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

        {/* Desktop table header — hidden on mobile */}
        <div className="mb-2 hidden grid-cols-[1fr_1fr_1.2fr_0.8fr_0.55fr_0.7fr_0.55fr_0.8fr_auto] gap-2 px-1 md:grid">
          {['Nombre *', 'Apellido *', 'Correo', 'Teléfono', '+1s', 'Mesa', 'Orden', 'Rol', ''].map((h) => (
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
                <div className="hidden grid-cols-[1fr_1fr_1.2fr_0.8fr_0.55fr_0.7fr_0.55fr_0.8fr_auto] items-start gap-2 md:grid">
                  <Field>
                    <input
                      value={row.first_name}
                      onChange={(e) => updateRow(row.id, 'first_name', e.target.value)}
                      placeholder="Ana"
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
                      placeholder="García"
                      className={[
                        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none',
                        errors[row.id]?.last_name ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.last_name && (
                      <p className="mt-1 text-xs text-red-400">{errors[row.id].last_name}</p>
                    )}
                  </Field>

                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <input
                    value={row.phone}
                    onChange={(e) => updateRow(row.id, 'phone', e.target.value)}
                    placeholder="+52 55…"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={row.guests_count}
                    onChange={(e) => updateRow(row.id, 'guests_count', parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-center text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <input
                    value={row.table_number}
                    onChange={(e) => updateRow(row.id, 'table_number', e.target.value)}
                    placeholder="Mesa 1"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <input
                    type="number"
                    min={0}
                    max={9999}
                    step={1}
                    value={row.order}
                    onChange={(e) =>
                      updateRow(row.id, 'order', e.target.value === '' ? '' : parsePublicOrder(e.target.value))
                    }
                    aria-label="Orden publico"
                    placeholder="0"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-center text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />

                  <select
                    value={row.role}
                    onChange={(e) => updateRow(row.id, 'role', e.target.value)}
                    aria-label="Rol publico"
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
                        placeholder="Ana"
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
                        placeholder="García"
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
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                    placeholder="Correo electrónico"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <input
                    value={row.phone}
                    onChange={(e) => updateRow(row.id, 'phone', e.target.value)}
                    placeholder="Teléfono"
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">+1s</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={row.guests_count}
                        onChange={(e) => updateRow(row.id, 'guests_count', parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-ink-muted uppercase">Mesa</label>
                      <input
                        value={row.table_number}
                        onChange={(e) => updateRow(row.id, 'table_number', e.target.value)}
                        placeholder="Mesa 1"
                        className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
                        aria-label="Orden publico"
                        placeholder="0"
                        className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <select
                    value={row.role}
                    onChange={(e) => updateRow(row.id, 'role', e.target.value)}
                    aria-label="Rol publico"
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
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Importando…' : `Importar ${rows.length} invitado${rows.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
