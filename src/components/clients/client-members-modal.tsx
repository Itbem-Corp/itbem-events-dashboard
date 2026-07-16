'use client'

import { fetcher } from '@/lib/fetcher'
import { useDebounce } from '@/hooks/useDebounce'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'

import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  clientInvitePath,
  clientMemberApplicationPath,
  clientMemberApplicationsPath,
  clientMemberPath,
  clientMembersPagePath,
  clientMembersPath,
  clientRolesPath,
} from '@/lib/api-paths'
import { toast } from 'sonner'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { EmptyState } from '@/components/ui/empty-state'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { Pagination } from '@/components/ui/pagination'
import { getDataErrorState } from '@/lib/swr-data-state'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type {
  ClientMember,
  ClientMemberApplicationAccess,
  ClientMemberLinkResponse,
  ClientMembersPage,
} from '@/models/ClientMember'
import type { ClientRole } from '@/models/ClientRole'
import {
  PencilIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'

type RoleBadgeColor = 'indigo' | 'blue' | 'zinc'

const ORGANIZATION_ROLE_GUIDANCE: Record<string, string> = {
  owner: 'Control total de la organización, estructura y acceso.',
  admin: 'Gestiona miembros y la operación de la organización.',
  event_manager: 'Crea y opera eventos, invitados y configuraciones.',
  editor: 'Edita contenido y experiencias de evento.',
  checkin: 'Opera accesos, RSVP y check-in.',
  analyst: 'Consulta analíticas y resultados, sin editar.',
  member: 'Colabora en los eventos que le correspondan.',
  guest: 'Acceso de solo lectura.',
}

function roleGuidance(roles: ClientRole[], roleId: string) {
  const role = roles.find((candidate) => candidate.id === roleId)
  return role ? ORGANIZATION_ROLE_GUIDANCE[role.code.toLowerCase()] ?? 'Acceso definido por la organización.' : ''
}

function getDefaultRoleId(roles: ClientRole[]) {
  return roles.find((r) => r.code.toLowerCase() === 'member')?.id ?? roles[0]?.id ?? ''
}

function getRoleBadgeColor(roleCode?: string): RoleBadgeColor {
  const normalized = roleCode?.toLowerCase() ?? ''
  if (normalized === 'owner') return 'indigo'
  if (normalized === 'admin' || normalized === 'administrator') return 'blue'
  return 'zinc'
}

function isOwnerRole(roleCode?: string, roleName?: string) {
  return roleCode?.toLowerCase() === 'owner' || roleName?.toLowerCase() === 'owner'
}

/* ── Create new user form ───────────────────────────────────────── */

interface CreateUserFormProps {
  clientId: string
  roles: ClientRole[]
  onDone: () => void
}

function CreateUserForm({ clientId, roles, onDone }: CreateUserFormProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(getDefaultRoleId(roles))
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (roles.length > 0 && !roles.some((role) => role.id === roleId)) {
      setRoleId(getDefaultRoleId(roles))
    }
  }, [roleId, roles])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.firstName = 'Requerido'
    if (!lastName.trim()) e.lastName = 'Requerido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Correo inválido'
    if (!roleId) e.roleId = 'Selecciona un rol'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      await api.post<ClientMemberLinkResponse>(clientMembersPath(), {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        client_id: clientId,
        role_id: roleId,
      })
      await globalMutate(clientMembersPath(clientId))
      toast.success('Usuario invitado y vinculado')
      onDone()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al crear el usuario'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
    >
      <p className="text-sm font-medium text-zinc-200">Crear nuevo usuario</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <Label>Nombre</Label>
          <Input
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value)
              setErrors((p) => ({ ...p, firstName: '' }))
            }}
            placeholder="Juan"
            autoFocus
          />
          {errors.firstName && <ErrorMessage>{errors.firstName}</ErrorMessage>}
        </Field>
        <Field>
          <Label>Apellido</Label>
          <Input
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value)
              setErrors((p) => ({ ...p, lastName: '' }))
            }}
            placeholder="García"
          />
          {errors.lastName && <ErrorMessage>{errors.lastName}</ErrorMessage>}
        </Field>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field>
          <Label>Correo electrónico</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((p) => ({ ...p, email: '' }))
            }}
            placeholder="juan@empresa.com"
          />
          {errors.email && <ErrorMessage>{errors.email}</ErrorMessage>}
        </Field>
        <Field>
          <Label>Rol</Label>
          <Select aria-label="Rol" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {roleGuidance(roles, roleId) && <p className="mt-1 text-xs text-zinc-500">{roleGuidance(roles, roleId)}</p>}
          {errors.roleId && <ErrorMessage>{errors.roleId}</ErrorMessage>}
        </Field>
        <Button onClick={handleCreate} disabled={loading || !roleId} color="emerald">
          {loading ? 'Enviando invitación…' : 'Invitar y asignar'}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Cognito enviará la invitación y gestionará la contraseña temporal. El dashboard nunca verá la contraseña.
      </p>
    </motion.div>
  )
}

