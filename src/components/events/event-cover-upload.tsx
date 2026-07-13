'use client'

import { useEffect, useState } from 'react'
import { mutate } from 'swr'

import { UploadStatus } from '@/components/ui/upload-status'
import { useUploadTask } from '@/hooks/use-upload-task'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { eventCoverDeletePath, eventCoverPath } from '@/lib/api-paths'
import { isEventCacheKey, patchEventCacheValue } from '@/lib/event-cache'
import {
  eventCoverDisplayExpiresAt,
  eventCoverDisplaySource,
  eventCoverRawSource,
  resolveEventCoverUrl,
  type EventCoverSource,
} from '@/lib/event-media'
import { prepareImageForUpload } from '@/lib/image-upload-optimization'
import {
  SECTION_IMAGE_UPLOAD_ACCEPT,
  SECTION_IMAGE_UPLOAD_HELP_TEXT,
  sectionImageUploadValidationError,
} from '@/lib/resource-upload-policy'
import { getUploadErrorMessage } from '@/lib/upload-transport'
import type { Event, EventCoverResponse } from '@/models/Event'
import { toast } from 'sonner'

import { ArrowUpTrayIcon, PhotoIcon, TrashIcon } from '@heroicons/react/20/solid'
import Image from 'next/image'

interface Props {
  event: Event
  onChanged?: () => void
}

