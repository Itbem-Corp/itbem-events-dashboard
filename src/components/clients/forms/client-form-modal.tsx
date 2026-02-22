'use client'

import { useEffect, useState } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { mutate } from 'swr'
import useSWR from 'swr'

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage, Description } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Button } from '@/components/button'

import { api } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'
import { FileUpload, ACCEPT_PRESETS } from '@/components/ui/file-upload'
import { toast } from 'sonner'
import type { Client } from '@/models/Client'
import type { ClientType } from '@/models/ClientType'

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
    parentId?: string          // pre-fill parent when creating sub-client
    restrictTypeCode?: string  // hide other types (e.g. 'AGENCY' or 'CUSTOMER')
}

export function ClientFormModal({ isOpen, setIsOpen, client, parentId, restrictTypeCode }: ClientFormModalProps) {
    const { data: clientTypes = [] } = useSWR<ClientType[]>('/catalogs/client-types', fetcher)

    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ClientFormValues>({
        resolver: zodResolver(clientSchema),
        defaultValues: {
            name: '',
            client_type_id: '',
        }
    })

    useEffect(() => {
        if (isOpen) {
            if (client) {
                reset({
                    name: client.name || '',
                    client_type_id: client.client_type_id || '',
                });
                // Resetear el estado del archivo al editar para detectar cambios reales
                setSelectedFile(null);
            } else {
                reset({ name: '', client_type_id: '' });
                setSelectedFile(null);
            }
        }
    }, [client, reset, isOpen]);

    const onSubmit: SubmitHandler<ClientFormValues> = async (data) => {
        setIsSubmitting(true)

        const formData = new FormData()
        formData.append('name', data.name)
        formData.append('client_type_id', data.client_type_id)
        if (parentId) formData.append('parent_id', parentId)

        // LÓGICA DE ARCHIVOS:
        if (selectedFile instanceof File) {
            // Caso 1: Se subió un archivo nuevo
            formData.append('logo', selectedFile)
        } else if (!selectedFile && client?.logo) {
            /** * Caso 2: El usuario eliminó el logo existente (presionó la X).
             * Enviamos esta bandera para que Go llame a DeleteObjectByPath.
             */
            formData.append('remove_logo', 'true')
        }

        try {
            if (client?.id) {
                await api.put(`/clients/${client.id}`, formData)
            } else {
                await api.post('/clients', formData)
            }

            await mutate('/clients')
            setIsOpen(false)
            reset()
            setSelectedFile(null)
            toast.success(client?.id ? 'Organización actualizada' : 'Organización creada')
        } catch {
            toast.error('Error al guardar la organización')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
            <DialogTitle>{client ? 'Configuración de Organización' : 'Nueva Organización'}</DialogTitle>

            <form onSubmit={handleSubmit(onSubmit)}>
                <DialogBody className="space-y-8 py-4">

                    {/* Área de Logo con Previsualización Real */}
                    <div className="flex flex-col items-center justify-center">
                        <div className={`
                                relative w-full min-h-[240px] flex items-center justify-center rounded-2xl border-2 border-dashed 
                                transition-all duration-300
                                ${(selectedFile || client?.logo)
                                                ? 'border-transparent bg-white shadow-xl' // El blanco que quieres
                                                : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-800'
                                            }
                            `}>
                            <FileUpload
                                value={selectedFile || client?.logo}
                                onChange={(file) => setSelectedFile(file)}
                                previewType="avatar" // Ahora sí usamos avatar porque limpiamos su CSS interno
                                accept={ACCEPT_PRESETS.IMAGES}
                                maxSize={1024 * 1024 * 5}
                                description="PNG, JPG o WebP"
                                className="w-full"
                            />
                        </div>

                        {/* Instrucción clara abajo */}
                        {(selectedFile || client?.logo) && (
                            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">
                                Toca la imagen para reemplazar
                            </p>
                        )}
                    </div>

                    <hr className="border-white/5" />

                    <div className="grid grid-cols-1 gap-y-6">
                        <Field>
                            <Label>Nombre Legal o Comercial</Label>
                            <Description>Este nombre aparecerá en los reportes y eventos.</Description>
                            <Input
                                {...register('name')}
                                placeholder="Ej. EventiApp Corp"
                                className="mt-2 font-medium"
                            />
                            {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
                        </Field>

                        <Field>
                            <Label>Tipo de Organización</Label>
                            <Description>Define la jerarquía y permisos de esta cuenta.</Description>
                            <Select {...register('client_type_id')}>
                                <option value="">Selecciona una categoría...</option>
                                {clientTypes
                                    .filter((t) => !restrictTypeCode || t.code === restrictTypeCode)
                                    .map((type: ClientType) => (
                                        <option key={type.id} value={type.id}>
                                            {type.name}
                                        </option>
                                    ))}
                            </Select>
                            {errors.client_type_id && <ErrorMessage>{errors.client_type_id.message}</ErrorMessage>}
                        </Field>
                    </div>
                </DialogBody>

                <DialogActions className="bg-zinc-900/40 p-6 border-t border-white/5">
                    <Button plain onClick={() => setIsOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-w-[140px] shadow-lg shadow-blue-500/10"
                        data-testid="submit-client-form"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <div className="size-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                                <span>Guardando...</span>
                            </div>
                        ) : (
                            <span>{client ? 'Actualizar' : 'Crear Organización'}</span>
                        )}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    )
}