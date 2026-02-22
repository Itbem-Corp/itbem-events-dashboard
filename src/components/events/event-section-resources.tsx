'use client'

import { useRef, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { EventSection } from '@/models/EventSection'

import {
  PhotoIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/20/solid'

// ─── Section image requirements per SDUI component type ──────────────────────

const SECTION_IMAGES: Record<string, Array<{ position: number; label: string; ratio: string }>> = {
  GraduationHero: [
    { position: 0, label: 'Imagen principal (hero)', ratio: '3:2' },
    { position: 1, label: 'Logo de la escuela',       ratio: '1:1' },
  ],
  EventVenue: [
    { position: 0, label: 'Foto izquierda (columna 2)', ratio: '3:2' },
    { position: 1, label: 'Foto derecha (columna 2)',   ratio: '3:2' },
    { position: 2, label: 'Foto central (centrada)',    ratio: '3:2' },
  ],
  Reception: [
    { position: 0, label: 'Foto superior izquierda', ratio: '3:2' },
    { position: 1, label: 'Foto superior derecha',   ratio: '3:2' },
    { position: 2, label: 'Foto inferior izquierda', ratio: '3:2' },
    { position: 3, label: 'Foto inferior derecha',   ratio: '3:2' },
  ],
  GraduatesList: [
    { position: 0, label: 'Foto grupal (footer)', ratio: '5:2' },
  ],
  PhotoGrid: [
    { position: 0, label: 'Foto 1 (fila 2-col)',   ratio: '3:2' },
    { position: 1, label: 'Foto 2 (fila 2-col)',   ratio: '3:2' },
    { position: 2, label: 'Foto 3 (fila 3-col)',   ratio: '4:3' },
    { position: 3, label: 'Foto 4 (fila 3-col)',   ratio: '4:3' },
    { position: 4, label: 'Foto 5 (fila 3-col)',   ratio: '4:3' },
  ],
  RSVPConfirmation: [
    { position: 0, label: 'Imagen "Declinado"',   ratio: '3:2' },
    { position: 1, label: 'Imagen "Confirmado"',  ratio: '3:2' },
  ],
  GALLERY: [
    { position: 0, label: 'Foto 1', ratio: '4:3' },
    { position: 1, label: 'Foto 2', ratio: '4:3' },
    { position: 2, label: 'Foto 3', ratio: '4:3' },
    { position: 3, label: 'Foto 4', ratio: '4:3' },
    { position: 4, label: 'Foto 5', ratio: '4:3' },
    { position: 5, label: 'Foto 6', ratio: '4:3' },
  ],
}

interface Resource {
  id: string
  path: string
  view_url?: string
  title?: string
  alt_text?: string
  position: number
}

// ─── Image Slot ───────────────────────────────────────────────────────────────

interface ImageSlotProps {
  slot: { position: number; label: string; ratio: string }
  resource?: Resource
  sectionId: string
  resourceTypeId: string
  onUploaded: () => void
  onDeleted: () => void
}

function ImageSlot({ slot, resource, sectionId, resourceTypeId, onUploaded, onDeleted }: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('event_section_id', sectionId)
      form.append('position', String(slot.position))
      form.append('title', slot.label)
      form.append('alt_text', slot.label)
      if (resourceTypeId) form.append('resource_type_id', resourceTypeId)

      await api.post('/resources', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Imagen subida')
      onUploaded()
      URL.revokeObjectURL(localUrl)
      setPreview(null)
    } catch {
      toast.error('Error al subir la imagen')
      URL.revokeObjectURL(localUrl)
      setPreview(null)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!resource) return
    setDeleting(true)
    try {
      await api.delete(`/resources/${resource.id}`)
      toast.success('Imagen eliminada')
      onDeleted()
    } catch {
      toast.error('Error al eliminar la imagen')
    } finally {
      setDeleting(false)
    }
  }

  const imgSrc = preview ?? resource?.view_url ?? resource?.path
  const isFilled = Boolean(imgSrc)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={[
            'flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
            isFilled ? 'bg-lime-500/20 text-lime-400' : 'bg-zinc-800 text-zinc-600',
          ].join(' ')}>
            {slot.position + 1}
          </span>
          <p className="text-xs font-medium text-zinc-300">{slot.label}</p>
          <span className="text-[10px] text-zinc-700">{slot.ratio}</span>
        </div>
        {isFilled ? (
          <CheckCircleIcon className="size-4 text-lime-400 shrink-0" />
        ) : (
          <ExclamationCircleIcon className="size-4 text-zinc-700 shrink-0" />
        )}
      </div>

      {/* Image preview / upload area */}
      <div className="relative group">
        {imgSrc ? (
          <div className="relative rounded-lg overflow-hidden border border-white/10">
            <img
              src={imgSrc}
              alt={slot.label}
              className="w-full h-32 object-cover"
            />
            {/* Overlay actions */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading || deleting}
                className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
              >
                <ArrowUpTrayIcon className="size-3.5" />
                Cambiar
              </button>
              <button
                onClick={handleDelete}
                disabled={uploading || deleting}
                className="flex items-center gap-1 rounded-lg bg-pink-500/20 px-2.5 py-1.5 text-xs font-medium text-pink-400 hover:bg-pink-500/30 transition-colors"
              >
                <TrashIcon className="size-3.5" />
                {deleting ? '…' : 'Eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={[
              'w-full h-28 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-all',
              uploading
                ? 'border-indigo-500/30 bg-indigo-500/5 cursor-not-allowed'
                : 'border-white/10 hover:border-white/20 hover:bg-white/5 cursor-pointer',
            ].join(' ')}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="size-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                <span className="text-xs text-zinc-500">Subiendo…</span>
              </div>
            ) : (
              <>
                <ArrowUpTrayIcon className="size-5 text-zinc-600" />
                <span className="text-xs text-zinc-500">Subir imagen</span>
                <span className="text-[10px] text-zinc-700">JPG, PNG, WebP</span>
              </>
            )}
          </button>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}

