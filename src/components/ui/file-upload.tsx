// src/components/ui/file-upload.tsx
import { useCallback, useState, useEffect } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import {
    CloudArrowUpIcon,
    DocumentTextIcon,
    FilmIcon,
    PhotoIcon,
    XMarkIcon
} from '@heroicons/react/24/outline'
import { Avatar } from '@/components/avatar'

/**
 * Presets de formatos optimizados para Web, iOS (HEIC/MOV) y Android.
 */
export const ACCEPT_PRESETS = {
    IMAGES: {
        'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif']
    },
    VIDEOS: {
        'video/*': ['.mp4', '.mov', '.webm', '.quicktime', '.3gp', '.m4v']
    },
    DOCS: {
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/vnd.ms-excel': ['.xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
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
}

export function FileUpload({
                               value,
                               onChange,
                               accept = { ...ACCEPT_PRESETS.IMAGES, ...ACCEPT_PRESETS.DOCS },
                               maxSize = 1024 * 1024 * 25,
                               label,
                               description,
                               className = "",
                               previewType = 'file'
                           }: FileUploadProps) {
    const [preview, setPreview] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)

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

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0]
        if (file) {
            const objectUrl = URL.createObjectURL(file)
            setPreview(objectUrl)
            setFileName(file.name)
            onChange(file)
        }
    }, [onChange])

    const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
        onDrop,
        accept,
        maxSize,
        multiple: false,
        preventDropOnDocument: true // Mejora UX en móviles
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
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer
                  ${previewType === 'user-avatar' ? 'min-h-[340px]' : 'min-h-[160px]'}
                  ${isDragActive
                    ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                    : 'border-white/10 hover:border-white/20 bg-zinc-900/40'
                    }`}
            >
                <input {...getInputProps()} />

                {preview ? (
                    <div className="relative group flex flex-col items-center w-full">

                        {/* 1. VISTA PREVIA: AVATAR / LOGO */}
                        {previewType === 'avatar' && (
                            <div className="relative flex flex-col items-center justify-center group/preview w-full">
                                {/* Eliminamos el bg-zinc-800/50 y el size-40 fijo para que sea fluido */}
                                <div className="relative w-full min-h-[180px] flex items-center justify-center overflow-hidden rounded-2xl">
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
                                <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-3xl bg-zinc-950 border border-white/10 shadow-xl">
                                    {isHeic ? (
                                        <div className="flex h-full w-full flex-col items-center justify-center">
                                            <PhotoIcon className="size-12 text-zinc-500" />
                                            <span className="mt-2 text-xs font-semibold text-zinc-500">
                                            HEIC (iOS)
                                          </span>
                                        </div>
                                    ) : (
                                        <img
                                            src={preview}
                                            alt="Foto de perfil"
                                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                        />
                                    )}

                                    {/* Overlay UX */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition">
                                    <span className="opacity-0 hover:opacity-100 text-sm font-semibold text-white">
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
                                    <div className="h-40 w-64 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/10">
                                        <PhotoIcon className="size-12 text-zinc-600" />
                                    </div>
                                ) : (
                                    <img src={preview} alt="Preview" className="max-h-48 rounded-xl object-contain border border-white/10 shadow-lg" />
                                )}
                            </div>
                        )}

                        {/* 3. VISTA PREVIA: VIDEO (Mobile Ready) */}
                        {previewType === 'video' && (
                            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 shadow-lg">
                                <video src={preview} className="w-full h-auto" controls playsInline />
                            </div>
                        )}

                        {/* 4. VISTA PREVIA: DOCUMENTO / ARCHIVO */}
                        {previewType === 'file' && (
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-800 border border-white/10 w-full max-w-xs">
                                <DocumentTextIcon className="size-10 text-blue-400 shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm text-zinc-100 font-medium truncate">
                                        {fileName || 'Archivo seleccionado'}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Click para cambiar</span>
                                </div>
                            </div>
                        )}

                        {/* Botón eliminar (Touch target optimizado para móvil) */}
                        <button
                            type="button"
                            onClick={removeFile}
                            className="absolute -top-4 -right-2 p-2 rounded-full bg-red-600 text-white shadow-xl hover:bg-red-500 active:scale-90 transition-all z-20"
                            aria-label="Eliminar archivo"
                        >
                            <XMarkIcon className="size-5 stroke-[3]" />
                        </button>
                    </div>
                ) : (
                    <div className="text-center space-y-4">
                        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-zinc-800 border border-white/5 shadow-inner">
                            <CloudArrowUpIcon className={`size-8 transition-colors ${isDragActive ? 'text-blue-400' : 'text-zinc-500'}`} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-zinc-200 font-semibold">
                                {isDragActive ? 'Suelta el archivo' : 'Cargar foto, video o documento'}
                            </p>
                            <p className="text-xs text-zinc-500 max-w-[260px] mx-auto">
                                {description || 'Formatos nativos de iOS, Android y Desktop hasta 25MB'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Manejo de Errores UX */}
            {fileRejections.length > 0 && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-1">
                    {fileRejections.map(({ errors }, idx) => (
                        <p key={idx} className="text-xs text-red-400 font-medium">
                            {errors[0].code === 'file-too-large'
                                ? 'El archivo supera el límite de 25MB'
                                : 'Este formato de archivo no está permitido'}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}