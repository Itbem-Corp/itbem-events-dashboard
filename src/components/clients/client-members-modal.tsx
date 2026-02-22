'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'

import { api } from '@/lib/api'
import { toast } from 'sonner'

import { Dialog, DialogBody, DialogTitle, DialogActions } from '@/components/dialog'
import { Alert, AlertTitle, AlertDescription, AlertActions } from '@/components/alert'
import { Button } from '@/components/button'
import { Field, Label, ErrorMessage } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Badge } from '@/components/badge'
import { Avatar } from '@/components/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import {
  UserPlusIcon,
  TrashIcon,
  UsersIcon,
  ShieldCheckIcon,
  PencilIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/20/solid'
import type { ClientRole } from '@/models/ClientRole'

// Backend role codes
const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Propietario', color: 'indigo' as const },
  { value: 'ADMIN', label: 'Administrador', color: 'blue' as const },
  { value: 'EDITOR', label: 'Editor', color: 'zinc' as const },
  { value: 'VIEWER', label: 'Visualizador', color: 'zinc' as const },
]

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '@#$!%'
  const all = upper + lower + digits + symbols
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)]
  const base = [rand(upper), rand(lower), rand(digits), rand(symbols)]
  for (let i = 0; i < 8; i++) base.push(rand(all))
  return base.sort(() => Math.random() - 0.5).join('')
}

function getRoleBadgeColor(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.color ?? 'zinc'
}

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role
}

interface ClientMember {
  id: string
  user_id: string
  client_id: string
  role: string
  joined_at?: string
  user?: {
    id: string
    first_name: string
    last_name: string
    email: string
    profile_image?: string
    is_active?: boolean
  }
}

/* ── Create new user form ───────────────────────────────────────── */

interface CreateUserFormProps {
  clientId: string
  roles: ClientRole[]
  onDone: (password: string, email: string) => void
}

function CreateUserForm({ clientId, roles, onDone }: CreateUserFormProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [roleId, setRoleId]       = useState(roles.find((r) => r.code === 'EDITOR')?.id ?? roles[0]?.id ?? '')
  const [loading, setLoading]     = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.firstName = 'Requerido'
    if (!lastName.trim())  e.lastName  = 'Requerido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Correo inválido'
    if (!roleId) e.roleId = 'Selecciona un rol'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    const password = generatePassword()
    setLoading(true)
    try {
      await api.post('/clients/members', {
        email:      email.trim(),
        password,
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        client_id:  clientId,
        role_id:    roleId,
      })
      await globalMutate(`/clients/members?client_id=${clientId}`)
      toast.success('Usuario creado y vinculado')
      onDone(password, email.trim())
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error al crear el usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3"
    >
      <p className="text-sm font-medium text-zinc-200">Crear nuevo usuario</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Nombre</Label>
          <Input value={firstName} onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: '' })) }} placeholder="Juan" autoFocus />
          {errors.firstName && <ErrorMessage>{errors.firstName}</ErrorMessage>}
        </Field>
        <Field>
          <Label>Apellido</Label>
          <Input value={lastName} onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: '' })) }} placeholder="García" />
          {errors.lastName && <ErrorMessage>{errors.lastName}</ErrorMessage>}
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <Field>
          <Label>Correo electrónico</Label>
          <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }} placeholder="juan@empresa.com" />
          {errors.email && <ErrorMessage>{errors.email}</ErrorMessage>}
        </Field>
        <Field>
          <Label>Rol</Label>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.filter((r) => r.code !== 'OWNER').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          {errors.roleId && <ErrorMessage>{errors.roleId}</ErrorMessage>}
        </Field>
        <Button onClick={handleCreate} disabled={loading} color="emerald">
          {loading ? 'Creando…' : 'Crear'}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Se generará una contraseña temporal que podrás copiar después de crear el usuario.
      </p>
    </motion.div>
  )
}

/* ── Password reveal dialog ─────────────────────────────────────── */

interface PasswordDialogProps {
  password: string
  email: string
  onClose: () => void
}

function PasswordDialog({ password, email, onClose }: PasswordDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Alert open onClose={onClose}>
      <AlertTitle>Contraseña temporal generada</AlertTitle>
      <AlertDescription>
        <p className="mb-3">
          El usuario <strong className="text-zinc-200">{email}</strong> fue creado exitosamente.
          Comparte esta contraseña temporal de forma segura — solo se muestra una vez.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
          <code className="flex-1 font-mono text-sm text-emerald-300 select-all">{password}</code>
          <button
            onClick={handleCopy}
            className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Copiar contraseña"
          >
            {copied
              ? <CheckIcon className="size-4 text-emerald-400" />
              : <ClipboardDocumentIcon className="size-4" />
            }
          </button>
        </div>
      </AlertDescription>
      <AlertActions>
        <Button onClick={onClose}>Entendido</Button>
      </AlertActions>
    </Alert>
  )
}

