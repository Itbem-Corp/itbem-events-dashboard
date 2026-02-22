'use client'

import { useState, useRef } from 'react'
import { mutate } from 'swr'

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Button } from '@/components/button'
import { Field, ErrorMessage } from '@/components/fieldset'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, TrashIcon, UsersIcon, ArrowDownTrayIcon, DocumentArrowUpIcon } from '@heroicons/react/16/solid'

interface GuestRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  guests_count: number
  table_number: string
}

interface RowErrors {
  first_name?: string
  last_name?: string
}

function createEmptyRow(): GuestRow {
  return {
    id: crypto.randomUUID(),
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    guests_count: 1,
    table_number: '',
  }
}

function downloadTemplate() {
  const headers = 'nombre,apellido,correo,telefono,acompanantes,mesa'
  const example = 'Ana,García,ana@ejemplo.com,+52 55 1234 5678,1,Mesa 1'
  const csv = `\uFEFF${headers}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-invitados.csv'
  a.click()
  URL.revokeObjectURL(url)
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
        if (ch === '"') { inQuotes = !inQuotes }
        else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = '' }
        else { current += ch }
      }
      cols.push(current.trim())

      const [first_name = '', last_name = '', email = '', phone = '', guests_count_str = '1', table_number = ''] = cols
      if (!first_name && !last_name) return null
      return {
        id: crypto.randomUUID(),
        first_name,
        last_name,
        email,
        phone,
        guests_count: parseInt(guests_count_str) || 1,
        table_number,
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
  eventIdentifier: string
}

export function GuestBatchModal({ isOpen, setIsOpen, eventId, eventIdentifier }: Props) {
  const [rows, setRows] = useState<GuestRow[]>([createEmptyRow()])
  const [errors, setErrors] = useState<Record<string, RowErrors>>({})
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCSVFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Solo se aceptan archivos .csv')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        toast.error('No se encontraron datos válidos en el CSV')
        return
      }
      setRows(parsed)
      setErrors({})
      toast.success(`${parsed.length} invitados cargados desde CSV`)
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
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
    // Clear error for the field when user edits
    if (errors[id]) {
      setErrors((prev) => {
        const rowErrors = { ...prev[id] }
        delete rowErrors[field as keyof RowErrors]
        return Object.keys(rowErrors).length === 0
          ? (() => { const next = { ...prev }; delete next[id]; return next })()
          : { ...prev, [id]: rowErrors }
      })
    }
  }

  const handleClose = () => {
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

    setLoading(true)
    try {
      const payload = rows.map((r) => ({
        event_id: eventId,
        first_name: r.first_name.trim(),
        last_name: r.last_name.trim(),
        email: r.email.trim() || undefined,
        phone: r.phone.trim() || undefined,
        guests_count: r.guests_count,
        table_number: r.table_number.trim() || undefined,
      }))

      await api.post('/guests/batch', payload)
      await mutate(`/guests/all:${eventId}`)

      toast.success(`${rows.length} invitado${rows.length !== 1 ? 's' : ''} agregado${rows.length !== 1 ? 's' : ''} con sus invitaciones`)
      handleClose()
    } catch {
      toast.error('Error al importar los invitados')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} size="4xl">
      <DialogTitle>Importación masiva de invitados</DialogTitle>

      <DialogBody className="py-4">
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 px-4 py-3">
          <UsersIcon className="size-4 text-indigo-400 shrink-0" />
          <p className="text-sm text-zinc-400">
            Agrega múltiples invitados a la vez. Se crearán automáticamente sus invitaciones y tokens de RSVP.
          </p>
        </div>

        {/* CSV upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleCSVFile(file)
          }}
          className={[
            'mb-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer',
            isDragging ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5',
          ].join(' ')}
          onClick={() => fileInputRef.current?.click()}
        >
          <DocumentArrowUpIcon className="size-6 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Arrastra un <span className="font-medium text-zinc-300">.csv</span> o haz clic para seleccionar
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); downloadTemplate() }}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ArrowDownTrayIcon className="size-3.5" />
              Descargar plantilla CSV
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleCSVFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1.2fr_0.8fr_0.6fr_0.6fr_auto] gap-2 px-1 mb-2">
          {['Nombre *', 'Apellido *', 'Correo', 'Teléfono', '+1s', 'Mesa', ''].map((h) => (
            <p key={h} className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              {h}
            </p>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          <AnimatePresence>
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="grid grid-cols-[1fr_1fr_1.2fr_0.8fr_0.6fr_0.6fr_auto] gap-2 items-start">
                  {/* Nombre */}
                  <Field>
                    <input
                      value={row.first_name}
                      onChange={(e) => updateRow(row.id, 'first_name', e.target.value)}
                      placeholder="Ana"
                      autoFocus={index === rows.length - 1 && index > 0}
                      className={[
                        'w-full rounded-lg border bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500',
                        errors[row.id]?.first_name ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.first_name && (
                      <p className="mt-1 text-xs text-red-400">{errors[row.id].first_name}</p>
                    )}
                  </Field>

                  {/* Apellido */}
                  <Field>
                    <input
                      value={row.last_name}
                      onChange={(e) => updateRow(row.id, 'last_name', e.target.value)}
                      placeholder="García"
                      className={[
                        'w-full rounded-lg border bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500',
                        errors[row.id]?.last_name ? 'border-red-500/50' : 'border-white/10',
                      ].join(' ')}
                    />
                    {errors[row.id]?.last_name && (
                      <p className="mt-1 text-xs text-red-400">{errors[row.id].last_name}</p>
                    )}
                  </Field>

                  {/* Email */}
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />

                  {/* Teléfono */}
                  <input
                    value={row.phone}
                    onChange={(e) => updateRow(row.id, 'phone', e.target.value)}
                    placeholder="+52 55…"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />

                  {/* Acompañantes */}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={row.guests_count}
                    onChange={(e) => updateRow(row.id, 'guests_count', parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                  />

                  {/* Mesa */}
                  <input
                    value={row.table_number}
                    onChange={(e) => updateRow(row.id, 'table_number', e.target.value)}
                    placeholder="Mesa 1"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />

                  {/* Delete row */}
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="p-2 rounded-lg text-zinc-600 hover:text-pink-400 hover:bg-pink-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Eliminar fila"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add row button */}
        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 hover:border-white/20 hover:bg-white/5 transition-all w-full justify-center"
        >
          <PlusIcon className="size-4" />
          Agregar fila
        </button>

        <p className="mt-3 text-xs text-zinc-600 text-center">
          {rows.length} invitado{rows.length !== 1 ? 's' : ''} · Los campos con * son obligatorios
        </p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading
            ? 'Importando…'
            : `Importar ${rows.length} invitado${rows.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
