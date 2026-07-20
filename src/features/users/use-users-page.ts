'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { readApiData } from '@/lib/api-envelope'
import { usersAllPath, type UsersAllStatusFilter } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { AdminUserListItemResponse, AdminUsersPageResponse } from '@/models/User'
import { useMemo } from 'react'
import useSWR from 'swr'

export type UserStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ROOT'

const statusQueryByFilter: Record<UserStatusFilter, UsersAllStatusFilter | undefined> = {
  ALL: undefined,
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ROOT: 'root',
}

export interface UsersPageQuery {
  page: number
  pageSize: number
  search: string
  status: UserStatusFilter
}

export function usersPageQueryPath({ page, pageSize, search, status }: UsersPageQuery) {
  return usersAllPath({ page, page_size: pageSize, search, status: statusQueryByFilter[status] })
}

export function useUsersPage({ page, pageSize, search, status }: UsersPageQuery) {
  const path = useMemo(
    () => usersPageQueryPath({ page, pageSize, search, status }),
    [page, pageSize, search, status]
  )
  const key = useScopedFetcherKey(path)
  const swr = useSWR<AdminUsersPageResponse | AdminUserListItemResponse[]>(key, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const usersPayload = useMemo(
    () => readApiData<AdminUsersPageResponse | AdminUserListItemResponse[] | undefined>(swr.data),
    [swr.data]
  )
  const usersPage = useMemo(
    () => (usersPayload && !Array.isArray(usersPayload) && Array.isArray(usersPayload.data) ? usersPayload : null),
    [usersPayload]
  )
  const users = useMemo(
    () => (usersPage ? usersPage.data : Array.isArray(usersPayload) ? usersPayload : []),
    [usersPage, usersPayload]
  )

  return {
    ...swr,
    users,
    usersPage,
    usersPayload,
    dataErrorState: getDataErrorState(swr.error, swr.data),
  }
}