/* ── Invite existing user form ──────────────────────────────────── */

interface InviteFormProps {
  clientId: string
  onDone: () => void
}

function InviteForm({ clientId, onDone }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('EDITOR')
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  const handleInvite = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Ingresa un correo válido')
      return
    }
    setEmailError('')
    setLoading(true)
    try {
      await api.post('/clients/invite', {
        email: email.trim(),
        role,
        client_id: clientId,
      })
      await globalMutate(`/clients/members?client_id=${clientId}`)
      setEmail('')
      toast.success('Invitación enviada')
      onDone()
    } catch {
      toast.error('Error al enviar la invitación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3"
    >
      <p className="text-sm font-medium text-zinc-200">Invitar miembro</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
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
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.filter((r) => r.value !== 'OWNER').map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={handleInvite} disabled={loading}>
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
}

type AddMode = 'invite' | 'create' | null

export function ClientMembersModal({ isOpen, onClose, clientId, clientName }: Props) {
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [memberToRemove, setMemberToRemove] = useState<ClientMember | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingPassword, setPendingPassword] = useState<{ password: string; email: string } | null>(null)

  const { data: members = [], isLoading } = useSWR<ClientMember[]>(
    isOpen && clientId ? `/clients/members?client_id=${clientId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const { data: roles = [] } = useSWR<ClientRole[]>(
    isOpen ? '/catalogs/roles' : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const revalidate = () => globalMutate(`/clients/members?client_id=${clientId}`)

  const handleRemove = async () => {
    if (!memberToRemove) return
    try {
      await api.delete(`/clients/members/${memberToRemove.user_id}?client_id=${clientId}`)
      await revalidate()
      setMemberToRemove(null)
      toast.success('Miembro removido')
    } catch {
      toast.error('Error al remover el miembro')
    }
  }

  const handleSaveRole = async (member: ClientMember) => {
    setSaving(true)
    try {
      await api.put(`/clients/members/${member.user_id}?client_id=${clientId}`, {
        role: editingRole,
      })
      await revalidate()
      setEditingMemberId(null)
      toast.success('Rol actualizado')
    } catch {
      toast.error('Error al actualizar el rol')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} size="2xl">
        <DialogTitle>Miembros — {clientName}</DialogTitle>

        <DialogBody className="py-4 space-y-4">
          {/* Header + action buttons */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-zinc-400">
              {members.length} miembro{members.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                outline
                onClick={() => setAddMode(addMode === 'invite' ? null : 'invite')}
              >
                <UserPlusIcon className="size-4" />
                Invitar existente
              </Button>
              <Button
                outline
                onClick={() => setAddMode(addMode === 'create' ? null : 'create')}
              >
                <UserPlusIcon className="size-4" />
                Crear usuario
              </Button>
            </div>
          </div>

          {/* Add forms */}
          <AnimatePresence>
            {addMode === 'invite' && (
              <InviteForm
                clientId={clientId}
                onDone={() => setAddMode(null)}
              />
            )}
            {addMode === 'create' && (
              <CreateUserForm
                clientId={clientId}
                roles={roles}
                onDone={(password, email) => {
                  setAddMode(null)
                  setPendingPassword({ password, email })
                }}
              />
            )}
          </AnimatePresence>

          {/* Members list */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-zinc-800/50 animate-pulse rounded-xl" />
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
                  const user = member.user
                  const isEditing = editingMemberId === member.id
                  const displayName = user
                    ? `${user.first_name} ${user.last_name}`
                    : 'Usuario'
                  const initials = user
                    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
                    : '?'

                  return (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3"
                    >
                      <Avatar
                        src={user?.profile_image}
                        initials={initials}
                        className="size-8 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
                        {user?.email && (
                          <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            className="py-1 text-xs"
                          >
                            {ROLE_OPTIONS.filter((r) => r.value !== 'OWNER').map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                          <Button
                            onClick={() => handleSaveRole(member)}
                            disabled={saving}
                          >
                            {saving ? '…' : 'OK'}
                          </Button>
                          <Button plain onClick={() => setEditingMemberId(null)}>
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge color={getRoleBadgeColor(member.role)}>
                            {member.role === 'OWNER' && <ShieldCheckIcon className="size-3" />}
                            {getRoleLabel(member.role)}
                          </Badge>
                          {member.role !== 'OWNER' && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMemberId(member.id)
                                  setEditingRole(member.role)
                                }}
                                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                                aria-label="Editar rol"
                              >
                                <PencilIcon className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setMemberToRemove(member)}
                                className="p-1.5 rounded-lg text-zinc-600 hover:text-pink-400 hover:bg-pink-500/10 transition-colors"
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

      {/* One-time password reveal */}
      {pendingPassword && (
        <PasswordDialog
          password={pendingPassword.password}
          email={pendingPassword.email}
          onClose={() => setPendingPassword(null)}
        />
      )}
    </>
  )
}
