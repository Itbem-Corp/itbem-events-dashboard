'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useStore } from '@/store/useStore'
import { toast } from 'sonner'

// UI
import { Heading } from '@/components/heading'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Field, Label } from '@/components/fieldset'
import { FileUpload } from '@/components/ui/file-upload'

export default function ProfilePage() {
    const user = useStore((s) => s.user)
    const setProfile = useStore((s) => s.setProfile)

    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [loading, setLoading] = useState(false)

    // 🔄 Sync local form with store
    useEffect(() => {
        if (!user) return
        setFirstName(user.first_name || '')
        setLastName(user.last_name || '')
    }, [user])

    if (!user) return null

    /** 🔄 Revalida perfil desde API y actualiza el store */
    async function revalidateProfile() {
        const res = await api.get('/users')
        setProfile(res.data.data ?? res.data)
    }

    async function handleSave() {
        setLoading(true)
        try {
            await api.put('/users', {
                first_name: firstName,
                last_name: lastName,
            })
            await revalidateProfile()
            toast.success('Perfil guardado correctamente')
        } catch {
            toast.error('Error al guardar el perfil')
        } finally {
            setLoading(false)
        }
    }

    async function handleAvatarChange(file: File | null) {
        try {
            if (!file) {
                await api.delete('/users/avatar')
            } else {
                const fd = new FormData()
                fd.append('avatar', file)
                await api.post('/users/avatar', fd)
            }
            await revalidateProfile()
            toast.success('Foto de perfil actualizada')
        } catch {
            toast.error('Error al actualizar la foto de perfil')
        }
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-8">
            <Heading>Mi Perfil</Heading>
            <p className="mt-1 text-sm text-zinc-400">
                Administra tu información personal y cómo te ven otros usuarios.
            </p>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* AVATAR */}
                <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-white">Foto de perfil</h3>

                    <FileUpload
                        value={user.profile_image}
                        previewType="user-avatar"
                        onChange={handleAvatarChange}
                    />
                </section>

                {/* FORM */}
                <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Field>
                            <Label>Nombre</Label>
                            <Input
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <Label>Apellidos</Label>
                            <Input
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                        </Field>
                        <Field className="md:col-span-2">
                            <Label>Correo electrónico</Label>
                            <Input
                                value={user.email}
                                disabled
                            />
                        </Field>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <Button onClick={handleSave} disabled={loading}>
                            {loading ? 'Guardando…' : 'Guardar cambios'}
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    )
}
