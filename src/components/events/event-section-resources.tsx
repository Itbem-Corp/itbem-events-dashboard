'use client'

import { UploadStatus } from '@/components/ui/upload-status'
import { useUploadTask } from '@/hooks/use-upload-task'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import {
  resourcePath,
  resourceReplacePath,
  resourcesPath,
  resourceTypesPath,
  sectionResourcesPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { prepareImageForUpload } from '@/lib/image-upload-optimization'
import {
  getSectionResourcesRefreshDelay,
  hasResourceFileMutationData,
  patchResourceFileCacheValue,
  removeResourceCacheValue,
  sectionResourcesMediaRefreshKey,
  upsertResourceCacheValue,
} from '@/lib/resource-cache'
import { readResourceMediaUrl } from '@/lib/resource-media'
import {
  SECTION_IMAGE_UPLOAD_ACCEPT,
  SECTION_IMAGE_UPLOAD_LIMIT_HELP_TEXT,
  sectionImageUploadValidationError,
} from '@/lib/resource-upload-policy'
import { canonicalSectionType } from '@/lib/section-type-aliases'
import { getUploadErrorMessage } from '@/lib/upload-transport'
import type { EventSection } from '@/models/EventSection'
import type { Resource, ResourceFileMutationResponse } from '@/models/Resource'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'

// ─── Section image requirements per SDUI component type ──────────────────────

const SECTION_IMAGES: Record<string, Array<{ position: number; label: string; ratio: string }>> = {
  GraduationHero: [
    { position: 0, label: 'Imagen principal (hero)', ratio: '3:2' },
    { position: 1, label: 'Logo de la escuela', ratio: '1:1' },
  ],
  EventVenue: [
    { position: 0, label: 'Foto izquierda (columna 2)', ratio: '3:2' },
    { position: 1, label: 'Foto derecha (columna 2)', ratio: '3:2' },
    { position: 2, label: 'Foto central (centrada)', ratio: '3:2' },
  ],
  Reception: [
    { position: 0, label: 'Foto superior izquierda', ratio: '3:2' },
    { position: 1, label: 'Foto superior derecha', ratio: '3:2' },
    { position: 2, label: 'Foto inferior izquierda', ratio: '3:2' },
    { position: 3, label: 'Foto inferior derecha', ratio: '3:2' },
  ],
  GraduatesList: [{ position: 0, label: 'Foto grupal (footer)', ratio: '5:2' }],
  PhotoGrid: [
    { position: 0, label: 'Foto 1 (fila 2-col)', ratio: '3:2' },
    { position: 1, label: 'Foto 2 (fila 2-col)', ratio: '3:2' },
    { position: 2, label: 'Foto 3 (fila 3-col)', ratio: '4:3' },
    { position: 3, label: 'Foto 4 (fila 3-col)', ratio: '4:3' },
    { position: 4, label: 'Foto 5 (fila 3-col)', ratio: '4:3' },
  ],
  RSVPConfirmation: [
    { position: 0, label: 'Imagen "Declinado"', ratio: '3:2' },
    { position: 1, label: 'Imagen "Confirmado"', ratio: '3:2' },
  ],
  HERO: [{ position: 0, label: 'Imagen de portada', ratio: '16:9' }],
  GALLERY: [
    { position: 0, label: 'Foto 1', ratio: '4:3' },
    { position: 1, label: 'Foto 2', ratio: '4:3' },
    { position: 2, label: 'Foto 3', ratio: '4:3' },
    { position: 3, label: 'Foto 4', ratio: '4:3' },
    { position: 4, label: 'Foto 5', ratio: '4:3' },
    { position: 5, label: 'Foto 6', ratio: '4:3' },
  ],
}

export function sectionImageSlotsForType(
  componentType: string
): Array<{ position: number; label: string; ratio: string }> {
  const type = canonicalSectionType(componentType)
  switch (type) {
    case 'Hosts':
      return SECTION_IMAGES.GraduatesList
    default:
      return SECTION_IMAGES[type] ?? []
  }
}

export function readCreatedSectionResourcePayload(payload: unknown): Resource | null | undefined {
  return readApiData<Resource | null | undefined>(payload)
}

export function readReplacedSectionResourcePayload(payload: unknown): ResourceFileMutationResponse | null | undefined {
  return readApiData<ResourceFileMutationResponse | null | undefined>(payload)
}

// ─── Image Slot ───────────────────────────────────────────────────────────────

interface ImageSlotProps {
  slot: { position: number; label: string; ratio: string }
  resource?: Resource
  sectionId: string
  resourceTypeId: string
  onCreated: (resource: Resource | null | undefined) => void
  onReplaced: (resourceId: string, file: ResourceFileMutationResponse | null | undefined) => void
  onDelete: (resource: Resource) => Promise<void>
}

function ImageSlot({ slot, resource, sectionId, resourceTypeId, onCreated, onReplaced, onDelete }: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const upload = useUploadTask('No pudimos subir la imagen')
  const creationUnavailable = !resource && !resourceTypeId

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (upload.isUploading) return
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = sectionImageUploadValidationError(file)
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }

    if (creationUnavailable) {
      toast.error('El tipo de recurso todavía no está disponible. Reintenta la carga del catálogo.')
      e.target.value = ''
      return
    }

    await upload.start(async (requestConfig) => {
      const localUrl = URL.createObjectURL(file)
      setPreview(localUrl)
      try {
        const prepared = await prepareImageForUpload(file, {
          maxWidth: 2400,
          maxHeight: 2400,
          quality: 0.9,
          signal: requestConfig.signal as AbortSignal,
        })
        const form = new FormData()
        form.append('file', prepared.file)
        form.append('position', String(slot.position))
        form.append('title', slot.label)
        form.append('alt_text', slot.label)

        let confirmed = false
        if (resource) {
          const response = await api.put<ResourceFileMutationResponse>(
            resourceReplacePath(resource.id),
            form,
            requestConfig
          )
          if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
          const replaced = readReplacedSectionResourcePayload(response.data)
          confirmed = hasResourceFileMutationData(replaced)
          onReplaced(resource.id, replaced)
        } else {
          form.append('section_id', sectionId)
          form.append('resource_type_id', resourceTypeId)

          const response = await api.post<Resource>(resourcesPath(), form, requestConfig)
          if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
          const created = readCreatedSectionResourcePayload(response.data)
          confirmed = Boolean(created?.id)
          onCreated(created)
        }
        if (confirmed) {
          toast.success(
            prepared.optimized
              ? resource
                ? 'Imagen optimizada y reemplazada'
                : 'Imagen optimizada y subida'
              : resource
                ? 'Imagen reemplazada'
                : 'Imagen subida'
          )
        } else {
          toast.info('Archivo recibido; verificando almacenamiento…')
        }
        return prepared
      } finally {
        URL.revokeObjectURL(localUrl)
        setPreview(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    })
  }

  const handleDelete = async () => {
    if (!resource) return
    setDeleting(true)
    try {
      await onDelete(resource)
    } finally {
      setDeleting(false)
    }
  }

  const imgSrc = preview ?? readResourceMediaUrl(resource)
  const isFilled = Boolean(imgSrc)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={[
              'flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
              isFilled ? 'bg-lime-500/20 text-lime-400' : 'bg-surface-raised text-ink-muted',
            ].join(' ')}
          >
            {slot.position + 1}
          </span>
          <p className="text-xs font-medium text-ink-secondary">{slot.label}</p>
          <span className="text-[10px] text-ink-muted">{slot.ratio}</span>
        </div>
        {isFilled ? (
          <CheckCircleIcon className="size-4 shrink-0 text-lime-400" />
        ) : (
          <ExclamationCircleIcon className="size-4 shrink-0 text-ink-muted" />
        )}
      </div>

      {/* Image preview / upload area */}
      <div className="group relative">
        {imgSrc ? (
          <div className="relative overflow-hidden rounded-lg border border-white/10">
            <img src={imgSrc} alt={slot.label} className="h-32 w-full object-cover" />
            {/* Overlay actions */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isUploading || deleting}
                className="flex min-h-11 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                <ArrowUpTrayIcon className="size-3.5" />
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={upload.isUploading || deleting}
                className="flex min-h-11 items-center gap-1 rounded-lg bg-pink-500/20 px-2.5 py-1.5 text-xs font-medium text-pink-400 transition-colors hover:bg-pink-500/30"
              >
                <TrashIcon className="size-3.5" />
                {deleting ? '…' : 'Eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isUploading || creationUnavailable}
            className={[
              'flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-all',
              upload.isUploading || creationUnavailable
                ? 'cursor-not-allowed border-indigo-500/30 bg-indigo-500/5'
                : 'cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/5',
            ].join(' ')}
          >
            {upload.isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="size-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                <span className="text-xs text-ink-muted">Subiendo…</span>
              </div>
            ) : (
              <>
                <ArrowUpTrayIcon className="size-5 text-ink-muted" />
                <span className="text-xs text-ink-muted">Subir imagen</span>
                <span className="text-[10px] text-ink-muted">{SECTION_IMAGE_UPLOAD_LIMIT_HELP_TEXT}</span>
              </>
            )}
          </button>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={SECTION_IMAGE_UPLOAD_ACCEPT}
          onChange={handleFileChange}
          disabled={upload.isUploading || deleting || creationUnavailable}
          className="hidden"
        />
      </div>
      <UploadStatus
        compact
        status={upload.status}
        progress={upload.progress}
        error={upload.error}
        onCancel={upload.cancel}
        onRetry={() => void upload.retry()}
        label={`Subiendo ${slot.label.toLowerCase()}`}
        preparingLabel="Optimizando imagen…"
      />
    </div>
  )
}

// ─── Section Resources Manager ────────────────────────────────────────────────

interface Props {
  section: EventSection
  onClose: () => void
  onResourcesChanged?: () => void
}

export function EventSectionResources({ section, onClose, onResourcesChanged }: Props) {
  const componentType = section.component_type || section.type || ''
  const slots = sectionImageSlotsForType(componentType)
  const lastResourceRefreshKeyRef = useRef<string | null>(null)

  const {
    data: resources = [],
    error: resourcesError,
    isLoading: resourcesLoading,
    isValidating: resourcesValidating,
    mutate,
  } = useSWR<Resource[]>(section.id ? sectionResourcesPath(section.id) : null, fetcher, { revalidateOnFocus: false })
  const resourceRefreshDelay = useMemo(() => getSectionResourcesRefreshDelay(resources), [resources])
  const resourceRefreshKey = useMemo(() => sectionResourcesMediaRefreshKey(resources), [resources])
  useEffect(() => {
    if (resourceRefreshDelay === null || !resourceRefreshKey) return
    const refreshResources = () => {
      lastResourceRefreshKeyRef.current = resourceRefreshKey
      void mutate()
    }

    if (resourceRefreshDelay <= 0) {
      if (lastResourceRefreshKeyRef.current === resourceRefreshKey) return
      refreshResources()
      return
    }
    const timer = window.setTimeout(refreshResources, resourceRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [mutate, resourceRefreshDelay, resourceRefreshKey])

  // Fetch image resource type ID from catalogs
  const {
    data: resourceTypes = [],
    error: resourceTypesError,
    isLoading: resourceTypesLoading,
    isValidating: resourceTypesValidating,
    mutate: retryResourceTypes,
  } = useSWR<Array<{ id: string; code: string }>>(resourceTypesPath(), fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  })
  const imageTypeId = resourceTypes.find((rt) => rt.code?.toLowerCase() === 'image')?.id ?? ''

  const revalidate = () => {
    mutate()
  }

  const updateResources = (updater: (current: Resource[] | undefined) => unknown) => {
    mutate((current) => updater(current) as Resource[], { revalidate: false })
  }

  const handleCreated = (resource: Resource | null | undefined) => {
    if (!resource?.id) {
      revalidate()
      onResourcesChanged?.()
      return
    }
    updateResources((current) => upsertResourceCacheValue(current, resource))
    onResourcesChanged?.()
  }

  const handleReplaced = (resourceId: string, file: ResourceFileMutationResponse | null | undefined) => {
    if (!hasResourceFileMutationData(file)) {
      revalidate()
      onResourcesChanged?.()
      return
    }
    updateResources((current) => patchResourceFileCacheValue(current, resourceId, file))
    onResourcesChanged?.()
  }

  const handleDelete = async (resource: Resource) => {
    const snapshot = resources
    updateResources((current) => removeResourceCacheValue(current, resource.id))
    try {
      await api.delete(resourcePath(resource.id))
      onResourcesChanged?.()
      toast.success('Imagen eliminada')
    } catch (err: unknown) {
      await mutate(snapshot, { revalidate: false })
      toast.error(getUploadErrorMessage(err, 'No pudimos eliminar la imagen'))
    }
  }

  if (resourcesLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-ink-secondary">
          <ArrowPathIcon className="size-4 animate-spin" />
          Cargando imágenes de la sección…
        </div>
      </div>
    )
  }

  if (resourcesError) {
    return (
      <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-5" role="alert">
        <p className="text-sm font-semibold text-red-100">No pudimos cargar las imágenes de esta sección.</p>
        <p className="mt-1 text-xs text-red-200/70">No se habilitarán nuevas cargas para evitar recursos duplicados.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resourcesValidating}
            onClick={() => void mutate()}
            className="min-h-11 rounded-lg border border-red-300/20 px-3 text-xs font-semibold text-red-100 hover:bg-red-300/10 disabled:opacity-50"
          >
            {resourcesValidating ? 'Reintentando…' : 'Reintentar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-3 text-xs font-semibold text-ink-secondary hover:text-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  if (!slots || slots.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-surface p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Recursos — {section.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">Este tipo de sección no requiere imágenes predefinidas.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 text-xs text-ink-muted transition-colors hover:text-ink-secondary"
          >
            Cerrar
          </button>
        </div>
        <div className="py-6 text-center">
          <PhotoIcon className="mx-auto mb-2 size-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            Las imágenes para esta sección se gestionan directamente desde el backend.
          </p>
        </div>
      </motion.div>
    )
  }

  const filledSlots = slots.filter((slot) => resources.some((r) => r.position === slot.position)).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-white/10 bg-surface p-5 shadow-xl"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Imágenes — {section.name}</p>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                filledSlots === slots.length
                  ? 'border border-lime-500/20 bg-lime-500/10 text-lime-400'
                  : 'border border-amber-500/20 bg-amber-500/10 text-amber-400',
              ].join(' ')}
            >
              {filledSlots}/{slots.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">Sube las imágenes requeridas para esta sección SDUI.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 text-xs text-ink-muted transition-colors hover:text-ink-secondary"
        >
          Cerrar
        </button>
      </div>

      {/* Image slots grid */}
      {(resourceTypesError || (!resourceTypesLoading && !imageTypeId)) && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-xs leading-5 text-amber-100">
            No pudimos cargar el tipo de recurso. Puedes reemplazar imágenes existentes, pero las nuevas cargas están
            pausadas.
          </p>
          <button
            type="button"
            disabled={resourceTypesValidating}
            onClick={() => void retryResourceTypes()}
            className="min-h-10 shrink-0 rounded-lg border border-amber-300/20 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50"
          >
            {resourceTypesValidating ? 'Reintentando…' : 'Reintentar catálogo'}
          </button>
        </div>
      )}
      <div
        className={[
          'grid gap-4',
          slots.length >= 4
            ? 'grid-cols-2 sm:grid-cols-3'
            : slots.length >= 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-1',
        ].join(' ')}
      >
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
                  onCreated={handleCreated}
                  onReplaced={handleReplaced}
                  onDelete={handleDelete}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Progress footer */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
          <span>Imágenes completas</span>
          <span className={filledSlots === slots.length ? 'text-lime-400' : 'text-amber-400'}>
            {filledSlots} / {slots.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round((filledSlots / slots.length) * 100)}%` }}
            transition={{ duration: 0.5 }}
            className={['h-full rounded-full', filledSlots === slots.length ? 'bg-lime-500' : 'bg-amber-500'].join(' ')}
          />
        </div>
        {filledSlots < slots.length && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Faltan {slots.length - filledSlots} imagen{slots.length - filledSlots !== 1 ? 'es' : ''} para completar esta
            sección.
          </p>
        )}
      </div>
    </motion.div>
  )
}
