'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import {
  eventClientAssignmentsPath,
  eventClientCandidatesPath,
  eventClientPath,
  eventClientResendInvitationPath,
  eventClientsPath,
  organizationEventClientPath,
  organizationEventClientsPath,
} from '@/lib/api-paths'
import { isEventCacheKey } from '@/lib/event-cache'
import { fetcher } from '@/lib/fetcher'
import { requestPathFromUnknownKey } from '@/lib/request-context'
import type {
  EventClient,
  EventClientAssignmentPage,
  EventClientAssignmentResult,
  EventClientAssignmentUpdate,
  EventClientCandidate,
  EventClientCreateRequest,
  EventClientCreateResponse,
  OrganizationEventClientPage,
} from '@/features/events/event-clients'
import { useMemo } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'

export const EVENT_CLIENT_ASSIGNMENTS_PAGE_SIZE = 20
export const ORGANIZATION_EVENT_CLIENTS_PAGE_SIZE = 20

const swrOptions = { revalidateOnFocus: false, shouldRetryOnError: false } as const

function listOf<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  const inner = readApiData<unknown>(value)
  return Array.isArray(inner) ? (inner as T[]) : []
}

function pageOf<T extends { data: unknown[] }>(value: unknown): T | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (Array.isArray(record.data)) return record as unknown as T
  const inner = readApiData<unknown>(value)
  return inner && typeof inner === 'object' && Array.isArray((inner as Record<string, unknown>).data)
    ? (inner as T)
    : undefined
}

/** Requests only while the modal or panel that needs them is open. */
export function useEventClients(eventId: string, enabled: boolean) {
  const key = useScopedFetcherKey(enabled ? eventClientsPath(eventId) : null)
  const response = useSWR<unknown>(key, fetcher, swrOptions)
  const clients = useMemo(() => listOf<EventClient>(response.data), [response.data])
  return { ...response, clients }
}

export function useEventClientCandidates(eventId: string, search: string, enabled: boolean) {
  const key = useScopedFetcherKey(enabled ? eventClientCandidatesPath(eventId, search) : null)
  const response = useSWR<unknown>(key, fetcher, { ...swrOptions, keepPreviousData: true })
  const candidates = useMemo(() => listOf<EventClientCandidate>(response.data), [response.data])
  return { ...response, candidates }
}

export function useEventClientAssignments(
  eventId: string,
  userId: string | null,
  query: { page: number; search?: string },
  enabled: boolean
) {
  const path =
    enabled && userId
      ? eventClientAssignmentsPath(eventId, userId, {
          page: query.page,
          page_size: EVENT_CLIENT_ASSIGNMENTS_PAGE_SIZE,
          search: query.search?.trim() || null,
        })
      : null
  const key = useScopedFetcherKey(path)
  const response = useSWR<unknown>(key, fetcher, { ...swrOptions, keepPreviousData: true })
  const page = useMemo(() => pageOf<EventClientAssignmentPage>(response.data), [response.data])
  return { ...response, page }
}

export function useOrganizationEventClients(organizationId: string | null, page: number, enabled: boolean) {
  const path =
    enabled && organizationId
      ? organizationEventClientsPath(organizationId, { page, page_size: ORGANIZATION_EVENT_CLIENTS_PAGE_SIZE })
      : null
  const key = useScopedFetcherKey(path)
  const response = useSWR<unknown>(key, fetcher, { ...swrOptions, keepPreviousData: true })
  const grants = useMemo(() => pageOf<OrganizationEventClientPage>(response.data), [response.data])
  return { ...response, grants }
}

function isEventClientCacheKey(key: unknown, eventId: string): boolean {
  const path = requestPathFromUnknownKey(key)
  return Boolean(path?.startsWith(eventClientsPath(eventId)))
}

function isOrganizationEventClientCacheKey(key: unknown): boolean {
  const path = requestPathFromUnknownKey(key)
  return Boolean(path && /^\/clients\/[^/]+\/members\/event-clients(?:\?|$)/.test(path))
}

/** After a write: the event's client list, candidates, assignments and event caches. */
export async function refreshEventClientCaches(eventId: string, touchedEventIds: readonly string[] = []) {
  const events = new Set([eventId, ...touchedEventIds])
  // Without data, mutate(matcher) only revalidates: no cache is emptied.
  await globalMutate((key) =>
    isOrganizationEventClientCacheKey(key) ||
    [...events].some((id) => isEventClientCacheKey(key, id) || isEventCacheKey(key, id))
  )
}

export async function createEventClient(
  eventId: string,
  body: EventClientCreateRequest
): Promise<EventClientCreateResponse> {
  const response = await api.post(eventClientsPath(eventId), body)
  return readApiData<EventClientCreateResponse>(response.data)
}

export async function revokeEventClient(eventId: string, userId: string): Promise<void> {
  await api.delete(eventClientPath(eventId, userId))
}

export async function updateEventClientAssignments(
  eventId: string,
  userId: string,
  update: EventClientAssignmentUpdate
): Promise<EventClientAssignmentResult> {
  const response = await api.patch(eventClientAssignmentsPath(eventId, userId), update)
  return readApiData<EventClientAssignmentResult>(response.data)
}

export async function revokeOrganizationEventClient(organizationId: string, userId: string): Promise<number> {
  const response = await api.delete(organizationEventClientPath(organizationId, userId))
  return readApiData<{ revoked?: number }>(response.data)?.revoked ?? 0
}

export async function resendEventClientInvitation(eventId: string, userId: string): Promise<void> {
  await api.post(eventClientResendInvitationPath(eventId, userId), {})
}
