'use client'

import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import type { EventConfig } from '@/models/EventConfig'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { mutate as globalMutate } from 'swr'

import {
  ArrowPathIcon,
  CheckIcon,
  ChevronLeftIcon,
  EyeIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PaintBrushIcon,
} from '@heroicons/react/20/solid'

import { Link } from '@/components/link'
import { preloadStudioPanel } from '@/components/studio/preload-studio-panel'
import type { DeviceMode, PanelId } from '@/components/studio/studio-constants'
import { StudioPanelSkeleton } from '@/components/studio/studio-panel-skeleton'
import { StudioPanelTabs } from '@/components/studio/studio-panel-tabs'
import { useStudioSections } from '@/components/studio/use-studio-sections'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePreviewToken } from '@/hooks/usePreviewToken'
import { useEventCapabilities } from '@/features/events/use-event-capabilities'
import { useStudioWorkspace } from '@/features/events/studio/use-studio-workspace'
import { readApiData } from '@/lib/api-envelope'
import { eventConfigPath } from '@/lib/api-paths'
import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  patchEventConfigIntoEventCacheValue,
} from '@/lib/event-config-cache'
import { getEventPreviewUrl, getEventPublicUrl } from '@/lib/public-urls'
import { getDataErrorState } from '@/lib/swr-data-state'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'

const DraggableSectionList = dynamic(
  () => import('@/components/studio/draggable-section-list').then((module) => module.DraggableSectionList),
  {
    ssr: false,
    loading: () => <StudioPanelSkeleton panel="sections" />,
  }
)

const QuickConfigPanel = dynamic(
  () => import('@/components/studio/quick-config-panel').then((module) => module.QuickConfigPanel),
  {
    ssr: false,
    loading: () => <StudioPanelSkeleton panel="config" />,
  }
)

const EventDesignPicker = dynamic(
  () => import('@/components/events/event-design-picker').then((module) => module.EventDesignPicker),
  {
    ssr: false,
    loading: () => <StudioPanelSkeleton panel="design" />,
  }
)

const loadStudioPreview = () => import('@/components/studio/studio-preview')

