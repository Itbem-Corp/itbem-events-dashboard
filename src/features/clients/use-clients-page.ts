'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { readApiData } from '@/lib/api-envelope'
import { clientsPagePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { ClientsPageResponse } from '@/models/Client'
import { useMemo } from 'react'
import useSWR from 'swr'

export interface ClientsPageQuery {
  page: number
  pageSize: number
  search: string
}

export function clientsPageQueryPath({ page, pageSize, search }: ClientsPageQuery) {
  return clientsPagePath({ page, page_size: pageSize, search })
}

export function useClientsPage({ page, pageSize, search }: ClientsPageQuery) {
  const path = useMemo(
    () => clientsPageQueryPath({ page, pageSize, search }),
    [page, pageSize, search]
  )
  const key = useScopedFetcherKey(path)
  const swr = useSWR<ClientsPageResponse>(key, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const clientsPage = useMemo(
    () => readApiData<ClientsPageResponse | undefined>(swr.data),
    [swr.data]
  )
  const clients = useMemo(() => clientsPage?.data ?? [], [clientsPage])

  return {
    ...swr,
    clients,
    clientsPage,
    dataErrorState: getDataErrorState(swr.error, swr.data),
  }
}