// ─── Section Resources Manager ────────────────────────────────────────────────

interface Props {
  section: EventSection
  onClose: () => void
}

export function EventSectionResources({ section, onClose }: Props) {
  const componentType = section.component_type || section.type || ''
  const slots = SECTION_IMAGES[componentType]

  const { data: resources = [], mutate } = useSWR<Resource[]>(
    section.id ? `/resources/section/${section.id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Fetch image resource type ID from catalogs
  const { data: resourceTypes = [] } = useSWR<Array<{ id: string; code: string }>>(
    '/catalogs/resource-types',
    fetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )
  const imageTypeId = resourceTypes.find((rt) => rt.code === 'IMAGE')?.id ?? ''

  const revalidate = () => {
    mutate()
    globalMutate(`/resources/section/${section.id}`)
  }

  if (!slots || slots.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-zinc-900 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Recursos — {section.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Este tipo de sección no requiere imágenes predefinidas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
        <div className="py-6 text-center">
          <PhotoIcon className="mx-auto size-8 text-zinc-700 mb-2" />
          <p className="text-sm text-zinc-600">
            Las imágenes para esta sección se gestionan directamente desde el backend.
          </p>
        </div>
      </motion.div>
    )
  }

  const filledSlots = slots.filter((slot) =>
    resources.some((r) => r.position === slot.position)
  ).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-100">Imágenes — {section.name}</p>
            <span className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              filledSlots === slots.length
                ? 'bg-lime-500/10 text-lime-400 border border-lime-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
            ].join(' ')}>
              {filledSlots}/{slots.length}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Sube las imágenes requeridas para esta sección SDUI.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cerrar
        </button>
      </div>

      {/* Image slots grid */}
      <div className={[
        'grid gap-4',
        slots.length >= 4 ? 'grid-cols-2 sm:grid-cols-3' :
        slots.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      ].join(' ')}>
        <AnimatePresence>
          {slots.map((slot) => {
            const resource = resources.find((r) => r.position === slot.position)
            return (
              <motion.div
                key={slot.position}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: slot.position * 0.05 }}
              >
                <ImageSlot
                  slot={slot}
                  resource={resource}
                  sectionId={section.id}
                  resourceTypeId={imageTypeId}
                  onUploaded={revalidate}
                  onDeleted={revalidate}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Progress footer */}
      <div className="mt-5 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between text-xs text-zinc-600 mb-1.5">
          <span>Imágenes completas</span>
          <span className={filledSlots === slots.length ? 'text-lime-400' : 'text-amber-400'}>
            {filledSlots} / {slots.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round((filledSlots / slots.length) * 100)}%` }}
            transition={{ duration: 0.5 }}
            className={[
              'h-full rounded-full',
              filledSlots === slots.length ? 'bg-lime-500' : 'bg-amber-500',
            ].join(' ')}
          />
        </div>
        {filledSlots < slots.length && (
          <p className="mt-1.5 text-xs text-zinc-700">
            Faltan {slots.length - filledSlots} imagen{slots.length - filledSlots !== 1 ? 'es' : ''} para completar esta sección.
          </p>
        )}
      </div>
    </motion.div>
  )
}
