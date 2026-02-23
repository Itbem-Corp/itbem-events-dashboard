'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { fetcher } from '@/lib/fetcher'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'
import type { EventConfig } from '@/models/EventConfig'

import {
  ChevronLeftIcon,
  EyeIcon,
  ArrowPathIcon,
  CheckIcon,
  GlobeAltIcon,
  Cog6ToothIcon,
  PaintBrushIcon,
  ListBulletIcon,
} from '@heroicons/react/20/solid'

import type { PanelId, DeviceMode } from '@/components/studio/studio-constants'
import { useStudioSections } from '@/components/studio/use-studio-sections'
import { DraggableSectionList } from '@/components/studio/draggable-section-list'
import { QuickConfigPanel } from '@/components/studio/quick-config-panel'
import { StudioPreview } from '@/components/studio/studio-preview'

const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [activePanel, setActivePanel] = useState<PanelId>('sections')
  const [iframeKey, setIframeKey] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // ── Event + Config data ────────────────────────────────────────────────────

  const { data: rawEvent } = useSWR<Event | Event[]>(
    id ? `/events/${id}` : null,
    fetcher,
  )
  const event = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent

  const { data: config, mutate: mutateConfig } = useSWR<EventConfig>(
    event?.id ? `/events/${event.id}/config` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // ── Preview URL + refresh ──────────────────────────────────────────────────

  const previewUrl = event
    ? `${PUBLIC_FRONTEND_URL}/e/${event.identifier}?preview=1&t=${iframeKey}`
    : ''

  const bumpIframeKey = useCallback(() => {
    setIframeKey((k) => k + 1)
  }, [])

  // ── Sections hook (drag-and-drop, optimistic mutations) ────────────────────

  const {
    sections,
    isLoading: sectionsLoading,
    handleReorder,
    handleToggleVisible,
    handleSaveConfig,
    refreshPreviewNow,
  } = useStudioSections(event?.id, bumpIframeKey)

  // ── Publish ────────────────────────────────────────────────────────────────

  const isPublic = config?.is_public ?? false

  const handlePublish = async () => {
    if (!event || !config) return
    setPublishing(true)
    try {
      await api.put(`/events/${event.id}/config`, { ...config, is_public: true })
      await mutateConfig()
      setPublished(true)
      toast.success('¡Evento publicado! Ya esta visible al publico.')
      setTimeout(() => setPublished(false), 4000)
    } catch {
      toast.error('Error al publicar el evento')
    } finally {
      setPublishing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row overflow-hidden bg-zinc-950">

      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div
        className={[
          'flex flex-col w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-950',
          showPreview ? 'hidden lg:flex' : 'flex',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <a
            href={`/events/${id}`}
            className="shrink-0 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeftIcon className="size-3.5" />
            Volver
          </a>
          <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-200 truncate">
            {event?.name ?? '...'}
          </p>
          <button
            onClick={() => setShowPreview(true)}
            className="lg:hidden shrink-0 flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <EyeIcon className="size-3.5" />
            <span className="sr-only">Ver preview</span>
          </button>
        </div>

        {/* Panel tabs */}
        <div className="flex overflow-x-auto border-b border-white/10 scrollbar-none">
          {([
            { id: 'sections' as PanelId, icon: ListBulletIcon, label: 'Secciones' },
            { id: 'config' as PanelId, icon: Cog6ToothIcon, label: 'Ajustes' },
            { id: 'design' as PanelId, icon: PaintBrushIcon, label: 'Diseno' },
          ]).map(({ id: tabId, icon: Icon, label }) => (
            <button
              key={tabId}
              onClick={() => setActivePanel(tabId)}
              className={[
                'flex shrink-0 flex-1 flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
                activePanel === tabId
                  ? 'text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-zinc-600 hover:text-zinc-400',
              ].join(' ')}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-3">
          <AnimatePresence mode="wait">

            {/* Sections panel — Drag & Drop */}
            {activePanel === 'sections' && (
              <motion.div
                key="sections"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
              >
                <DraggableSectionList
                  sections={sections}
                  isLoading={sectionsLoading}
                  onReorder={handleReorder}
                  onToggleVisible={handleToggleVisible}
                  onSaveConfig={handleSaveConfig}
                />
              </motion.div>
            )}

            {/* Config panel */}
            {activePanel === 'config' && (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
              >
                <p className="text-[10px] text-zinc-600 px-1 mb-3">
                  Cambios se aplican en la vista previa al guardar.
                </p>
                <QuickConfigPanel
                  config={config}
                  eventId={event?.id ?? ''}
                  onSaved={refreshPreviewNow}
                />
              </motion.div>
            )}

            {/* Design panel */}
            {activePanel === 'design' && (
              <motion.div
                key="design"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <p className="text-[10px] text-zinc-600 px-1">
                  Selecciona plantilla, paleta y tipografia.
                </p>
                <a
                  href={`/events/${id}?tab=configuracion`}
                  className="flex items-center justify-center gap-2 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <PaintBrushIcon className="size-4" />
                  Abrir editor de diseno completo
                </a>

                {config?.design_template ? (
                  <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 space-y-1">
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Plantilla activa</p>
                    <p className="text-xs font-semibold text-zinc-200">{config.design_template.name}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{config.design_template.identifier}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-4 text-center">
                    <p className="text-xs text-zinc-600">Sin plantilla seleccionada</p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Publish footer */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {isPublic && event && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(`${PUBLIC_FRONTEND_URL}/e/${event.identifier}`)
                toast.success('URL copiada')
              }}
              className="w-full flex items-center gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2 text-xs text-lime-400 hover:bg-lime-500/10 transition-colors"
            >
              <GlobeAltIcon className="size-3.5 shrink-0" />
              <span className="truncate flex-1 text-left font-mono text-[10px]">
                {PUBLIC_FRONTEND_URL}/e/{event.identifier}
              </span>
            </button>
          )}

          <button
            onClick={handlePublish}
            disabled={publishing || isPublic}
            className={[
              'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all',
              isPublic
                ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30 cursor-default'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 shadow-lg shadow-indigo-500/20',
            ].join(' ')}
          >
            {publishing ? (
              <><ArrowPathIcon className="size-4 animate-spin" /> Publicando...</>
            ) : isPublic ? (
              <><CheckIcon className="size-4" /> Publicado</>
            ) : (
              <><GlobeAltIcon className="size-4" /> Publicar evento</>
            )}
          </button>
        </div>
      </div>

      {/* ── Preview Area ──────────────────────────────────────────────────── */}
      <StudioPreview
        previewUrl={previewUrl}
        device={device}
        setDevice={setDevice}
        refreshPreview={bumpIframeKey}
        iframeKey={iframeKey}
        eventName={event?.name}
        eventIdentifier={event?.identifier}
        showPreview={showPreview}
        setShowPreview={setShowPreview}
        publicFrontendUrl={PUBLIC_FRONTEND_URL}
      />

      {/* Published confirmation overlay */}
      <AnimatePresence>
        {published && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-lime-500/30 bg-lime-500/10 px-5 py-3 shadow-2xl backdrop-blur-md z-50"
          >
            <CheckIcon className="size-5 text-lime-400" />
            <div>
              <p className="text-sm font-semibold text-lime-300">¡Evento publicado!</p>
              <a
                href={`${PUBLIC_FRONTEND_URL}/e/${event?.identifier}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-lime-500 hover:text-lime-400 transition-colors"
              >
                {PUBLIC_FRONTEND_URL}/e/{event?.identifier}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
