'use client'

import {
  AgentDirectoryLoadState,
  AgentDirectoryScreen,
  AgentDirectoryScopeGate,
} from '@/features/automation/agent-directory-screen'
import {
  automationAgentDirectoryPath,
  parseAutomationAgentDirectory,
  parseAutomationAgentHistory,
} from '@/features/automation/agent-directory'
import type {
  AutomationAgentHistoryPage,
  AutomationAgentHistoryQueryFilters,
} from '@/features/automation/agent-directory'
import type { AgentDirectoryProjectOption, AgentDirectoryScopeOption } from '@/features/automation/agent-directory-screen'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { useAgentDirectoryStream } from '@/features/automation/use-agent-directory-stream'
import { automationAgentHistoryPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { useStore } from '@/store/useStore'
import type { ScopedFetcherKey } from '@/lib/request-context'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { useCallback, useEffect, useMemo, useState } from 'react'

type AgentHistoryRequest = {
  agentKey: string | null
  filters: AutomationAgentHistoryQueryFilters
}

const EMPTY_HISTORY_FILTERS: AutomationAgentHistoryQueryFilters = {
  from: '',
  to: '',
  client_id: '',
  project_id: '',
  work_item_id: '',
  operation: '',
  status: '',
  provider: '',
  worker_id: '',
  machine_id: '',
  agent_instance_id: '',
  run_id: '',
}

function projectScopeOptions(projects: DeliveryProject[]) {
  const clients = new Map<string, string>()
  const visibleProjects: AgentDirectoryProjectOption[] = []
  for (const project of Array.isArray(projects) ? projects : []) {
    if (!project.id || !project.client_id) continue
    clients.set(project.client_id, project.client?.name?.trim() || project.client_id)
    visibleProjects.push({ id: project.id, client_id: project.client_id, name: project.name?.trim() || project.id })
  }
  const clientOptions: AgentDirectoryScopeOption[] = [...clients]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es-MX'))
  visibleProjects.sort((left, right) => left.name.localeCompare(right.name, 'es-MX'))
  return { clients: clientOptions, projects: visibleProjects }
}

export default function AutomationAgentsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspaceMode = useStore((state) => state.workspaceMode)
  const currentClient = useStore((state) => state.currentClient)
  const scopeFetcherKey = useScopedFetcherScope()
  const isOrganization = workspaceMode === 'organization'
  const projectsKey = !isOrganization || currentClient?.id ? scopeFetcherKey(deliveryProjectsPath()) : null
  const visibleProjects = useSWR<DeliveryProject[]>(projectsKey, fetcher, {
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
    keepPreviousData: false,
  })
  const scopeOptions = useMemo(() => projectScopeOptions(visibleProjects.data ?? []), [visibleProjects.data])
  const projectOptionsReady = visibleProjects.data !== undefined
  const requestedClientValues = searchParams.getAll('client_id')
  const requestedProjectValues = searchParams.getAll('project_id')
  const rawClientId = requestedClientValues.length === 1 ? requestedClientValues[0] : ''
  const rawProjectId = requestedProjectValues.length === 1 ? requestedProjectValues[0] : ''
  const selectedClientId = rawClientId && (!projectOptionsReady || scopeOptions.clients.some((option) => option.id === rawClientId))
    ? rawClientId
    : ''
  const selectedProject = rawProjectId && projectOptionsReady
    ? scopeOptions.projects.find((project) => project.id === rawProjectId && project.client_id === selectedClientId)
    : undefined
  const selectedProjectId = selectedProject?.id ?? ''
  const hasInvalidScope = projectOptionsReady && (
    requestedClientValues.length > 1 || requestedProjectValues.length > 1 ||
    (rawClientId !== '' && selectedClientId === '') || (rawProjectId !== '' && selectedProjectId === '')
  )
  const organizationSelectionReady = !isOrganization || Boolean(selectedClientId)
  const requestedScopeValidated = !((selectedClientId || rawProjectId) && !projectOptionsReady)
  const mayRequestDirectory = organizationSelectionReady && requestedScopeValidated && !hasInvalidScope
  const directoryPath = mayRequestDirectory
    ? scopeFetcherKey(automationAgentDirectoryPath({ client_id: selectedClientId, project_id: selectedProjectId }))
    : null
  const [historyRequest, setHistoryRequest] = useState<AgentHistoryRequest>({ agentKey: null, filters: EMPTY_HISTORY_FILTERS })
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    directoryPath,
    async (path) => parseAutomationAgentDirectory(await fetcher<unknown>(path)),
    {
      refreshInterval: 60_000,
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      keepPreviousData: false,
    },
  )
  const requestedAgentKeys = searchParams.getAll('agent')
  const requestedAgentKey = requestedAgentKeys.length === 1 ? requestedAgentKeys[0] : null
  const matchingAgents = data && requestedAgentKey
    ? data.agents.filter((agent) => agent.agent_key === requestedAgentKey)
    : []
  const selectedAgentKey = matchingAgents.length === 1 ? matchingAgents[0].agent_key : null
  const invalidAgentParam = Boolean(data && searchParams.has('agent') && !selectedAgentKey)

  const updateAgentUrl = useCallback((agentKey: string | null, method: 'push' | 'replace') => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (agentKey) nextParams.set('agent', agentKey)
    else nextParams.delete('agent')
    const query = nextParams.toString()
    const nextUrl = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`
    router[method](nextUrl, { scroll: false })
  }, [pathname, router, searchParams])

  const history = useSWRInfinite<AutomationAgentHistoryPage>(
    (index, previousPage) => {
      if (!historyRequest.agentKey || !data || !mayRequestDirectory) return null
      if (index > 0 && (!previousPage?.has_more || !previousPage.next_cursor)) return null
      const filters = {
        ...historyRequest.filters,
        client_id: selectedClientId || historyRequest.filters.client_id,
        project_id: selectedProjectId || historyRequest.filters.project_id,
      }
      const path = index === 0
        ? automationAgentHistoryPath(historyRequest.agentKey, { limit: 50, ...filters })
        : automationAgentHistoryPath(historyRequest.agentKey, { limit: 50, cursor: previousPage?.next_cursor, ...filters })
      return scopeFetcherKey(path)
    },
    async (path) => {
      const page = parseAutomationAgentHistory(await fetcher<unknown>(path as ScopedFetcherKey))
      if (page.agent_key !== historyRequest.agentKey) throw new Error('El historial recibido no corresponde al perfil seleccionado.')
      return page
    },
    {
      initialSize: 1,
      persistSize: false,
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
    },
  )
  const setHistorySize = history.setSize
  const mutateHistory = history.mutate
  const selectedHistoryFirstPageKey = selectedAgentKey && historyRequest.agentKey === selectedAgentKey
    ? scopeFetcherKey(automationAgentHistoryPath(selectedAgentKey, {
      limit: 50,
      ...historyRequest.filters,
      client_id: selectedClientId || historyRequest.filters.client_id,
      project_id: selectedProjectId || historyRequest.filters.project_id,
    }))
    : null
  const revalidateDirectory = useCallback(() => {
    void mutate()
  }, [mutate])
  const revalidateVisibleHistoryFirstPage = useCallback(() => {
    if (!selectedHistoryFirstPageKey) return
    void mutateHistory(undefined, {
      revalidate: (_page, key) => JSON.stringify(key) === JSON.stringify(selectedHistoryFirstPageKey),
    })
  }, [mutateHistory, selectedHistoryFirstPageKey])

  useAgentDirectoryStream({
    enabled: Boolean(directoryPath),
    client_id: selectedClientId,
    project_id: selectedProjectId,
    onSnapshot: revalidateDirectory,
    onUpdate: () => {
      revalidateDirectory()
      revalidateVisibleHistoryFirstPage()
    },
  })

  const updateScope = useCallback((clientId: string, projectId: string) => {
    if (isOrganization && !clientId) return
    if (clientId && !scopeOptions.clients.some((option) => option.id === clientId)) return
    if (projectId && !scopeOptions.projects.some((project) => project.id === projectId && project.client_id === clientId)) return
    const nextParams = new URLSearchParams(searchParams.toString())
    if (clientId) nextParams.set('client_id', clientId)
    else nextParams.delete('client_id')
    if (projectId) nextParams.set('project_id', projectId)
    else nextParams.delete('project_id')
    nextParams.delete('agent')
    const query = nextParams.toString()
    router.replace(`${pathname}${query ? `?${query}` : ''}${window.location.hash}`, { scroll: false })
    setHistoryRequest({ agentKey: null, filters: { ...EMPTY_HISTORY_FILTERS, client_id: clientId, project_id: projectId } })
    void setHistorySize(1)
  }, [isOrganization, pathname, router, searchParams, scopeOptions.clients, scopeOptions.projects, setHistorySize])

  useEffect(() => {
    if (hasInvalidScope) updateScope('', '')
  }, [hasInvalidScope, updateScope])

  useEffect(() => {
    setHistoryRequest({ agentKey: null, filters: { ...EMPTY_HISTORY_FILTERS, client_id: selectedClientId, project_id: selectedProjectId } })
    void setHistorySize(1)
  }, [selectedClientId, selectedProjectId, setHistorySize])

  useEffect(() => {
    if (!data) return
    if (invalidAgentParam) {
      updateAgentUrl(null, 'replace')
      return
    }
    if (historyRequest.agentKey !== selectedAgentKey) {
      setHistoryRequest({
        agentKey: selectedAgentKey,
        filters: { ...EMPTY_HISTORY_FILTERS, client_id: selectedClientId, project_id: selectedProjectId },
      })
      void setHistorySize(1)
    }
  }, [data, historyRequest.agentKey, invalidAgentParam, selectedAgentKey, selectedClientId, selectedProjectId, setHistorySize, updateAgentUrl])

  const historyPages = history.data ?? []
  const latestHistoryPage = historyPages.at(-1)
  const historyView = {
    pages: historyPages,
    error: history.error as Error | undefined,
    isLoading: Boolean(historyRequest.agentKey && history.isLoading),
    isLoadingMore: Boolean(history.isValidating && historyPages.length > 0),
    hasMore: Boolean(latestHistoryPage?.has_more && latestHistoryPage.next_cursor),
  }

  const updateHistoryRequest = (agentKey: string | null, filters: AutomationAgentHistoryQueryFilters) => {
    setHistoryRequest({
      agentKey,
      filters: {
        ...filters,
        client_id: selectedClientId || filters.client_id,
        project_id: selectedProjectId || filters.project_id,
      },
    })
    void history.setSize(1)
  }
  const updateHistoryFilters = (filters: AutomationAgentHistoryQueryFilters) => {
    setHistoryRequest((current) => ({
      ...current,
      filters: {
        ...filters,
        client_id: selectedClientId || filters.client_id,
        project_id: selectedProjectId || filters.project_id,
      },
    }))
    void history.setSize(1)
  }
  const openAgent = (agentKey: string) => {
    if (!data?.agents.some((agent) => agent.agent_key === agentKey)) return
    updateAgentUrl(agentKey, 'push')
  }
  const closeAgent = () => updateAgentUrl(null, 'replace')

  if (directoryPath === null) {
    return (
      <AgentDirectoryScopeGate
        clientId={selectedClientId}
        projectId={selectedProjectId}
        clients={scopeOptions.clients}
        projects={scopeOptions.projects}
        isLoading={visibleProjects.isLoading}
        error={visibleProjects.error as Error | undefined}
        onChange={updateScope}
        onRetry={() => void visibleProjects.mutate()}
      />
    )
  }

  if (!data) {
    return <AgentDirectoryLoadState error={error} isLoading={isLoading} isRefreshing={isValidating} onRefresh={() => void mutate()} />
  }

  const profileHref = (agentKey: string) => {
    const query = new URLSearchParams()
    if (selectedClientId) query.set('client_id', selectedClientId)
    if (selectedProjectId) query.set('project_id', selectedProjectId)
    const suffix = query.toString()
    return `/automation/agents/${encodeURIComponent(agentKey)}${suffix ? `?${suffix}` : ''}`
  }

  return (
    <>
      <AgentDirectoryScreen
        snapshot={data}
        scopeClientId={selectedClientId}
        scopeProjectId={selectedProjectId}
        clients={scopeOptions.clients}
        projects={scopeOptions.projects}
        allowAllClients={workspaceMode === 'platform'}
        onScopeChange={updateScope}
        initialAgentKey={selectedAgentKey}
        isRefreshing={isValidating}
        onRefresh={() => void mutate()}
        history={historyView}
        onAgentOpen={openAgent}
        onAgentClose={closeAgent}
        onHistoryRequestChange={updateHistoryRequest}
        onHistoryFiltersChange={updateHistoryFilters}
        onLoadMoreHistory={() => void history.setSize(history.size + 1)}
        onRetryHistory={() => void history.mutate()}
      />
      {data.agents.length > 0 ? (
        <nav
          aria-label="Páginas individuales de agentes"
          className="mx-auto -mt-4 max-w-[92rem] px-4 pb-8 sm:px-6"
        >
          <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink">Páginas individuales de perfil</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Abre una vista persistente con instancias, trabajo actual e historial filtrable del agente.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.agents.map((agent) => (
                <li key={agent.agent_key}>
                  <Link
                    href={profileHref(agent.agent_key)}
                    className="inline-flex min-h-10 items-center rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-medium text-ink-secondary transition hover:border-(--tenant-accent)/35 hover:text-(--tenant-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                  >
                    {agent.name || 'Agente'} · {agent.specialty || 'Especialidad no reportada'}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      ) : null}
    </>
  )
}
