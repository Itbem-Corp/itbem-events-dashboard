'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useStore } from '@/store/useStore'
import { toast } from 'sonner'
import { motion } from 'motion/react'

import { Heading, Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Field, Label, Description } from '@/components/fieldset'
import { FileUpload } from '@/components/ui/file-upload'
import { PageTransition } from '@/components/ui/page-transition'
import { Badge } from '@/components/badge'
import {
  UserIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
} from '@heroicons/react/20/solid'

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-800">
          <Icon className="size-4 text-zinc-400" />
        </div>
        <Subheading>{title}</Subheading>
      </div>
      {children}
    </motion.section>
  )
}

export default function ProfilePage() {
  const user = useStore((s) => s.user)
  const setProfile = useStore((s) => s.setProfile)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!user) return
    setFirstName(user.first_name || '')
    setLastName(user.last_name || '')
    setIsDirty(false)
  }, [user])

  if (!user) return null

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
      setIsDirty(false)
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

  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading>Mi perfil</Heading>
          <p className="mt-1 text-sm text-zinc-400">
            Administra tu información personal y preferencias de cuenta.
          </p>
        </div>
        {user.is_root && (
          <Badge color="indigo">
            <ShieldCheckIcon className="size-3" />
            Administrador raíz
          </Badge>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Avatar */}
        <SectionCard icon={UserIcon} title="Foto de perfil">
          <FileUpload
            value={user.profile_image}
            previewType="user-avatar"
            onChange={handleAvatarChange}
          />
          <div className="mt-4 text-center">
            <p className="text-sm font-medium text-zinc-200">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
          </div>
        </SectionCard>

        {/* Personal info form */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard icon={EnvelopeIcon} title="Información personal">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
              <Field>
                <Label>Nombre</Label>
                <Input
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setIsDirty(true)
                  }}
                  placeholder="Tu nombre"
                />
              </Field>
              <Field>
                <Label>Apellidos</Label>
                <Input
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    setIsDirty(true)
                  }}
                  placeholder="Tus apellidos"
                />
              </Field>
              <Field className="md:col-span-2">
                <Label>Correo electrónico</Label>
                <Description>
                  Tu correo está gestionado por AWS Cognito y no puede modificarse aquí.
                </Description>
                <Input value={user.email} disabled />
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSave} disabled={loading || !isDirty} className="w-full sm:w-auto">
                {loading ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </SectionCard>

          {/* Account info (read-only) */}
          <SectionCard icon={BuildingOfficeIcon} title="Información de cuenta">
            <div className="space-y-3">
              {[
                {
                  label: 'Estado de cuenta',
                  value: user.is_active !== false ? 'Activa' : 'Inactiva',
                  badge: user.is_active !== false ? 'lime' : 'zinc',
                } as const,
                {
                  label: 'Tipo de usuario',
                  value: user.is_root ? 'Administrador raíz' : 'Usuario estándar',
                  badge: null,
                },
                {
                  label: 'ID de usuario',
                  value: user.id,
                  badge: null,
                  mono: true,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-sm text-zinc-500">{row.label}</span>
                  {row.badge ? (
                    <Badge color={row.badge}>{row.value}</Badge>
                  ) : (
                    <span
                      className={[
                        'text-sm text-zinc-300',
                        'mono' in row && row.mono ? 'font-mono text-xs text-zinc-500 truncate max-w-[200px]' : '',
                      ].join(' ')}
                    >
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PageTransition>
  )
}