function MemberApplicationsDialog({
  member,
  clientId,
  onClose,
}: {
  member: ClientMember
  clientId: string
  onClose: () => void
}) {
  const path = clientMemberApplicationsPath(clientId, member.user_id)
  const { data, error, isLoading, mutate } = useSWR<ClientMemberApplicationAccess[]>(
    path,
    fetcher,
    responsiveListSwrOptions
  )
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const displayName = `${member.user?.first_name ?? member.first_name ?? ''} ${member.user?.last_name ?? member.last_name ?? ''}`.trim()
    || member.user?.email
    || member.email
    || 'este miembro'

  async function toggle(application: ClientMemberApplicationAccess) {
    const nextValue = !application.is_active
    const previous = data
    setSavingCode(application.code)
    await mutate(
      data?.map((candidate) =>
        candidate.code === application.code ? { ...candidate, is_active: nextValue } : candidate
      ),
      { revalidate: false }
    )
    try {
      await api.put(clientMemberApplicationPath(clientId, member.user_id, application.code), {
        is_active: nextValue,
      })
      await mutate()
      toast.success(nextValue ? `Acceso a ${application.name} activado` : `Acceso a ${application.name} retirado`)
    } catch (reason) {
      await mutate(previous, { revalidate: false })
      toast.error(getApiErrorMessage(reason, 'No pudimos actualizar el acceso a la aplicación'))
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>Acceso a aplicaciones</DialogTitle>
      <DialogBody className="space-y-4 py-4">
        <p className="text-sm leading-6 text-zinc-400">
          Define en qué portales puede iniciar sesión <strong className="text-zinc-200">{displayName}</strong>.
          Su rol dentro de la organización se conserva, pero sólo aplica en las aplicaciones activadas.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-zinc-800/50" />)}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-400/15 bg-red-400/[0.06] p-3 text-sm text-red-200">
            No pudimos cargar los accesos. Intenta nuevamente.
          </div>
        ) : data?.length ? (
          <div className="space-y-2">
            {data.map((application) => (
              <div key={application.code} className="flex items-center gap-4 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300">
                  <Squares2X2Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">{application.name}</p>
                  <p className="text-xs text-zinc-500">
                    {application.is_active ? 'Puede iniciar sesión en este producto' : 'Sin acceso a este producto'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={application.is_active}
                  aria-label={`${application.is_active ? 'Desactivar' : 'Activar'} acceso a ${application.name}`}
                  disabled={!application.is_enabled || savingCode === application.code}
                  onClick={() => void toggle(application)}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    application.is_active ? 'bg-indigo-500' : 'bg-zinc-700'
                  }`}
                >
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                    application.is_active ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Squares2X2Icon}
            title="Sin aplicaciones habilitadas"
            description="Primero habilita una aplicación para esta organización."
          />
        )}
      </DialogBody>
      <DialogActions><Button onClick={onClose}>Listo</Button></DialogActions>
    </Dialog>
  )
}

/* ── Invite existing user form ──────────────────────────────────── */

interface InviteFormProps {
  clientId: string
  roles: ClientRole[]
  onDone: () => void
}

function InviteForm({ clientId, roles, onDone }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(getDefaultRoleId(roles))
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    if (roles.length > 0 && !roles.some((role) => role.id === roleId)) {
      setRoleId(getDefaultRoleId(roles))
    }
  }, [roleId, roles])

  const handleInvite = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Ingresa un correo válido')
      return
    }
    if (!roleId) {
      toast.error('No hay roles disponibles para asignar')
      return
    }
    setEmailError('')
    setLoading(true)
    try {
      await api.post<ClientMemberLinkResponse>(clientInvitePath(), {
        email: email.trim(),
        role_id: roleId,
        client_id: clientId,
      })
      await globalMutate(clientMembersPath(clientId))
      setEmail('')
      toast.success('Invitación enviada')
      onDone()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al enviar la invitación'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4"
    >
      <p className="text-sm font-medium text-zinc-200">Invitar miembro</p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field>
          <Label>Correo electrónico</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError('')
            }}
            placeholder="correo@empresa.com"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          />
          {emailError && <ErrorMessage>{emailError}</ErrorMessage>}
        </Field>
        <Field>
          <Label>Rol</Label>
          <Select aria-label="Rol" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {roleGuidance(roles, roleId) && <p className="mt-1 text-xs text-zinc-500">{roleGuidance(roles, roleId)}</p>}
        </Field>
        <Button onClick={handleInvite} disabled={loading || !roleId}>
          {loading ? 'Enviando…' : 'Invitar'}
        </Button>
      </div>
    </motion.div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onMembershipsChanged?: () => void | Promise<void>
}

type AddMode = 'invite' | 'create' | null

export function ClientMembersModal({ isOpen, onClose, clientId, clientName, onMembershipsChanged }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 200)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [memberToRemove, setMemberToRemove] = useState<ClientMember | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [applicationsMember, setApplicationsMember] = useState<ClientMember | null>(null)

  const {
    data: rawMembers,
    isLoading,
    isValidating: membersValidating,
    error: membersError,
    mutate: mutateMembers,
  } = useSWR<ClientMembersPage>(
    isOpen && clientId ? clientMembersPagePath(clientId, page, 20, debouncedSearch) : null,
    fetcher,
    { ...responsiveListSwrOptions, keepPreviousData: true }
  )

  const {
    data: rawRoles,
    isValidating: rolesValidating,
    error: rolesError,
    mutate: mutateRoles,
  } = useSWR<ClientRole[]>(
    isOpen && clientId ? clientRolesPath(clientId) : null,
    fetcher,
    responsiveListSwrOptions
  )
  const members = useMemo(() => rawMembers?.data ?? [], [rawMembers])
  const membersTotal = rawMembers?.total ?? 0
  const roles = useMemo(() => rawRoles ?? [], [rawRoles])
  const membersErrorState = getDataErrorState(membersError, rawMembers)
  const rolesErrorState = getDataErrorState(rolesError, rawRoles)
  const workspaceFatalError = membersErrorState === 'fatal' || rolesErrorState === 'fatal'
  const workspaceStaleError =
    !workspaceFatalError && (membersErrorState === 'stale' || rolesErrorState === 'stale')
  const workspaceRetrying = membersValidating || rolesValidating

  const revalidate = () => mutateMembers()

  const handleRemove = async () => {
    if (!memberToRemove) return
    const removedUserId = memberToRemove.user_id
    const previousMembers = rawMembers
    const optimisticMembers = rawMembers
      ? {
          ...rawMembers,
          data: rawMembers.data.filter((member) => member.user_id !== removedUserId),
          total: Math.max(0, rawMembers.total - 1),
        }
      : rawMembers
    setMemberToRemove(null)
    if (optimisticMembers) {
      await mutateMembers(optimisticMembers, { revalidate: false })
    }
    try {
      await api.delete(clientMemberPath(removedUserId, clientId))
      if (rawMembers?.data.length === 1 && page > 1) {
        setPage((currentPage) => Math.max(1, currentPage - 1))
      } else {
        void revalidate()
      }
      void onMembershipsChanged?.()
      toast.success('Miembro removido')
    } catch (err: unknown) {
      if (previousMembers) {
        await mutateMembers(previousMembers, { revalidate: false })
      }
      toast.error(getApiErrorMessage(err, 'Error al remover el miembro'))
    }
  }

  const handleSaveRole = async (member: ClientMember) => {
    const selectedRole = roles.find((role) => role.id === editingRole)
    const previousMembers = rawMembers
    const optimisticMembers = rawMembers
      ? {
          ...rawMembers,
          data: rawMembers.data.map((currentMember) =>
            currentMember.user_id === member.user_id
              ? {
                  ...currentMember,
                  role_id: editingRole,
                  role_code: selectedRole?.code ?? currentMember.role_code,
                  role_name: selectedRole?.name ?? currentMember.role_name,
                  role: selectedRole?.code ?? currentMember.role,
                }
              : currentMember,
          ),
        }
      : rawMembers
    setSaving(true)
    setEditingMemberId(null)
    if (optimisticMembers) {
      await mutateMembers(optimisticMembers, { revalidate: false })
    }
    try {
      await api.put(clientMemberPath(member.user_id, clientId), {
        new_role_id: editingRole,
      })
      void revalidate()
      void onMembershipsChanged?.()
      toast.success('Rol actualizado')
    } catch (err: unknown) {
      if (previousMembers) {
        await mutateMembers(previousMembers, { revalidate: false })
      }
      setEditingMemberId(member.id || member.user_id)
      toast.error(getApiErrorMessage(err, 'Error al actualizar el rol'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} size="2xl">
        <DialogTitle>Miembros — {clientName}</DialogTitle>

        <DialogBody className="space-y-4 py-4">
          {workspaceFatalError && (
            <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
              <p>No pudimos cargar todos los miembros y roles.</p>
              <button
                type="button"
                onClick={() => void Promise.all([mutateMembers(), mutateRoles()])}
                disabled={workspaceRetrying}
                aria-busy={workspaceRetrying}
                className="mt-2 text-xs font-semibold underline decoration-amber-400/40 underline-offset-2 hover:text-white disabled:cursor-wait disabled:opacity-60"
              >
                {workspaceRetrying ? 'Reintentando…' : 'Reintentar carga'}
              </button>
            </div>
          )}

          {workspaceStaleError && (
            <StaleDataNotice
              label="miembros y roles"
              onRetry={() => void Promise.all([mutateMembers(), mutateRoles()])}
              retrying={workspaceRetrying}
            />
          )}

          {/* Header + action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-400">
              {members.length} de {membersTotal} miembro{membersTotal !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                outline
                disabled={workspaceFatalError || roles.length === 0}
                onClick={() => setAddMode(addMode === 'invite' ? null : 'invite')}
              >
                <UserPlusIcon className="size-4" />
                Invitar existente
              </Button>
              <Button
                outline
                disabled={workspaceFatalError || roles.length === 0}
                onClick={() => setAddMode(addMode === 'create' ? null : 'create')}
              >
                <UserPlusIcon className="size-4" />
                Crear usuario
              </Button>
            </div>
          </div>

          <Input
            type="search"
            aria-label="Buscar miembro"
            placeholder="Buscar por nombre o correo…"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />

          {/* Add forms */}
          <AnimatePresence>
            {addMode === 'invite' && (
              <InviteForm
                clientId={clientId}
                roles={roles}
                onDone={() => {
                  setAddMode(null)
                  void mutateMembers()
                  void onMembershipsChanged?.()
                }}
              />
            )}
            {addMode === 'create' && (
              <CreateUserForm
                clientId={clientId}
                roles={roles}
                onDone={() => {
                  setAddMode(null)
                  void mutateMembers()
                  void onMembershipsChanged?.()
                }}
              />
            )}
          </AnimatePresence>

          {/* Members list */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-800/50" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="Sin miembros"
              description="Invita personas a colaborar en este cliente."
            />
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence>
                {members.map((member) => {
                  const memberKey = member.id || member.user_id
                  const firstName = member.user?.first_name ?? member.first_name ?? ''
                  const lastName = member.user?.last_name ?? member.last_name ?? ''
                  const email = member.user?.email ?? member.email
                  const profileImage = member.user?.profile_image ?? member.profile_image
                  const roleCode = member.role_code ?? member.role
                  const roleLabel = member.role_name ?? roleCode ?? 'Miembro'
                  const isEditing = editingMemberId === memberKey
                  const displayName = `${firstName} ${lastName}`.trim() || email || 'Usuario'
                  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
                  const canManageMember = roles.some((role) => role.id === member.role_id)

                  return (
                    <motion.div
                      key={memberKey}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3"
                    >
                      <Avatar src={profileImage} initials={initials} className="size-8 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">{displayName}</p>
                        {email && <p className="truncate text-xs text-zinc-500">{email}</p>}
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Select
                            aria-label="Rol"
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            className="py-1 text-xs"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </Select>
                          <Button onClick={() => handleSaveRole(member)} disabled={saving || !editingRole}>
                            {saving ? 'Guardando…' : 'Guardar'}
                          </Button>
                          <Button plain aria-label="Cancelar edición de rol" onClick={() => setEditingMemberId(null)}>
                            <XMarkIcon aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge color={getRoleBadgeColor(roleCode)}>
                            {isOwnerRole(roleCode, member.role_name) && <ShieldCheckIcon className="size-3" />}
                            {roleLabel}
                          </Badge>
                          {canManageMember && (
                            <button
                              onClick={() => setApplicationsMember(member)}
                              className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-indigo-500/10 hover:text-indigo-300"
                              aria-label={`Administrar aplicaciones de ${displayName}`}
                              title="Acceso a aplicaciones"
                            >
                              <Squares2X2Icon className="size-3.5" />
                            </button>
                          )}
                          {!isOwnerRole(roleCode, member.role_name) && canManageMember && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMemberId(memberKey)
                                  setEditingRole(member.role_id)
                                }}
                                className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
                                aria-label="Editar rol"
                              >
                                <PencilIcon className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setMemberToRemove(member)}
                                className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-pink-500/10 hover:text-pink-400"
                                aria-label="Remover miembro"
                              >
                                <TrashIcon className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
          <Pagination total={membersTotal} page={page} pageSize={20} onPageChange={setPage} />
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove confirmation */}
      <Alert open={Boolean(memberToRemove)} onClose={() => setMemberToRemove(null)}>
        <AlertTitle>¿Remover miembro?</AlertTitle>
        <AlertDescription>
          Se removerá a{' '}
          <strong className="text-zinc-200">
            {memberToRemove?.user?.first_name} {memberToRemove?.user?.last_name}
          </strong>{' '}
          de {clientName}. Perderá el acceso inmediatamente.
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setMemberToRemove(null)}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleRemove}>
            Remover
          </Button>
        </AlertActions>
      </Alert>

      {applicationsMember && (
        <MemberApplicationsDialog
          member={applicationsMember}
          clientId={clientId}
          onClose={() => setApplicationsMember(null)}
        />
      )}
    </>
  )
}