export function EventCoverUpload({ event, onChanged }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [coverOverride, setCoverOverride] = useState<string | undefined>(undefined)
  const upload = useUploadTask('No pudimos subir la portada')

  useEffect(() => {
    setCoverOverride(undefined)
  }, [event.cover_image_url, event.cover_view_url, event.view_url])

  const handleFile = async (file: File) => {
    if (upload.isUploading) return
    const validationError = sectionImageUploadValidationError(file)
    if (validationError) {
      upload.reset()
      toast.error(validationError)
      return
    }

    await upload.start(async (requestConfig) => {
      const localUrl = URL.createObjectURL(file)
      setCoverOverride(localUrl)
      try {
        const prepared = await prepareImageForUpload(file, {
          maxWidth: 2560,
          maxHeight: 1440,
          quality: 0.92,
          signal: requestConfig.signal as AbortSignal,
        })
        const form = new FormData()
        form.append('file', prepared.file)

        // Do not set Content-Type manually: Axios adds the multipart boundary required by the server.
        const response = await api.post(eventCoverPath(event.id), form, requestConfig)
        if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
        const data = readApiData<EventCoverResponse & EventCoverSource>(response.data)
        const coverImageUrl = eventCoverRawSource(data)
        const viewUrl = eventCoverDisplaySource(data)
        const viewUrlExpiresAt = eventCoverDisplayExpiresAt(data)
        if (!coverImageUrl && !viewUrl) {
          throw new Error('El servidor no confirmó la portada. Reintenta la carga.')
        }
        await mutate(
          (key) => isEventCacheKey(key, event.id),
          (current: unknown) =>
            patchEventCacheValue(current, event.id, {
              cover_image_url: coverImageUrl,
              cover_view_url: viewUrl,
              cover_view_url_expires_at: viewUrlExpiresAt,
              view_url: viewUrl,
              view_url_expires_at: viewUrlExpiresAt,
            }),
          { revalidate: false }
        )

        setCoverOverride(
          resolveEventCoverUrl(
            { cover_image_url: coverImageUrl, cover_view_url: viewUrl },
            process.env.NEXT_PUBLIC_BACKEND_URL
          ) || undefined
        )
        onChanged?.()
        toast.success(prepared.optimized ? 'Portada optimizada y actualizada' : 'Portada actualizada')
        return data
      } catch (error) {
        setCoverOverride(undefined)
        throw error
      } finally {
        URL.revokeObjectURL(localUrl)
      }
    })
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (upload.isUploading) return
    const file = event.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const handleRemoveCover = async () => {
    const snapshot = {
      cover_image_url: event.cover_image_url,
      cover_view_url: event.cover_view_url,
      cover_view_url_expires_at: event.cover_view_url_expires_at,
      view_url: event.view_url,
      view_url_expires_at: event.view_url_expires_at,
    }
    const clearedCover = {
      cover_image_url: '',
      cover_view_url: '',
      cover_view_url_expires_at: '',
      view_url: '',
      view_url_expires_at: '',
    }
    setCoverOverride('')
    await mutate(
      (key) => isEventCacheKey(key, event.id),
      (current: unknown) => patchEventCacheValue(current, event.id, clearedCover),
      { revalidate: false }
    )
    try {
      await api.delete(eventCoverDeletePath(event.id))
      upload.reset()
      onChanged?.()
      toast.success('Portada eliminada')
    } catch (error: unknown) {
      setCoverOverride(undefined)
      await mutate(
        (key) => isEventCacheKey(key, event.id),
        (current: unknown) => patchEventCacheValue(current, event.id, snapshot),
        { revalidate: false }
      )
      toast.error(getUploadErrorMessage(error, 'No pudimos eliminar la portada'))
    }
  }

  const coverImageUrl = coverOverride ?? resolveEventCoverUrl(event, process.env.NEXT_PUBLIC_BACKEND_URL)
  const hasCover = Boolean(coverImageUrl)

  return (
    <div className="space-y-3">
      {hasCover ? (
        <div className="group relative aspect-[16/9] overflow-hidden rounded-xl bg-zinc-800">
          <Image
            src={coverImageUrl}
            alt="Portada del evento"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <label className={upload.isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}>
              <input
                type="file"
                accept={SECTION_IMAGE_UPLOAD_ACCEPT}
                className="sr-only"
                onChange={handleInputChange}
                disabled={upload.isUploading}
              />
              <span className="flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20">
                <ArrowUpTrayIcon className="size-4" />
                Cambiar
              </span>
            </label>
            <button
              type="button"
              onClick={handleRemoveCover}
              disabled={upload.isUploading}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-pink-500/20 px-3 py-2 text-sm font-medium text-pink-400 backdrop-blur transition-colors hover:bg-pink-500/30 disabled:opacity-50"
            >
              <TrashIcon className="size-4" />
              Eliminar
            </button>
          </div>
          {upload.isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-sm text-white">Preparando portada…</div>
            </div>
          )}
        </div>
      ) : (
        <label
          onDragOver={(event) => {
            event.preventDefault()
            if (!upload.isUploading) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            'flex aspect-[16/9] flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all',
            upload.isUploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            dragOver
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-white/10 bg-zinc-900/30 hover:border-white/20 hover:bg-zinc-900/50',
          ].join(' ')}
        >
          <input
            type="file"
            accept={SECTION_IMAGE_UPLOAD_ACCEPT}
            className="sr-only"
            onChange={handleInputChange}
            disabled={upload.isUploading}
          />
          {upload.isUploading ? (
            <div className="text-sm text-zinc-400">Preparando portada…</div>
          ) : (
            <>
              <PhotoIcon className="mb-3 size-10 text-zinc-500" />
              <p className="text-sm font-semibold text-zinc-200">
                {dragOver ? 'Suelta para subir' : 'Subir portada del evento'}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Arrastra o haz clic · {SECTION_IMAGE_UPLOAD_HELP_TEXT} · máx. 10 MB
              </p>
              <p className="mt-3 text-xs text-zinc-500">Recomendado: 1920 × 1080 px (16:9)</p>
            </>
          )}
        </label>
      )}

      <UploadStatus
        status={upload.status}
        progress={upload.progress}
        error={upload.error}
        onCancel={upload.cancel}
        onRetry={() => void upload.retry()}
        label="Subiendo portada"
        preparingLabel="Optimizando portada…"
      />
    </div>
  )
}
