export type EventMemberRole = 'EVENT_OWNER' | 'MANAGER' | 'EDITOR' | 'CHECKIN' | 'ANALYST' | 'VIEWER'

export interface EventMember {
	event_id: string
	user_id: string
	role: EventMemberRole
	first_name: string
	last_name: string
	email: string
	created_at: string
}

export interface EventCapabilities {
	'event:manage': boolean
	'guest:manage': boolean
	'checkin:run': boolean
	'analytics:view': boolean
	'members:manage': boolean
}
