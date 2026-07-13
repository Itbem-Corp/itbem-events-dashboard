'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import useSWR from 'swr'
import * as z from 'zod'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'

import { ACCEPT_PRESETS, FileUpload } from '@/components/ui/file-upload'
import { UploadStatus } from '@/components/ui/upload-status'
import { useUploadTask } from '@/hooks/use-upload-task'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { clientPath, clientsPath, clientTypesPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { prepareImageForUpload } from '@/lib/image-upload-optimization'
import { SECTION_IMAGE_UPLOAD_HELP_TEXT } from '@/lib/resource-upload-policy'
import type { Client } from '@/models/Client'
import type { ClientType } from '@/models/ClientType'
import { ArrowPathIcon } from '@heroicons/react/16/solid'
import { toast } from 'sonner'

const clientSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  client_type_id: z.string().uuid('Selecciona un tipo de organización válido'),
  logo: z.any().optional(),
})

type ClientFormValues = z.infer<typeof clientSchema>

interface ClientFormModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  client?: Client | null
  parentId?: string // pre-fill parent when creating sub-client
  restrictTypeCode?: string // hide other types (e.g. 'AGENCY' or 'CUSTOMER')
  onSaved?: (client: Client | null) => Promise<void> | void
}

export function ClientFormModal({
  isOpen,
  setIsOpen,
  client,
  parentId,
  restrictTypeCode,
  onSaved,
}: ClientFormModalProps) {
  const {
    data: clientTypes = [],
    error: clientTypesError,
    isLoading: clientTypesLoading,
    isValidating: clientTypesValidating,
    mutate: retryClientTypes,
  } = useSWR<ClientType[]>(clientTypesPath(), fetcher)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLogoRemoved, setIsLogoRemoved] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const upload = useUploadTask('No pudimos guardar la organización')
  const resetUpload = upload.reset
  const isSubmitting = upload.isUploading || isFinalizing
  const clientTypesBusy = clientTypesLoading || clientTypesValidating
  const creatingWithoutClientTypes = !client && (clientTypesBusy || Boolean(clientTypesError))

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      client_type_id: '',
    },
  })

  useEffect(() => {
    if (isOpen) {
      resetUpload()
      if (client) {
        reset({
          name: client.name || '',
          client_type_id: client.client_type_id || '',
        })
        // Resetear el estado del archivo al editar para detectar cambios reales
        setSelectedFile(null)
        setIsLogoRemoved(false)
      } else {
        reset({ name: '', client_type_id: '' })
        setSelectedFile(null)
        setIsLogoRemoved(false)
      }
    }
  }, [client, isOpen, reset, resetUpload])

  const onSubmit: SubmitHandler<ClientFormValues> = async (data) => {
    const result = await upload.start(async (requestConfig) => {
      const formData = new FormData()
      formData.append('name', data.name)
      formData.append('client_type_id', data.client_type_id)
      if (parentId) formData.append('parent_id', parentId)

      if (selectedFile instanceof File) {
        const prepared = await prepareImageForUpload(selectedFile, {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.92,
          signal: requestConfig.signal as AbortSignal,
        })
        formData.append('logo', prepared.file)
      } else if (isLogoRemoved) {
        formData.append('remove_logo', 'true')
      }

      const response = client?.id
        ? await api.put(clientPath(client.id), formData, requestConfig)
        : await api.post(clientsPath(), formData, requestConfig)
      if (requestConfig.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
      return readApiData<Client | null>(response.data)
    })

    if (!result.ok) return

    setIsFinalizing(true)
    let refreshed = true
    try {
      await onSaved?.(result.value)
    } catch {
      // The server already saved the organization. Do not turn a cache refresh failure into a duplicate create retry.
      refreshed = false
      toast.warning('Organización guardada; actualiza la lista para ver los cambios.')
    }
    setIsFinalizing(false)
    setIsOpen(false)
    reset()
    setSelectedFile(null)
    setIsLogoRemoved(false)
    if (refreshed) {
      toast.success(client?.id ? 'Organización actualizada' : 'Organización creada')
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => !isSubmitting && setIsOpen(false)}>
      <DialogTitle>{client ? 'Configuración de organización' : 'Nueva organización'}</DialogTitle>

      <form ref={formRef} onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-8 py-4">
          <div className="grid grid-cols-1 gap-y-6">
            <Field>
              <Label>Nombre Legal o Comercial</Label>
              <Description>Este nombre aparecerá en los reportes y eventos.</Description>
              <Input
                {...register('name')}
                placeholder="Ej. EventiApp Corp"
                className="mt-2 font-medium"
                disabled={isSubmitting}
              />
              {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
            </Field>

            <Field aria-busy={clientTypesBusy}>
              <Label>Tipo de Organización</Label>
              <Description>Define la jerarquía y permisos de esta cuenta.</Description>
              <Select
                {...register('client_type_id')}
                disabled={isSubmitting || clientTypesBusy || Boolean(clientTypesError)}
              >
                <option value="">
                  {clientTypesBusy
                    ? 'Cargando tipos de organización…'
                    : clientTypesError
                      ? 'No se pudieron cargar los tipos'
                      : 'Selecciona una categoría...'}
                </option>
                {clientTypes
                  .filter((t) => !restrictTypeCode || t.code === restrictTypeCode)
                  .map((type: ClientType) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
              </Select>
              {errors.client_type_id && <ErrorMessage>{errors.client_type_id.message}</ErrorMessage>}
              {clientTypesError && (
                <div
                  role="alert"
                  className="mt-3 flex flex-col gap-3 rounded-xl border border-red-400/15 bg-red-400/[0.055] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-red-200">
                    No pudimos cargar los tipos de organización. Reintenta para continuar.
                  </p>
                  <Button
                    type="button"
                    outline
                    disabled={clientTypesValidating}
                    onClick={() => void retryClientTypes()}
                  >
                    <ArrowPathIcon
                      data-slot="icon"
                      aria-hidden="true"
                      className={clientTypesValidating ? 'animate-spin' : undefined}
                    />
                    {clientTypesValidating ? 'Reintentando…' : 'Reintentar'}
                  </Button>
                </div>
              )}
            </Field>
          </div>

          <div className="border-t border-white/6 pt-6">
            <div className="mb-4">
              <p className="text-sm font-semibold text-zinc-100">Identidad visual</p>
              <p className="mt-1 text-sm text-zinc-500">
                Opcional. Agrega un logo cuadrado para reconocer la organización.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div
                className={`relative flex min-h-[200px] w-full items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
                  selectedFile || (!isLogoRemoved && client?.logo)
                    ? 'border-transparent bg-white shadow-xl'
                    : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-800'
                } `}
              >
                <FileUpload
                  value={isLogoRemoved ? null : selectedFile || client?.logo}
                  onChange={(file) => {
                    setSelectedFile(file)
                    setIsLogoRemoved(file === null && Boolean(client?.logo))
                  }}
                  previewType="avatar"
                  accept={ACCEPT_PRESETS.IMAGES}
                  maxSize={1024 * 1024 * 5}
                  description={`${SECTION_IMAGE_UPLOAD_HELP_TEXT} · Hasta 5 MB`}
                  className="w-full"
                  disabled={isSubmitting}
                />
              </div>

              {(selectedFile || (!isLogoRemoved && client?.logo)) && (
                <p className="mt-4 text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase">
                  Haz clic o toca la imagen para reemplazarla
                </p>
              )}
            </div>
            <div className="mt-4">
              <UploadStatus
                status={upload.status}
                progress={upload.progress}
                error={upload.error}
                onCancel={upload.cancel}
                onRetry={() => formRef.current?.requestSubmit()}
                label={selectedFile ? 'Subiendo logo y guardando' : 'Guardando organización'}
                preparingLabel={selectedFile ? 'Optimizando logo…' : 'Preparando cambios…'}
              />
            </div>
          </div>
        </DialogBody>

        <DialogActions className="border-t border-white/5 pt-6">
          <Button type="button" plain onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || creatingWithoutClientTypes}
            className="min-w-[140px] shadow-lg shadow-blue-500/10"
            data-testid="submit-client-form"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <ArrowPathIcon data-slot="icon" aria-hidden="true" className="animate-spin" />
                <span>Guardando...</span>
              </span>
            ) : (
              <span>{client ? 'Actualizar' : 'Crear Organización'}</span>
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
