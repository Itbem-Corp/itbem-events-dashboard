'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { readApiData } from '@/lib/api-envelope'
import { api } from '@/lib/api'
import { clientMembersPath, eventMemberPath, eventMembersPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { ClientMember } from '@/models/ClientMember'
import type { EventMember, EventMemberRole } from '@/models/EventMember'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventRoleLabel } from '@/lib/role-labels'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

function memberDisplayName(member: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
	return `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || member.email || 'Sin nombre'
}

function memberOptionLabel(member: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
	const name = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()
	return name && member.email ? `${name} · ${member.email}` : name || member.email || 'Sin nombre'
}

const roleDescriptions: Record<EventMemberRole, string> = {
	EVENT_OWNER: 'Opera todo el evento dentro de su acceso en la organización.',
	MANAGER: 'Coordina la operación del evento.',
	EDITOR: 'Edita contenido, invitados y configuración.',
	CHECKIN: 'Opera el check-in.',
	ANALYST: 'Consulta analíticas.',
	VIEWER: 'Solo consulta.',
}

export const eventMemberRoleOptions: Array<{ value: EventMemberRole; label: string; description: string }> = (
	['EVENT_OWNER', 'MANAGER', 'EDITOR', 'CHECKIN', 'ANALYST', 'VIEWER'] as const
).map((value) => ({ value, label: eventRoleLabel(value), description: roleDescriptions[value] }))

interface EventMembersModalProps {
	eventId: string
	clientId: string
	isOpen: boolean
	onClose: () => void
}

export function EventMembersModal({ eventId, clientId, isOpen, onClose }: EventMembersModalProps) {
	const membersKey = isOpen ? eventMembersPath(eventId) : null
	const clientMembersKey = isOpen ? clientMembersPath(clientId) : null
	const {
		data: rawMembers,
		error: membersError,
		isValidating: membersValidating,
		mutate: mutateMembers,
	} = useSWR<EventMember[]>(membersKey, fetcher)
	const { data: rawClientMembers } = useSWR<ClientMember[]>(clientMembersKey, fetcher)
	const members = useMemo(() => readApiData<EventMember[]>(rawMembers) ?? [], [rawMembers])
	const clientMembers = useMemo(() => readApiData<ClientMember[]>(rawClientMembers) ?? [], [rawClientMembers])
	const [userId, setUserId] = useState('')
	const [role, setRole] = useState<EventMemberRole>('EDITOR')
	const [saving, setSaving] = useState(false)

	const eligibleMembers = useMemo(
		() => clientMembers.filter((member) => member.user_id && member.user?.is_active !== false),
		[clientMembers]
	)

	const saveAssignment = async () => {
		if (!userId || saving) return
		setSaving(true)
		try {
			await api.put(eventMembersPath(eventId), { user_id: userId, role })
			setUserId('')
			await mutateMembers()
		} catch (error) {
			toast.error(getApiErrorMessage(error, 'No se pudo actualizar el acceso al evento'))
		} finally {
			setSaving(false)
		}
	}

	const removeAssignment = async (member: EventMember) => {
		if (saving) return
		setSaving(true)
		try {
			await api.delete(eventMemberPath(eventId, member.user_id))
			await mutateMembers()
		} catch (error) {
			toast.error(getApiErrorMessage(error, 'No se pudo actualizar el acceso al evento'))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={isOpen} onClose={onClose} size="2xl">
			<DialogTitle>Equipo del evento</DialogTitle>
			<DialogDescription>
				Una asignación de evento puede restringir el acceso de una persona, pero nunca ampliarlo sobre su rol en la organización.
			</DialogDescription>
			<DialogBody className="space-y-5">
				<div className="grid gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto] sm:items-center">
					<select aria-label="Miembro de la organización" value={userId} onChange={(event) => setUserId(event.target.value)} className="w-full min-w-0 truncate rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-ink dark:border-white/10 dark:bg-canvas dark:text-white">
						<option value="">Selecciona una persona</option>
						{eligibleMembers.map((member) => <option key={member.user_id} value={member.user_id}>{memberOptionLabel(member)}</option>)}
					</select>
					<select aria-label="Rol en el evento" value={role} onChange={(event) => setRole(event.target.value as EventMemberRole)} className="w-full min-w-0 truncate rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-ink dark:border-white/10 dark:bg-canvas dark:text-white">
						{eventMemberRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					</select>
					<Button color="indigo" onClick={() => void saveAssignment()} disabled={!userId || saving}>Asignar</Button>
				</div>
				<p className="-mt-3 px-1 text-xs text-ink-muted">{roleDescriptions[role]}</p>
				<div className="space-y-2">
					{/* A failed or pending load must never read as "Sin restricciones" (EVT-14). */}
					{membersError && rawMembers === undefined ? (
						<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-300">
							<span>No pudimos cargar el equipo del evento.</span>
							<Button outline onClick={() => void mutateMembers()} disabled={membersValidating}>{membersValidating ? 'Reintentando…' : 'Reintentar'}</Button>
						</div>
					) : rawMembers === undefined ? (
						<p role="status" className="rounded-xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted dark:border-white/10">Cargando equipo del evento…</p>
					) : members.length === 0 ? <p className="rounded-xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted dark:border-white/10">Sin restricciones por evento: las personas usan su rol de organización.</p> : members.map((member) => (
						<div key={member.user_id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3 dark:border-white/10">
							<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink dark:text-white">{memberDisplayName(member)}</p>{memberDisplayName(member) !== member.email && <p className="truncate text-xs text-ink-muted">{member.email}</p>}</div>
							<span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">{eventMemberRoleOptions.find((option) => option.value === member.role)?.label ?? member.role}</span>
							<Button outline onClick={() => void removeAssignment(member)} disabled={saving}>Quitar</Button>
						</div>
					))}
				</div>
			</DialogBody>
			<DialogActions><Button outline onClick={onClose}>Cerrar</Button></DialogActions>
		</Dialog>
	)
}
