// src/components/ui/file-upload.tsx
import { SECTION_IMAGE_DROPZONE_ACCEPT } from '@/lib/resource-upload-policy'
import { CloudArrowUpIcon, DocumentTextIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { Accept, useDropzone } from 'react-dropzone'

/**
 * Presets de formatos optimizados para Web, iOS (HEIC/MOV) y Android.
 */
export const ACCEPT_PRESETS = {
  IMAGES: SECTION_IMAGE_DROPZONE_ACCEPT,
  VIDEOS: {
    'video/*': ['.mp4', '.mov', '.webm', '.quicktime', '.3gp', '.m4v'],
  },
}

interface FileUploadProps {
  value?: string | File | null
  onChange: (file: File | null) => void
  accept?: Accept
  maxSize?: number
  label?: string
  description?: string
  className?: string
  previewType?: 'avatar' | 'user-avatar' | 'video' | 'file' | 'image'
  disabled?: boolean
}

function formatMaxSize(maxSize: number): string {
  const mb = maxSize / (1024 * 1024)
  if (mb >= 1) {
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(maxSize / 1024))} KB`
}

export function FileUpload({
  value,
  onChange,
  accept = { ...ACCEPT_PRESETS.IMAGES, ...ACCEPT_PRESETS.VIDEOS },
  maxSize = 1024 * 1024 * 25,
  label,
  description,
  className = '',
  previewType = 'file',
  disabled = false,
}: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const maxSizeLabel = formatMaxSize(maxSize)
  const acceptedTypes = Object.keys(accept)
  const acceptsImages = acceptedTypes.some((type) => type.startsWith('image/'))
  const acceptsVideos = acceptedTypes.some((type) => type.startsWith('video/'))
  const uploadKind =
    acceptsImages && acceptsVideos ? 'foto o video' : acceptsImages ? 'imagen' : acceptsVideos ? 'video' : 'archivo'

  // Sincronizar el valor inicial (URL string o File object)
  useEffect(() => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      setPreview(null)
      setFileName(null)
      return
    }

    if (typeof value === 'string') {
      setPreview(value)
      const parts = value.split('/')
      setFileName(parts[parts.length - 1])
    } else if (value instanceof File) {
      const url = URL.createObjectURL(value)
      setPreview(url)
      setFileName(value.name)
    }
  }, [value])

  // Limpieza de memoria para Lighthouse Performance
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        const objectUrl = URL.createObjectURL(file)
        setPreview(objectUrl)
        setFileName(file.name)
        onChange(file)
      }
    },
    [onChange]
  )

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    preventDropOnDocument: true, // Mejora UX en móviles
    disabled,
    validator: (file) =>
      file.size <= 0
        ? {
            code: 'file-empty',
            message: 'El archivo está vacío',
          }
        : null,
  })

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview(null)
    setFileName(null)
    onChange(null)
  }

  // Determinar si es un formato HEIC de iPhone para mostrar placeholder si el navegador no lo soporta
  const isHeic = fileName?.toLowerCase().endsWith('.heic') || fileName?.toLowerCase().endsWith('.heif')

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-sm font-semibold text-zinc-200">{label}</label>}

      <div
        {...getRootProps()}
        aria-disabled={disabled}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all duration-200 ${previewType === 'user-avatar' ? 'min-h-[340px]' : 'min-h-[160px]'} ${
          disabled
            ? 'cursor-not-allowed border-white/5 bg-zinc-900/25 opacity-70'
            : isDragActive
              ? 'scale-[1.01] border-blue-500 bg-blue-500/10'
              : 'border-white/10 bg-zinc-900/40 hover:border-white/20'
        }`}
      >
        <input {...getInputProps()} />

        {preview ? (
          <div className="group relative flex w-full flex-col items-center">
            {/* 1. VISTA PREVIA: AVATAR / LOGO */}
            {previewType === 'avatar' && (
              <div className="group/preview relative flex w-full flex-col items-center justify-center">
                {/* Eliminamos el bg-zinc-800/50 y el size-40 fijo para que sea fluido */}
                <div className="relative flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-2xl">
                  {isHeic ? (
                    <div className="flex h-full flex-col items-center justify-center">
                      <PhotoIcon className="size-10 text-zinc-500" />
                      <span className="mt-1 text-[10px] font-bold text-zinc-500 uppercase">HEIC (iOS)</span>
                    </div>
                  ) : (
                    <img
                      src={preview}
                      alt="Preview"
                      // Usamos object-contain y h-full para que el logo se vea grande
                      className="max-h-[200px] w-auto object-contain p-2 transition-transform duration-300 group-hover/preview:scale-105"
                    />
                  )}
                </div>
              </div>
            )}
            {/* USER AVATAR (perfil de usuario) */}
            {previewType === 'user-avatar' && (
              <div className="relative w-full">
                <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-xl">
                  {isHeic ? (
                    <div className="flex h-full w-full flex-col items-center justify-center">
                      <PhotoIcon className="size-12 text-zinc-500" />
                      <span className="mt-2 text-xs font-semibold text-zinc-500">HEIC (iOS)</span>
                    </div>
                  ) : (
                    <img
                      src={preview}
                      alt="Foto de perfil"
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  )}

                  {/* Overlay UX */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/40">
                    <span className="text-sm font-semibold text-white opacity-0 hover:opacity-100">
                      Click para cambiar
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* 2. VISTA PREVIA: IMAGEN GENERAL */}
            {previewType === 'image' && (
              <div className="max-w-full">
                {isHeic ? (
                  <div className="flex h-40 w-64 items-center justify-center rounded-xl border border-white/10 bg-zinc-800">
                    <PhotoIcon className="size-12 text-zinc-600" />
                  </div>
                ) : (
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-h-48 rounded-xl border border-white/10 object-contain shadow-lg"
                  />
                )}
              </div>
            )}

            {/* 3. VISTA PREVIA: VIDEO (Mobile Ready) */}
            {previewType === 'video' && (
              <div className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 shadow-lg">
                <video src={preview} className="h-auto w-full" controls playsInline />
              </div>
            )}

            {/* 4. VISTA PREVIA: DOCUMENTO / ARCHIVO */}
            {previewType === 'file' && (
              <div className="flex w-full max-w-xs items-center gap-4 rounded-2xl border border-white/10 bg-zinc-800 p-4">
                <DocumentTextIcon className="size-10 shrink-0 text-blue-400" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {fileName || 'Archivo seleccionado'}
                  </span>
                  <span className="text-[10px] font-bold tracking-tighter text-zinc-500 uppercase">
                    Click para cambiar
                  </span>
                </div>
              </div>
            )}

            {/* Botón eliminar (Touch target optimizado para móvil) */}
            <button
              type="button"
              onClick={removeFile}
              className="absolute -top-4 -right-2 z-20 rounded-full bg-red-600 p-2 text-white shadow-xl transition-all hover:bg-red-500 active:scale-90"
              aria-label="Eliminar archivo"
              disabled={disabled}
            >
              <XMarkIcon className="size-5 stroke-[3]" />
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/5 bg-zinc-800 shadow-inner">
              <CloudArrowUpIcon
                className={`size-8 transition-colors ${isDragActive ? 'text-blue-400' : 'text-zinc-500'}`}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-200">
                {isDragActive ? 'Suelta el archivo' : `Cargar ${uploadKind}`}
              </p>
              <p className="mx-auto max-w-[260px] text-xs text-zinc-500">
                {description || `JPG, PNG, WebP, HEIC, MP4, MOV · Hasta ${maxSizeLabel}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Manejo de Errores UX */}
      {fileRejections.length > 0 && (
        <div
          role="alert"
          className="animate-in rounded-xl border border-red-500/20 bg-red-500/10 p-3 fade-in slide-in-from-top-1"
        >
          {fileRejections.map(({ errors }, idx) => (
            <p key={idx} className="text-xs font-medium text-red-400">
              {errors[0].code === 'file-too-large'
                ? `El archivo supera el límite de ${maxSizeLabel}`
                : errors[0].code === 'file-empty'
                  ? 'El archivo está vacío o no se pudo leer'
                  : 'Este formato de archivo no está permitido'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
