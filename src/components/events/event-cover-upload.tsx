'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { motion } from 'motion/react'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'

import Image from 'next/image'
import { PhotoIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/20/solid'

interface Props {
  event: Event
}

export function EventCoverUpload({ event }: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se aceptan imágenes (JPG, PNG, WebP)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen no puede superar los 10 MB')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)

      await api.post(`/events/${event.id}/cover`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      await mutate(`/events/${event.id}`)
      toast.success('Portada actualizada')
    } catch {
      toast.error('Error al subir la portada')
    } finally {
      setUploading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemoveCover = async () => {
    try {
      await api.put(`/events/${event.id}`, {
        name: event.name,
        identifier: event.identifier,
        cover_image_url: '',
      })
      await mutate(`/events/${event.id}`)
      toast.success('Portada eliminada')
    } catch {
      toast.error('Error al eliminar la portada')
    }
  }

  const hasCover = Boolean(event.cover_image_url)

  return (
    <div className="space-y-3">
      {hasCover ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative rounded-xl overflow-hidden aspect-[16/9] bg-zinc-800 group"
        >
          <Image
            src={event.cover_image_url!}
            alt="Portada del evento"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
          {/* Overlay actions */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleInputChange}
                disabled={uploading}
              />
              <span className="flex items-center gap-2 rounded-lg bg-white/10 backdrop-blur px-3 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors">
                <ArrowUpTrayIcon className="size-4" />
                Cambiar
              </span>
            </label>
            <button
              onClick={handleRemoveCover}
              className="flex items-center gap-2 rounded-lg bg-pink-500/20 backdrop-blur px-3 py-2 text-sm font-medium text-pink-400 hover:bg-pink-500/30 transition-colors"
            >
              <TrashIcon className="size-4" />
              Eliminar
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-sm text-white">Subiendo…</div>
            </div>
          )}
        </motion.div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            'flex flex-col items-center justify-center aspect-[16/9] rounded-xl border-2 border-dashed transition-all cursor-pointer',
            dragOver
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-white/10 bg-zinc-900/30 hover:border-white/20 hover:bg-zinc-900/50',
          ].join(' ')}
        >
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleInputChange}
            disabled={uploading}
          />
          {uploading ? (
            <div className="text-sm text-zinc-400">Subiendo portada…</div>
          ) : (
            <>
              <PhotoIcon className="size-10 text-zinc-600 mb-3" />
              <p className="text-sm font-medium text-zinc-400">
                {dragOver ? 'Suelta para subir' : 'Subir portada del evento'}
              </p>
              <p className="mt-1 text-xs text-zinc-600">Arrastra o haz clic · JPG, PNG, WebP · máx. 10 MB</p>
              <p className="mt-3 text-xs text-zinc-600">Recomendado: 1920 × 1080 px (16:9)</p>
            </>
          )}
        </label>
      )}
    </div>
  )
}
