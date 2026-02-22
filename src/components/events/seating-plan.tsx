'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Guest } from '@/models/Guest'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import {
  RectangleGroupIcon,
  UsersIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PencilIcon,
} from '@heroicons/react/20/solid'
import { XMarkIcon } from '@heroicons/react/16/solid'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  guests: Guest[]
  eventIdentifier: string
  eventId?: string
  isLoading: boolean
}

// ─── Table assignment inline editor ──────────────────────────────────────────

interface TableEditorProps {
  guest: Guest
  eventIdentifier: string
  onClose: () => void
}

function InlineTableEditor({ guest, eventIdentifier, onClose }: TableEditorProps) {
  const [value, setValue] = useState(guest.table_number ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/guests/${guest.id}`, { ...guest, table_number: value || null })
      await mutate(`/guests/${eventIdentifier}`)
      toast.success('Mesa actualizada')
      onClose()
    } catch {
      toast.error('Error al actualizar mesa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Mesa #"
        className="w-20 rounded border border-indigo-500/50 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
      >
        {saving ? '…' : 'OK'}
      </button>
      <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400">
        <XMarkIcon className="size-3.5" />
      </button>
    </div>
  )
}

// ─── Guest Card ───────────────────────────────────────────────────────────────

interface GuestCardProps {
  guest: Guest
  eventIdentifier: string
}

function GuestCard({ guest, eventIdentifier }: GuestCardProps) {
  const [editing, setEditing] = useState(false)
  const isConfirmed = guest.status?.code === 'CONFIRMED'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={[
        'rounded-lg border p-2.5 text-xs',
        isConfirmed ? 'border-lime-500/20 bg-lime-500/5' : 'border-white/10 bg-zinc-900/50',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-medium text-zinc-200 truncate">
            {guest.first_name} {guest.last_name}
          </p>
          {guest.guests_count > 1 && (
            <p className="text-zinc-600">+{guest.guests_count - 1} acomp.</p>
          )}
        </div>
        <GuestStatusBadge status={guest.status} />
      </div>
      {editing ? (
        <InlineTableEditor
          guest={guest}
          eventIdentifier={eventIdentifier}
          onClose={() => setEditing(false)}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-1 flex items-center gap-1 text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <PencilIcon className="size-2.5" />
          <span>{guest.table_number ? `Mesa ${guest.table_number}` : 'Asignar mesa'}</span>
        </button>
      )}
    </motion.div>
  )
}

// ─── Table Block ─────────────────────────────────────────────────────────────

interface TableBlockProps {
  tableLabel: string
  guests: Guest[]
  eventIdentifier: string
  index: number
}

function TableBlock({ tableLabel, guests, eventIdentifier, index }: TableBlockProps) {
  const totalAttendees = guests.reduce((sum, g) => sum + (g.guests_count ?? 1), 0)
  const confirmed = guests.filter((g) => g.status?.code === 'CONFIRMED').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-white/10 bg-zinc-900/30 overflow-hidden"
    >
      {/* Table header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <RectangleGroupIcon className="size-4 text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-200">{tableLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-zinc-500">
            <UsersIcon className="size-3.5" />
            {guests.length} inv. · {totalAttendees} asist.
          </span>
          {confirmed > 0 && (
            <span className="flex items-center gap-1 text-lime-400">
              <CheckCircleIcon className="size-3.5" />
              {confirmed} conf.
            </span>
          )}
        </div>
      </div>

      {/* Guests grid */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <AnimatePresence>
          {guests.map((g) => (
            <GuestCard key={g.id} guest={g} eventIdentifier={eventIdentifier} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── Unassigned List ──────────────────────────────────────────────────────────

function UnassignedBlock({ guests, eventIdentifier }: { guests: Guest[]; eventIdentifier: string }) {
  if (guests.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <ExclamationCircleIcon className="size-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">Sin mesa asignada</span>
        </div>
        <span className="text-xs text-amber-400">{guests.length} invitados</span>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <AnimatePresence>
          {guests.map((g) => (
            <GuestCard key={g.id} guest={g} eventIdentifier={eventIdentifier} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SeatingPlan({ guests, eventIdentifier, isLoading }: Props) {
  const [showUnassigned, setShowUnassigned] = useState(true)

  const { tables, unassigned } = useMemo(() => {
    const tableMap = new Map<string, Guest[]>()
    const unassigned: Guest[] = []

    for (const guest of guests) {
      if (guest.table_number) {
        const key = guest.table_number
        if (!tableMap.has(key)) tableMap.set(key, [])
        tableMap.get(key)!.push(guest)
      } else {
        unassigned.push(guest)
      }
    }

    // Sort tables numerically where possible
    const sorted = Array.from(tableMap.entries()).sort(([a], [b]) => {
      const na = parseInt(a), nb = parseInt(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })

    return { tables: sorted, unassigned }
  }, [guests])

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 bg-zinc-800/50 rounded-xl" />
        ))}
      </div>
    )
  }

  if (guests.length === 0) {
    return (
      <EmptyState
        icon={RectangleGroupIcon}
        title="Sin invitados"
        description="Agrega invitados y asígnales mesa para ver el plan de asientos."
      />
    )
  }

  const totalTables = tables.length
  const totalSeated = guests.length - unassigned.length
  const totalAttendees = guests.reduce((sum, g) => sum + (g.guests_count ?? 1), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-3 flex items-center gap-3">
          <RectangleGroupIcon className="size-5 text-indigo-400" />
          <div>
            <p className="text-zinc-400 text-xs">Mesas</p>
            <p className="text-xl font-bold text-zinc-100">{totalTables}</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-3 flex items-center gap-3">
          <UsersIcon className="size-5 text-violet-400" />
          <div>
            <p className="text-zinc-400 text-xs">Con mesa</p>
            <p className="text-xl font-bold text-zinc-100">{totalSeated}</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3 flex items-center gap-3">
          <ExclamationCircleIcon className="size-5 text-amber-400" />
          <div>
            <p className="text-amber-400 text-xs">Sin mesa</p>
            <p className="text-xl font-bold text-amber-300">{unassigned.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-3 flex items-center gap-3">
          <CheckCircleIcon className="size-5 text-lime-400" />
          <div>
            <p className="text-zinc-400 text-xs">Total asistentes</p>
            <p className="text-xl font-bold text-zinc-100">{totalAttendees}</p>
          </div>
        </div>
      </div>

      {/* Unassigned toggle */}
      {unassigned.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowUnassigned((v) => !v)}
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showUnassigned ? 'Ocultar' : 'Ver'} sin asignar ({unassigned.length})
          </button>
        </div>
      )}

      {/* Unassigned */}
      <AnimatePresence>
        {showUnassigned && (
          <UnassignedBlock guests={unassigned} eventIdentifier={eventIdentifier} />
        )}
      </AnimatePresence>

      {/* Tables grid */}
      {tables.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-600">
          Ningún invitado tiene mesa asignada aún.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map(([tableLabel, tableGuests], i) => (
            <TableBlock
              key={tableLabel}
              tableLabel={`Mesa ${tableLabel}`}
              guests={tableGuests}
              eventIdentifier={eventIdentifier}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}
