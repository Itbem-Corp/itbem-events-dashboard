'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { UploadStatus } from '@/components/ui/upload-status'
import { useUploadTask } from '@/hooks/use-upload-task'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { userAvatarPath } from '@/lib/api-paths'
import { prepareImageForUpload } from '@/lib/image-upload-optimization'
import {
  SECTION_IMAGE_DROPZONE_ACCEPT,
  SECTION_IMAGE_UPLOAD_HELP_TEXT,
  SECTION_IMAGE_UPLOAD_MAX_BYTES,
} from '@/lib/resource-upload-policy'
import type { AvatarResponse } from '@/models/User'

interface ProfileAvatarModalProps {
  open: boolean
  value?: string | null
  onClose: () => void
  onAvatarChange: (url: string | null) => void
}

export function ProfileAvatarModal({ open, value, onClose, onAvatarChange }: ProfileAvatarModalProps) {
  const [pickerVersion, setPickerVersion] = useState(0)
  const upload = useUploadTask('No pudimos actualizar la foto de perfil')

  async function handleAvatarChange(file: File | null) {
    if (upload.isUploading) return

    const result = await upload.start(async (requestConfig) => {
      if (!file) {
        await api.delete(userAvatarPath(), requestConfig)
        if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
        onAvatarChange(null)
        toast.success('Foto de perfil eliminada')
        onClose()
        return null
      }

      const prepared = await prepareImageForUpload(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.92,
        signal: requestConfig.signal as AbortSignal,
      })
      const formData = new FormData()
      formData.append('avatar', prepared.file)
      const response = await api.post<AvatarResponse>(userAvatarPath(), formData, requestConfig)
      if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
      const avatar = readApiData<AvatarResponse>(response.data)
      if (!avatar?.url || typeof avatar.url !== 'string') {
        throw new Error('El servidor no confirmó la nueva foto. Reintenta la carga.')
      }

      onAvatarChange(avatar.url)
      toast.success(prepared.optimized ? 'Foto optimizada y actualizada' : 'Foto de perfil actualizada')
      onClose()
      return avatar
    })

    if (!result.ok) setPickerVersion((version) => version + 1)
  }

  return (
    <Dialog open={open} onClose={upload.isUploading ? () => undefined : onClose} size="md">
      <DialogTitle>Actualizar foto de perfil</DialogTitle>
      <DialogDescription>Elige una imagen clara y cuadrada para obtener el mejor resultado.</DialogDescription>

      <DialogBody>
        <div className="space-y-3" aria-busy={upload.isUploading}>
          <div className="relative">
            <FileUpload
              key={pickerVersion}
              value={value}
              previewType="user-avatar"
              onChange={(file) => void handleAvatarChange(file)}
              accept={SECTION_IMAGE_DROPZONE_ACCEPT}
              maxSize={SECTION_IMAGE_UPLOAD_MAX_BYTES}
              disabled={upload.isUploading}
              description={`${SECTION_IMAGE_UPLOAD_HELP_TEXT} · Hasta 10 MB`}
            />

            {upload.isUploading && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-zinc-950/60 backdrop-blur-sm">
                <div className="flex items-center gap-3 text-sm font-medium text-white">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  Preparando foto…
                </div>
              </div>
            )}
          </div>

          <UploadStatus
            status={upload.status}
            progress={upload.progress}
            error={upload.error}
            onCancel={upload.cancel}
            onRetry={() => void upload.retry()}
            label="Subiendo foto de perfil"
            preparingLabel="Optimizando foto…"
          />
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={upload.isUploading}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
