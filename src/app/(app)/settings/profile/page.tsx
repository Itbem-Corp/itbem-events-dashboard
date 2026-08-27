'use client'

import { useUserProfile } from '@/features/users/use-user-profile'
import { useState } from 'react'

import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageTransition } from '@/components/ui/page-transition'
import { PageDataError } from '@/components/ui/page-data-error'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { ProfilePageSkeleton } from '@/components/profile/profile-page-skeleton'
import {
  BuildingOfficeIcon,
  CameraIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'

const loadProfileAvatarModal = () => import('@/components/profile/profile-avatar-modal')
const ProfileAvatarModal = dynamic(() => loadProfileAvatarModal().then((module) => module.ProfileAvatarModal), {
  ssr: false,
})

function preloadProfileAvatarModal() {
  void loadProfileAvatarModal().catch(() => undefined)
}

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
    <section className="rounded-2xl border border-white/10 bg-surface/40 p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-surface-raised">
          <Icon className="size-4 text-ink-secondary" />
        </div>
        <Subheading>{title}</Subheading>
      </div>
      {children}
    </section>
  )
}

export default function ProfilePage() {
  const {
    user,
    profileErrorState,
    profileRetrying,
    retryProfile,
    firstName,
    lastName,
    loading,
    isDirty,
    hasValidName,
    updateFirstName,
    updateLastName,
    updateAvatar,
    saveProfile,
  } = useUserProfile()
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false)

  if (profileErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar tu perfil"
        description="Revisa tu conexión y vuelve a intentarlo. Tu sesión permanece activa."
        onRetry={() => void retryProfile()}
        retrying={profileRetrying}
        icon={UserIcon}
      />
    )
  }

  if (!user) return <ProfilePageSkeleton />

  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading>Mi perfil</Heading>
          <p className="mt-1 text-sm text-ink-secondary">Administra tu información personal y preferencias de cuenta.</p>
        </div>
        {user.is_root && (
          <Badge color="indigo">
            <ShieldCheckIcon className="size-3" />
            Administrador raíz
          </Badge>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {profileErrorState === 'stale' && (
          <div className="md:col-span-2 lg:col-span-3">
            <StaleDataNotice label="tu perfil" onRetry={() => void retryProfile()} retrying={profileRetrying} />
          </div>
        )}
        {/* Avatar */}
        <SectionCard icon={UserIcon} title="Foto de perfil">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar
                src={user.profile_image}
                square
                initials={initials || 'U'}
                alt={`Foto de ${user.first_name} ${user.last_name}`.trim()}
                sizes="160px"
                className="size-32 rounded-3xl bg-gradient-to-br from-(--tenant-accent) to-indigo-700 text-[#fff] shadow-[0_18px_42px_var(--app-shadow)] ring-1 ring-(--tenant-accent)/25 sm:size-36"
              />
              <span
                className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-xl border border-white/10 bg-surface-raised text-ink-secondary shadow-lg"
                aria-hidden="true"
              >
                <CameraIcon className="size-4" />
              </span>
            </div>
            <p className="mt-5 text-sm font-medium text-ink">
              {user.first_name} {user.last_name}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{user.email}</p>
            <Button
              outline
              className="mt-5 w-full"
              onClick={() => setIsAvatarEditorOpen(true)}
              onPointerEnter={preloadProfileAvatarModal}
              onPointerDown={preloadProfileAvatarModal}
              onFocus={preloadProfileAvatarModal}
            >
              <CameraIcon />
              Cambiar foto
            </Button>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">JPG, PNG, WebP, HEIC, AVIF o SVG · Hasta 10 MB</p>
          </div>
        </SectionCard>

        {/* Personal info form */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard icon={EnvelopeIcon} title="Información personal">
            <div className="grid grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2">
              <Field>
                <Label>Nombre</Label>
                <Input
                  value={firstName}
                  disabled={loading}
                  onChange={(e) => {
                    updateFirstName(e.target.value)
                  }}
                  placeholder="Tu nombre"
                />
              </Field>
              <Field>
                <Label>Apellidos</Label>
                <Input
                  value={lastName}
                  disabled={loading}
                  onChange={(e) => {
                    updateLastName(e.target.value)
                  }}
                  placeholder="Tus apellidos"
                />
              </Field>
              <Field className="md:col-span-2">
                <Label>Correo electrónico</Label>
                <Description>Tu correo está gestionado por AWS Cognito y no puede modificarse aquí.</Description>
                <Input value={user.email} disabled />
              </Field>
            </div>

            {isDirty && !hasValidName && (
              <p role="alert" className="mt-3 text-xs text-red-400">
                Nombre y apellidos son obligatorios.
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                onClick={saveProfile}
                disabled={loading || !isDirty || !hasValidName}
                className="w-full sm:w-auto"
              >
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
                  className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0"
                >
                  <span className="text-sm text-ink-muted">{row.label}</span>
                  {row.badge ? (
                    <Badge color={row.badge}>{row.value}</Badge>
                  ) : (
                    <span
                      className={[
                        'text-sm text-ink-secondary',
                        'mono' in row && row.mono ? 'max-w-[200px] truncate font-mono text-xs text-ink-muted' : '',
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

      {isAvatarEditorOpen && (
        <ProfileAvatarModal
          open
          value={user.profile_image}
          onClose={() => setIsAvatarEditorOpen(false)}
          onAvatarChange={(profileImage) => {
            updateAvatar(profileImage)
          }}
        />
      )}
    </PageTransition>
  )
}