const StudioPreview = dynamic(() => loadStudioPreview().then((module) => module.StudioPreview), {
  ssr: false,
  loading: () => (
    <div
      aria-label="Cargando vista previa"
      className="flex min-w-0 flex-1 items-center justify-center bg-surface"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
})

function StudioPreviewPending({ showPreview }: { showPreview: boolean }) {
  return (
    <div
      role="status"
      aria-label="Preparando vista previa"
      className={`${showPreview ? 'flex' : 'hidden'} min-w-0 flex-1 items-center justify-center border-l border-white/10 bg-surface lg:flex`}
    >
      <div className="space-y-3 text-center">
        <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" />
        <p className="text-xs font-medium text-ink-muted">Preparando editor antes del preview…</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [activePanel, setActivePanel] = useState<PanelId>('sections')
  const [iframeKey, setIframeKey] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const desktopPreviewVisible = useMediaQuery('(min-width: 1024px)')
  const previewVisible = desktopPreviewVisible || showPreview
  const {
    data: capabilities,
    error: capabilitiesError,
    isLoading: capabilitiesLoading,
  } = useEventCapabilities(id)
  const canManageEvent = capabilities?.['event:manage'] === true

  const {
    data: workspace,
    error: workspaceError,
    isLoading: workspaceBootstrapLoading,
    isValidating: workspaceBootstrapValidating,
    mutate: mutateWorkspace,
  } = useStudioWorkspace(id, canManageEvent)

  const handlePanelIntent = useCallback((panel: PanelId) => {
    void preloadStudioPanel(panel).catch(() => undefined)
  }, [])

  const handlePreviewIntent = useCallback(() => {
    void loadStudioPreview().catch(() => undefined)
  }, [])

  // ── Event + Config data ────────────────────────────────────────────────────

  const event = workspace?.event
  const config = workspace?.config

  const previewCoreReady = Boolean(event && config)
  const previewRequested = previewVisible && previewCoreReady

  // ── Preview URL + refresh ──────────────────────────────────────────────────

  const publicUrl = event ? getEventPublicUrl(event.identifier) : ''
  const {
    token: previewToken,
    error: previewError,
    ensureToken: ensurePreviewToken,
  } = usePreviewToken(id, { autoLoad: previewRequested, autoRefresh: previewRequested })
  const previewUrl =
    previewRequested && event && previewToken
      ? getEventPreviewUrl(event.identifier, {
          cacheKey: iframeKey,
          previewToken,
        })
      : ''

  const bumpIframeKey = useCallback(() => {
    setIframeKey((k) => k + 1)
  }, [])

  const refreshPreview = useCallback(() => {
    if (!previewVisible) return
    void ensurePreviewToken()
      .then(() => bumpIframeKey())
      .catch((err) => {
        toast.error(getApiErrorMessage(err, 'No se pudo generar el preview'))
      })
  }, [bumpIframeKey, ensurePreviewToken, previewVisible])

  // ── Sections hook (drag-and-drop, optimistic mutations) ────────────────────

  const {
    sections,
    isLoading: sectionsLoading,
    isValidating: sectionsValidating,
    errorState: sectionsErrorState,
    retry: retrySections,
    handleReorder,
    handleToggleVisible,
    handleSaveConfig,
    refreshPreview: refreshPreviewDebounced,
    refreshPreviewNow,
  } = useStudioSections(workspace ? id : undefined, refreshPreview, workspace?.sections)

  const handleConfigSaved = useCallback((updated?: EventConfig) => {
    if (updated) {
      void mutateWorkspace(
        (current) => (current ? { ...current, config: { ...current.config, ...updated } } : current),
        { revalidate: false }
      )
    }
    refreshPreviewNow()
  }, [mutateWorkspace, refreshPreviewNow])

  // ── Publish ────────────────────────────────────────────────────────────────

  const isPublic = config?.is_public ?? false
  const workspaceLoading = workspaceBootstrapLoading || sectionsLoading
  const workspaceBootstrapErrorState = getDataErrorState(workspaceError, workspace)
  const workspaceFatalError = workspaceBootstrapErrorState === 'fatal' || sectionsErrorState === 'fatal'
  const workspaceStaleError =
    !workspaceFatalError &&
    (workspaceBootstrapErrorState === 'stale' || sectionsErrorState === 'stale')
  const workspaceRetrying = workspaceBootstrapValidating || sectionsValidating

  useEffect(() => {
    if (!published) return
    const timer = window.setTimeout(() => setPublished(false), 4000)
    return () => window.clearTimeout(timer)
  }, [published])

  const retryWorkspace = useCallback(() => {
    void Promise.all([mutateWorkspace(), retrySections()])
  }, [mutateWorkspace, retrySections])

  const handlePublish = async () => {
    if (!event || !config || workspaceFatalError) return
    const snapshot = workspace
    const optimisticConfig: EventConfig = { ...config, is_public: true }
    setPublishing(true)
    await mutateWorkspace(
      (current) => (current ? { ...current, config: optimisticConfig } : current),
      { revalidate: false }
    )
    await globalMutate(eventConfigPath(event.id), optimisticConfig, { revalidate: false })
    await globalMutate(
      (key) => isEventConfigBackedEventCacheKey(key, event.id),
      (current: unknown) => patchEventConfigIntoEventCacheValue(current, event.id, optimisticConfig),
      { revalidate: false }
    )
    refreshPreviewNow()
    try {
      const res = await api.put<EventConfig>(eventConfigPath(event.id), { is_public: true })
      const updated = readApiData<EventConfig | null>(res.data)
      if (hasEventConfigCacheIdentity(updated)) {
        await globalMutate(eventConfigPath(event.id), updated, { revalidate: false })
        await mutateWorkspace(
          (current) => (current ? { ...current, config: { ...current.config, ...updated } } : current),
          { revalidate: false }
        )
        await globalMutate(
          (key) => isEventConfigBackedEventCacheKey(key, event.id),
          (current: unknown) => patchEventConfigIntoEventCacheValue(current, event.id, updated),
          { revalidate: false }
        )
      } else {
        await mutateWorkspace()
        await globalMutate((key) => isEventConfigBackedEventCacheKey(key, event.id))
      }
      setPublished(true)
      toast.success('¡Evento publicado! Ya esta visible al publico.')
    } catch (err) {
      await mutateWorkspace(snapshot, { revalidate: false })
      await globalMutate(eventConfigPath(event.id), config, { revalidate: false })
      await globalMutate(
        (key) => isEventConfigBackedEventCacheKey(key, event.id),
        (current: unknown) => patchEventConfigIntoEventCacheValue(current, event.id, config),
        { revalidate: false }
      )
      refreshPreviewNow()
      toast.error(getApiErrorMessage(err, 'Error al publicar el evento'))
    } finally {
      setPublishing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (capabilitiesLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" />
          <p className="mt-4 text-sm text-ink-muted">Validando acceso a Studio…</p>
        </div>
      </div>
    )
  }

  if (capabilitiesError || !canManageEvent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas px-6">
        <div className="premium-surface max-w-md rounded-3xl p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] text-amber-300">
            <LockClosedIcon className="size-5" />
          </span>
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-white">Studio no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Tu rol puede consultar este evento, pero no modificar su contenido, diseño o publicación.
          </p>
          <Link
            href={`/events/${id}`}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Volver al evento
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas lg:flex-row">
      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div
        className={[
          'flex w-full shrink-0 flex-col border-b border-white/10 bg-canvas lg:w-72 lg:border-r lg:border-b-0',
          showPreview ? 'hidden lg:flex' : 'flex',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Link
            href={`/events/${id}`}
            className="flex shrink-0 items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink-secondary"
          >
            <ChevronLeftIcon className="size-3.5" />
            Volver
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{event?.name ?? '...'}</p>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            onFocus={handlePreviewIntent}
            onPointerDown={handlePreviewIntent}
            onPointerEnter={handlePreviewIntent}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
          >
            <EyeIcon className="size-3.5" />
            <span className="sr-only">Ver preview</span>
          </button>
        </div>

        {/* Panel tabs */}
        <StudioPanelTabs activePanel={activePanel} onPanelChange={setActivePanel} onPanelIntent={handlePanelIntent} />

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-3">
          <>
            {/* Sections panel — Drag & Drop */}
            {activePanel === 'sections' && (
              <div
                key="sections"
                id="studio-panel-sections"
                role="tabpanel"
                aria-labelledby="studio-tab-sections"
                tabIndex={0}
              >
                <DraggableSectionList
                  sections={sections}
                  isLoading={sectionsLoading}
                  onReorder={handleReorder}
                  onToggleVisible={handleToggleVisible}
                  onSaveConfig={handleSaveConfig}
                  onResourcesChanged={refreshPreviewDebounced}
                />
              </div>
            )}

            {/* Config panel */}
            {activePanel === 'config' && (
              <div
                key="config"
                id="studio-panel-config"
                role="tabpanel"
                aria-labelledby="studio-tab-config"
                tabIndex={0}
              >
                <p className="mb-3 px-1 text-[10px] text-ink-muted">Cambios se aplican en la vista previa al guardar.</p>
                <QuickConfigPanel config={config} eventId={event?.id ?? ''} onSaved={handleConfigSaved} />
              </div>
            )}

            {/* Design panel */}
            {activePanel === 'design' && (
              <div
                key="design"
                id="studio-panel-design"
                role="tabpanel"
                aria-labelledby="studio-tab-design"
                tabIndex={0}
                className="space-y-4"
              >
                <p className="px-1 text-[10px] text-ink-muted">
                  Guarda el diseno para refrescar la vista previa publica.
                </p>
                {event?.id && (
                  <EventDesignPicker
                    eventId={event.id}
                    compact
                    initialConfig={config}
                    onSaved={handleConfigSaved}
                  />
                )}
                <Link
                  href={`/events/${id}?tab=configuracion`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-surface px-3 py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
                >
                  <PaintBrushIcon className="size-4" />
                  Abrir editor de diseno completo
                </Link>
              </div>
            )}
          </>
        </div>

        {/* Publish footer */}
        <div className="space-y-2 border-t border-white/10 p-3">
          {workspaceFatalError && (
            <div role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-300">
              <p>No pudimos cargar todo el espacio de trabajo.</p>
              <button
                type="button"
                onClick={retryWorkspace}
                disabled={workspaceRetrying}
                aria-busy={workspaceRetrying}
                className="mt-1.5 font-semibold text-amber-200 underline decoration-amber-400/40 underline-offset-2 hover:text-white disabled:cursor-wait disabled:opacity-60"
              >
                {workspaceRetrying ? 'Reintentando…' : 'Reintentar carga'}
              </button>
            </div>
          )}

          {workspaceStaleError && (
            <StaleDataNotice
              label="datos de Studio"
              onRetry={retryWorkspace}
              retrying={workspaceRetrying}
            />
          )}

          {isPublic && event && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl)
                  toast.success('URL copiada')
                } catch {
                  toast.error('No se pudo copiar la URL')
                }
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2 text-xs text-lime-400 transition-colors hover:bg-lime-500/10"
            >
              <GlobeAltIcon className="size-3.5 shrink-0" />
              <span className="flex-1 truncate text-left font-mono text-[10px]">{publicUrl}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePublish}
            disabled={workspaceLoading || workspaceFatalError || publishing || isPublic}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all',
              workspaceLoading || workspaceFatalError
                ? 'cursor-wait border border-white/10 bg-surface text-ink-muted'
                : isPublic
                ? 'cursor-default border border-lime-500/30 bg-lime-500/20 text-lime-400'
                : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 active:bg-indigo-700',
            ].join(' ')}
          >
            {workspaceLoading ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" /> Preparando Studio...
              </>
            ) : publishing ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" /> Publicando...
              </>
            ) : isPublic ? (
              <>
                <CheckIcon className="size-4" /> Publicado
              </>
            ) : (
              <>
                <GlobeAltIcon className="size-4" /> Publicar evento
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Preview Area ──────────────────────────────────────────────────── */}
      {previewVisible && !previewCoreReady && <StudioPreviewPending showPreview={showPreview} />}
      {previewRequested && (
        <StudioPreview
          previewUrl={previewUrl}
          device={device}
          setDevice={setDevice}
          refreshPreview={refreshPreview}
          iframeKey={iframeKey}
          eventName={event?.name}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          publicUrl={publicUrl}
          previewError={previewError}
        />
      )}

      {/* Published confirmation overlay */}
      {published && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-lime-500/30 bg-lime-500/10 px-5 py-3 shadow-2xl backdrop-blur-md">
          <CheckIcon className="size-5 text-lime-400" />
          <div>
            <p className="text-sm font-semibold text-lime-300">¡Evento publicado!</p>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-lime-500 transition-colors hover:text-lime-400"
            >
              {publicUrl}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
