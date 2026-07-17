'use client'

import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR, { mutate as globalMutate } from 'swr'
import useSWRInfinite from 'swr/infinite'

import { BottomSheet, SheetRow } from '@/components/ui/bottom-sheet'
import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { EmptyState } from '@/components/ui/empty-state'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useLazyVisible } from '@/hooks/useLazyVisible'
import { usePageActivity } from '@/hooks/usePageActivity'
import { usePreviewToken } from '@/hooks/usePreviewToken'
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  eventConfigPath,
  momentActivityPath,
  momentPath,
  momentRequeuePath,
  momentsBatchReoptimizePath,
  momentsBulkApprovePath,
  momentsBulkDeletePath,
  momentsPagePath,
  momentsReorderPath,
} from '@/lib/api-paths'
import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  patchEventConfigIntoEventCacheValue,
  replaceEventConfigCacheValue,
} from '@/lib/event-config-cache'
import { getEventConfigMomentWallState } from '@/lib/event-config-moment-wall'
import { normalizeEventConfigPatch } from '@/lib/event-config-patch'
import { fetcher } from '@/lib/fetcher'
import { mapSettledWithConcurrency } from '@/lib/map-settled-with-concurrency'
import { isBackendVideoMedia, isRawMomentMediaPath, resolveBackendMediaUrl } from '@/lib/media-url'
import {
  getMomentsRefreshDelay,
  momentsMediaRefreshKey,
  patchMomentsCacheValue,
  removeMomentsCacheValue,
  upsertMomentCacheValue,
} from '@/lib/moment-cache'
import {
  getEventMomentsPreviewUrl,
  getEventMomentsUrl,
  getEventTvPreviewUrl,
  getEventUploadPreviewUrl,
  getEventUploadUrl,
} from '@/lib/public-urls'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { EventConfig, EventConfigPatch } from '@/models/EventConfig'
import type { Moment, MomentBatchResult } from '@/models/Moment'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  ChatBubbleOvalLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  ComputerDesktopIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  GlobeAltIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PhotoIcon,
  QrCodeIcon,
  ShareIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { toast } from 'sonner'

const REFRESH_INTERVAL = 15_000
const VISIBLE_PAGE = 40
const MOMENTS_PAGE_SIZE = 40
const STATUS_SECTION_PAGE = 24

const OVERSIZED_PHOTO_BYTES = 100_000 // 100 KB
const OVERSIZED_VIDEO_BYTES = 5_000_000 // 5 MB
const BACKEND_MEDIA_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL

const BrandedQR = dynamic(() => import('@/components/ui/branded-qr').then((module) => module.BrandedQR), {
  ssr: false,
  loading: () => <div className="h-72 w-full max-w-[280px] animate-pulse rounded-2xl bg-surface-raised/70" />,
})
const MomentDragGrid = dynamic(
  () => import('@/components/events/moment-drag-grid').then((module) => module.MomentDragGrid),
  { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-surface-raised/40" /> }
)

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1_000)} KB`
}

function formatDurationMs(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`
  const seconds = durationMs / 1000
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`
}

function isOversized(m: Moment): boolean {
  // Legacy moments (never processed) have their own button — exclude them here
  if (!m.processing_status || m.processing_status !== 'done') return false
  // No size data (processed before metrics) — include so Lambda can record the real size
  if (!m.optimized_size_bytes || m.optimized_size_bytes === 0) return true
  return isBackendVideoMedia(m.content_view_url || m.content_url, m.content_type)
    ? m.optimized_size_bytes > OVERSIZED_VIDEO_BYTES
    : m.optimized_size_bytes > OVERSIZED_PHOTO_BYTES
}

function resolveMomentMediaUrl(mediaPath: string | null | undefined): string {
  return resolveBackendMediaUrl(mediaPath, BACKEND_MEDIA_BASE_URL)
}

function resolveMomentContentUrl(moment: Moment): string {
  return resolveMomentMediaUrl(moment.content_view_url || moment.content_url)
}

function resolveMomentThumbnailUrl(moment: Moment): string {
  return resolveMomentMediaUrl(moment.thumbnail_view_url || moment.thumbnail_url)
}

// ─── Focus trap ──────────────────────────────────────────────────────────────

function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return
    const container = containerRef.current
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const previouslyFocused = document.activeElement as HTMLElement | null
    first?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [active, containerRef])
}

// ─── helpers ────────────────────────────────────────────────────────────────

function processingLabel(status: Moment['processing_status']): string {
  switch (status) {
    case 'pending':
      return 'En cola'
    case 'processing':
      return 'Procesando…'
    case 'failed':
      return 'Error al procesar'
    default:
      return ''
  }
}

/** Groups moments into 30-minute buckets, returns sorted array of { label, items } */
function groupByTimeBuckets(moments: Moment[]): Array<{ label: string; items: Moment[] }> {
  const map = new Map<string, Moment[]>()
  for (const m of moments) {
    const d = new Date(m.created_at)
    const h = d.getHours()
    const min = d.getMinutes() < 30 ? '00' : '30'
    const label = `${String(h).padStart(2, '0')}:${min}`
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(m)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, items }))
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

interface LightboxProps {
  moments: Moment[]
  index: number
  canManage?: boolean
  onClose: () => void
  onNext: () => void
  onPrev: () => void
  resolveUrl: (m: Moment) => string
  onApprove: (m: Moment) => Promise<void>
  onUnapprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
}

function Lightbox({
  moments,
  index,
  canManage = true,
  onClose,
  onNext,
  onPrev,
  resolveUrl,
  onApprove,
  onUnapprove,
  onDelete,
}: LightboxProps) {
  const [scale, setScale] = useState(1)
  const [actioning, setActioning] = useState<'approve' | 'unapprove' | 'delete' | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)
  const moment = moments[index]
  const url = resolveUrl(moment)
  const video = isBackendVideoMedia(url, moment.content_type)

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') {
        setScale(1)
        onNext()
      }
      if (e.key === 'ArrowLeft') {
        setScale(1)
        onPrev()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onNext, onPrev])

  // Touch swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    setScale(1)
    if (dx < 0) onNext()
    else onPrev()
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const key = moment.content_url || moment.content_view_url || url
      const extMatch = key.match(/\.(\w{2,5})(?:\?|$)/)
      const ext = extMatch?.[1] ?? 'jpg'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `momento-${moment.id}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return createPortal(
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de momentos"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Controls bar */}
      <div
        className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2 sm:px-4 sm:py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-xs text-white/70 sm:text-sm">
          {index + 1} / {moments.length}
          {moment.description && (
            <span className="ml-3 line-clamp-1 hidden max-w-xs text-white/50 italic sm:inline sm:max-w-sm">
              &ldquo;{moment.description}&rdquo;
            </span>
          )}
        </span>
        {/* Desktop-only controls */}
        <div className="hidden shrink-0 items-center gap-1 sm:gap-2 md:flex">
          {!video && (
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                title="Alejar"
              >
                <MagnifyingGlassMinusIcon className="size-5" />
              </button>
              <button
                onClick={() => setScale((s) => Math.min(4, s + 0.25))}
                className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                title="Acercar"
              >
                <MagnifyingGlassPlusIcon className="size-5" />
              </button>
            </div>
          )}

          {canManage && (
            <>
              {/* Approve / Unapprove */}
              {!moment.is_approved && moment.processing_status !== 'failed' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    setActioning('approve')
                    await onApprove(moment)
                    setActioning(null)
                  }}
                  disabled={actioning !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-lime-500/20 px-3 py-1.5 text-xs font-semibold text-lime-300 transition-colors hover:bg-lime-500/30 disabled:opacity-40"
                  title="Aprobar momento"
                >
                  <CheckIcon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{actioning === 'approve' ? '…' : 'Aprobar'}</span>
                </button>
              )}
              {moment.is_approved && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    setActioning('unapprove')
                    await onUnapprove(moment)
                    setActioning(null)
                  }}
                  disabled={actioning !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-40"
                  title="Desaprobar momento"
                >
                  <ArrowUturnLeftIcon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{actioning === 'unapprove' ? '…' : 'Desaprobar'}</span>
                </button>
              )}

              {/* Delete */}
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  setActioning('delete')
                  await onDelete(moment)
                  setActioning(null)
                }}
                disabled={actioning !== null}
                className="rounded-lg bg-rose-500/20 p-2 text-rose-300 transition-colors hover:bg-rose-500/30 disabled:opacity-40"
                title="Eliminar momento"
              >
                <TrashIcon className="size-5" />
              </button>
            </>
          )}

          <button
            onClick={handleDownload}
            className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            title="Descargar"
          >
            <ArrowDownTrayIcon className="size-5" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            title="Cerrar (Esc)"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        {/* Mobile-only close button */}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/10 p-3 text-white transition-colors hover:bg-white/20 md:hidden"
          aria-label="Cerrar"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Prev — hidden on mobile, use swipe instead */}
      {moments.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale(1)
            onPrev()
          }}
          className="absolute top-1/2 left-3 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 sm:block"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
      )}

      {/* Media */}
      <motion.div
        key={moment.id}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="max-h-[85vh] max-w-[85vw] overflow-auto"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center', transition: 'transform 0.2s' }}
        onClick={(e) => e.stopPropagation()}
      >
        {video ? (
          <video src={url} controls autoPlay className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl" />
        ) : (
          <img
            src={url}
            alt="Momento del evento"
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
          />
        )}
      </motion.div>

      {/* Note / description from guest */}
      {moment.description && (
        <div className="pointer-events-none absolute right-4 bottom-16 left-4 z-20">
          <div className="flex items-start gap-2 rounded-xl bg-black/70 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-md">
            <ChatBubbleOvalLeftIcon className="mt-0.5 size-4 shrink-0 text-white/50" />
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-white/80">
              {moment.description}
            </p>
          </div>
        </div>
      )}

      {/* Mobile bottom action bar — md:hidden */}
      <div
        className="absolute right-0 bottom-0 left-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 md:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {canManage && !moment.is_approved && moment.processing_status !== 'failed' && (
          <button
            type="button"
            onClick={async () => {
              setActioning('approve')
              await onApprove(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-lime-500/20 text-sm font-semibold text-lime-300 transition-colors hover:bg-lime-500/30 disabled:opacity-40"
          >
            <CheckIcon className="h-4 w-4" />
            {actioning === 'approve' ? '…' : 'Aprobar'}
          </button>
        )}
        {canManage && moment.is_approved && (
          <button
            type="button"
            onClick={async () => {
              setActioning('unapprove')
              await onUnapprove(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500/20 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-40"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            {actioning === 'unapprove' ? '…' : 'Quitar'}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={async () => {
              setActioning('delete')
              await onDelete(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 transition-colors hover:bg-rose-500/30 disabled:opacity-40"
            aria-label="Eliminar"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Descargar"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Next — hidden on mobile, use swipe instead */}
      {moments.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale(1)
            onNext()
          }}
          className="absolute top-1/2 right-3 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 sm:block"
        >
          <ArrowRightIcon className="size-5" />
        </button>
      )}
    </motion.div>,
    document.body
  )
}

// ─── QR Modal ────────────────────────────────────────────────────────────────

function QRModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="qr-modal-title" className="sr-only">
          Compartir acceso al muro de momentos
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-secondary"
        >
          <XMarkIcon className="size-4" />
        </button>

        <BrandedQR
          value={url}
          title="Muro de Momentos"
          subtitle="Escanea para subir fotos y videos"
          downloadName="qr-subida-momentos"
          size={180}
          dark
        />

        <div className="w-full space-y-2 pt-1">
          <p className="px-2 text-center text-xs break-all text-ink-muted">{url}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-soft py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <ClipboardDocumentIcon className="size-4" />
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ─── Wall Share Modal ─────────────────────────────────────────────────────────

function WallShareModal({ wallUrl, uploadUrl, onClose }: { wallUrl: string; uploadUrl?: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'wall' | 'upload'>('wall')
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const canShareUpload = Boolean(uploadUrl)
  const activeShareTarget = canShareUpload && activeTab === 'upload' ? 'upload' : 'wall'
  const activeUrl = activeShareTarget === 'upload' && uploadUrl ? uploadUrl : wallUrl

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl)
      setCopied(true)
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wall-share-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wall-share-title" className="sr-only">
          Compartir muro de momentos
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-secondary"
        >
          <XMarkIcon className="size-4" />
        </button>

        {canShareUpload && (
          <div className="flex w-full overflow-hidden rounded-lg border border-white/10">
            {(
              [
                { key: 'wall', label: 'Ver muro' },
                { key: 'upload', label: 'Subir fotos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  setCopied(false)
                }}
                className={clsx(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-ink-secondary hover:bg-white/5 hover:text-ink'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* QR for active tab */}
        <BrandedQR
          value={activeUrl}
          title={activeShareTarget === 'wall' ? 'Muro de Momentos' : 'Subir Fotos'}
          subtitle={
            activeShareTarget === 'wall' ? 'Escanea para ver los mejores momentos' : 'Escanea para subir fotos y videos'
          }
          downloadName={activeShareTarget === 'wall' ? 'qr-muro-momentos' : 'qr-subida-momentos'}
          size={180}
          dark
        />

        {/* URL + actions */}
        <div className="w-full space-y-2 pt-1">
          <p className="px-2 text-center text-xs break-all text-ink-muted">{activeUrl}</p>
          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-soft py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            onClick={copy}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white transition-colors',
              activeShareTarget === 'wall' ? 'bg-pink-500 hover:bg-pink-400' : 'bg-indigo-600 hover:bg-indigo-500'
            )}
          >
            <ClipboardDocumentIcon className="size-4" />
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ─── Reoptimizing section ─────────────────────────────────────────────────

interface ReoptimizingSectionProps {
  moments: Moment[]
  resolveUrl: (m: Moment) => string
}

function ReoptimizingSection({ moments, resolveUrl }: ReoptimizingSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(STATUS_SECTION_PAGE)
  const visibleMoments = moments.slice(0, visibleCount)

  if (moments.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mt-4 overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/5"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <ArrowPathIcon className="size-3.5 shrink-0 animate-spin text-indigo-400" />
        <span className="flex-1 text-xs font-medium text-indigo-300">Procesando ({moments.length})</span>
        <span className="text-[10px] text-indigo-400/60">{collapsed ? 'mostrar' : 'ocultar'}</span>
      </button>

      {/* Cards */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {visibleMoments.map((m) => {
                const url = resolveUrl(m)
                const video = isBackendVideoMedia(url, m.content_type)
                const thumb = video ? resolveMomentThumbnailUrl(m) : url
                return (
                  <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-raised">
                    {thumb && <Image src={thumb} alt="" fill className="object-cover" sizes="96px" unoptimized />}
                    {/* Spinner overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
                      <ArrowPathIcon className="size-5 animate-spin text-indigo-400" />
                    </div>
                  </div>
                )
              })}
            </div>
            {visibleCount < moments.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + STATUS_SECTION_PAGE)}
                className="mx-auto mb-4 block rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                Mostrar {Math.min(STATUS_SECTION_PAGE, moments.length - visibleCount)} más
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── InFlightSection ────────────────────────────────────────────────────────
// Shows brand-new uploads currently being processed by Lambda for the first time.
// Distinct from ReoptimizingSection (which covers already-optimized files being re-run).

interface InFlightSectionProps {
  // resolveUrl is intentionally absent — raw S3 keys are not displayable yet.
  // Show icon + spinner placeholder instead of an image thumbnail.
  moments: Moment[]
}

function InFlightSection({ moments }: InFlightSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(STATUS_SECTION_PAGE)
  const visibleMoments = moments.slice(0, visibleCount)

  if (moments.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mt-4 overflow-hidden rounded-xl border border-sky-500/20 bg-sky-500/5"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <ArrowUpTrayIcon className="size-3.5 shrink-0 text-sky-400" />
        <span className="flex-1 text-xs font-medium text-sky-300">Optimizando nuevos archivos ({moments.length})</span>
        <ArrowPathIcon className="size-3 shrink-0 animate-spin text-sky-400/60" />
        <span className="ml-1 text-[10px] text-sky-400/60">{collapsed ? 'mostrar' : 'ocultar'}</span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {visibleMoments.map((m) => {
                const isVid = m.content_type?.startsWith('video/')
                return (
                  <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-raised">
                    {/* File type indicator */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isVid ? (
                        <VideoCameraIcon className="size-6 text-ink-muted" />
                      ) : (
                        <PhotoIcon className="size-6 text-ink-muted" />
                      )}
                    </div>
                    {/* Spinner overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/40">
                      <ArrowPathIcon className="size-5 animate-spin text-sky-400" />
                    </div>
                    {/* Status badge */}
                    <div className="absolute inset-x-1 bottom-1">
                      <span className="block w-full truncate rounded bg-surface/70 px-1 py-0.5 text-center text-[9px] text-sky-300/80">
                        {m.processing_status === 'processing' ? 'Procesando…' : 'En cola'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            {visibleCount < moments.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + STATUS_SECTION_PAGE)}
                className="mx-auto mb-4 block rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
              >
                Mostrar {Math.min(STATUS_SECTION_PAGE, moments.length - visibleCount)} más
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── FailedSection ──────────────────────────────────────────────────────────
// Shows Lambda-failed moments above the main grid.
// • Error message visible on hover/long-press per card.
// • Individual retry per card + "retry all" in header.
// • Smart retry: raw S3 key → PUT /moments/:id/requeue
//               opt S3 key → POST /moments/batch/reoptimize (ForceReoptimize)

interface FailedSectionProps {
  moments: Moment[]
  resolveUrl: (m: Moment) => string
  onRetried: () => void
}

function FailedSection({ moments, resolveUrl, onRetried }: FailedSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(STATUS_SECTION_PAGE)
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [retryingAll, setRetryingAll] = useState(false)
  const visibleMoments = moments.slice(0, visibleCount)

  if (moments.length === 0) return null

  async function retryOne(m: Moment) {
    if (retrying.has(m.id)) return
    setRetrying((prev) => new Set(prev).add(m.id))
    try {
      if (isRawMomentMediaPath(m.content_url)) {
        await api.put(momentRequeuePath(m.id), {})
      } else {
        await api.post(momentsBatchReoptimizePath(), { ids: [m.id] })
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al reintentar'))
    } finally {
      setRetrying((prev) => {
        const s = new Set(prev)
        s.delete(m.id)
        return s
      })
      onRetried()
    }
  }

  async function retryAll() {
    if (retryingAll) return
    setRetryingAll(true)
    const toastId = toast.loading(`Reintentando ${moments.length} momentos…`)
    const rawMoments = moments.filter((m) => isRawMomentMediaPath(m.content_url))
    const optMoments = moments.filter((m) => !isRawMomentMediaPath(m.content_url))
    let succeeded = 0
    let failed = 0
    let firstError: string | null = null

    const rawResults = await mapSettledWithConcurrency(rawMoments, 4, (moment) =>
      api.put(momentRequeuePath(moment.id), {})
    )
    for (const result of rawResults) {
      if (result.status === 'fulfilled') succeeded++
      else {
        firstError ??= getApiErrorMessage(result.reason, 'Error al reintentar')
        failed++
      }
    }

    const CHUNK = 200
    for (let i = 0; i < optMoments.length; i += CHUNK) {
      const chunk = optMoments.slice(i, i + CHUNK)
      try {
        const res = await api.post(momentsBatchReoptimizePath(), { ids: chunk.map((m) => m.id) })
        const { succeeded: s = 0, failed: f = 0 } = readApiData<Partial<MomentBatchResult>>(res.data) ?? {}
        succeeded += s
        failed += f
      } catch (err: unknown) {
        firstError ??= getApiErrorMessage(err, 'Error al reintentar')
        failed += chunk.length
      }
    }

    setRetryingAll(false)
    if (failed > 0) {
      const detail = firstError ? `: ${firstError}` : ''
      toast.error(`${succeeded} reencolados, ${failed} con error${detail}`, { id: toastId })
    } else {
      toast.success(`${succeeded} momentos reencolados`, { id: toastId })
    }
    onRetried()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mt-4 overflow-hidden rounded-xl border border-red-500/20 bg-red-500/5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left transition-opacity hover:opacity-80"
        >
          <ExclamationTriangleIcon className="size-3.5 shrink-0 text-red-400" />
          <span className="flex-1 text-xs font-medium text-red-300">Fallidos ({moments.length})</span>
          <span className="text-[10px] text-red-400/60">{collapsed ? 'mostrar' : 'ocultar'}</span>
        </button>
        <button
          type="button"
          onClick={retryAll}
          disabled={retryingAll}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        >
          {retryingAll ? <ArrowPathIcon className="size-3 animate-spin" /> : <ArrowPathIcon className="size-3" />}
          Reintentar todos
        </button>
      </div>

      {/* Cards grid */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {visibleMoments.map((m) => {
                const url = resolveUrl(m)
                const video = isBackendVideoMedia(url, m.content_type)
                const thumb = video ? resolveMomentThumbnailUrl(m) : url
                const spinning = retrying.has(m.id)
                const processingDuration = formatDurationMs(m.processing_duration_ms)
                return (
                  <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-surface">
                    {thumb ? (
                      <Image src={thumb} alt="" fill className="object-cover opacity-40" sizes="96px" unoptimized />
                    ) : (
                      <div className="absolute inset-0 bg-surface-raised" />
                    )}

                    {/* Error message — shown on hover */}
                    {(m.error_message || processingDuration) && (
                      <div className="absolute inset-x-0 bottom-0 z-10 translate-y-full bg-black/80 px-1.5 py-1 transition-transform duration-150 group-hover:translate-y-0">
                        {m.error_message && (
                          <p className="line-clamp-3 text-[9px] leading-tight text-red-300">{m.error_message}</p>
                        )}
                        {processingDuration && (
                          <p className="mt-0.5 text-[9px] leading-tight text-red-200/75">
                            Tiempo: {processingDuration}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Retry button overlay */}
                    <button
                      type="button"
                      onClick={() => retryOne(m)}
                      disabled={spinning}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/50"
                      title={m.error_message ?? 'Lambda falló — click para reintentar'}
                    >
                      {spinning ? (
                        <ArrowPathIcon className="size-5 animate-spin text-white" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <ExclamationTriangleIcon className="size-4 text-red-400" />
                          <span className="text-[9px] font-medium text-white/70 transition-colors group-hover:text-white">
                            retry
                          </span>
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {visibleCount < moments.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + STATUS_SECTION_PAGE)}
                className="mx-auto mb-4 block rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
              >
                Mostrar {Math.min(STATUS_SECTION_PAGE, moments.length - visibleCount)} más
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Processing status badge ──────────────────────────────────────────────────

function ProcessingBadge({ status }: { status: Moment['processing_status'] }) {
  if (!status || status === 'done') return null
  const colors: Record<string, string> = {
    pending: 'bg-sky-500/15 text-sky-400 ring-sky-500/25',
    processing: 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/25',
    failed: 'bg-rose-500/15 text-rose-400 ring-rose-500/25',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${colors[status] ?? ''}`}
    >
      {status === 'processing' && <ArrowPathIcon className="size-3 animate-spin" />}
      {status === 'failed' && <ExclamationTriangleIcon className="size-3" />}
      {processingLabel(status)}
    </span>
  )
}

// ─── Moment Card ──────────────────────────────────────────────────────────────

interface MomentCardProps {
  moment: Moment
  canManage?: boolean
  onApprove: (m: Moment) => Promise<void>
  onUnapprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
  onOpenLightbox: (m: Moment) => void
  resolveUrl: (m: Moment) => string
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const MomentCard = memo(function MomentCard({
  moment,
  canManage = true,
  onApprove,
  onUnapprove,
  onDelete,
  onOpenLightbox,
  resolveUrl,
  selectMode,
  selected,
  onToggleSelect,
}: MomentCardProps) {
  const [actioning, setActioning] = useState<'approve' | 'unapprove' | 'delete' | null>(null)
  const url = resolveUrl(moment)
  const hasMedia = !!url
  const video = hasMedia && isBackendVideoMedia(url, moment.content_type)
  const isProcessing = moment.processing_status === 'pending' || moment.processing_status === 'processing'
  const isFailed = moment.processing_status === 'failed'
  const approved = moment.is_approved
  const { ref: lazyRef, visible } = useLazyVisible()

  // Extract first frame for videos without a server-generated thumbnail
  const thumbnailUrl = resolveMomentThumbnailUrl(moment)
  // Frame extraction creates a real <video> element and may download media.
  // Keep that work behind the same viewport gate as the card contents so a
  // wall with many legacy videos does not start dozens of decoders at once.
  const extractedThumb = useVideoThumbnail(visible && video && !thumbnailUrl ? url : null)

  return (
    <motion.div
      ref={lazyRef}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="group relative aspect-square overflow-hidden rounded-xl bg-surface"
    >
      {/* ── Select mode overlay ─────────────────────────── */}
      {selectMode && (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={selected ? 'Quitar momento de la selección' : 'Seleccionar momento'}
          className="absolute inset-0 z-20 cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:outline-none focus-visible:ring-inset"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(moment.id)
          }}
        >
          <div
            className={clsx(
              'absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-2 transition-colors',
              selected ? 'border-indigo-400 bg-indigo-500' : 'border-white/40 bg-black/40 backdrop-blur-sm'
            )}
          >
            {selected && <CheckIcon className="size-3.5 text-white" />}
          </div>
          {selected && <div className="absolute inset-0 rounded-xl border-2 border-indigo-400/60 bg-indigo-500/20" />}
        </button>
      )}
      {/* ── Media area ─────────────────────────────────────── */}
      {visible ? (
        isProcessing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-raised to-surface">
            <ArrowPathIcon className="size-8 animate-spin text-indigo-400 opacity-60" />
            <p className="px-4 text-center text-xs text-ink-muted">{processingLabel(moment.processing_status)}</p>
          </div>
        ) : isFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-950/40 p-4">
            <ExclamationTriangleIcon className="size-8 text-rose-500 opacity-70" />
            <p className="text-center text-xs text-rose-400">Error al procesar</p>
            {canManage && (
              <button
                onClick={async () => {
                  try {
                    if (isRawMomentMediaPath(moment.content_url)) {
                      await api.put(momentRequeuePath(moment.id), {})
                    } else {
                      await api.post(momentsBatchReoptimizePath(), { ids: [moment.id] })
                    }
                    toast.success('Reintentando…')
                  } catch (err: unknown) {
                    toast.error(getApiErrorMessage(err, 'No se pudo reintentar.'))
                  }
                }}
                className="flex items-center gap-1 text-xs text-rose-300 underline underline-offset-2 hover:text-rose-100"
              >
                <ArrowPathIcon className="size-3" /> Reintentar
              </button>
            )}
          </div>
        ) : video ? (
          <button
            type="button"
            aria-label="Abrir video en el visor"
            disabled={selectMode}
            className="absolute inset-0 cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none focus-visible:ring-inset disabled:cursor-default"
            onClick={() => onOpenLightbox(moment)}
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="Video momento" className="h-full w-full object-cover" loading="lazy" />
            ) : extractedThumb ? (
              <img src={extractedThumb} alt="Video momento" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-raised to-surface">
                <div className="flex size-14 items-center justify-center rounded-full bg-black/50 ring-1 ring-white/20">
                  <svg className="ml-1 size-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                </div>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
              <div className="flex size-12 items-center justify-center rounded-full bg-black/50 opacity-80 ring-1 ring-white/20 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <svg className="ml-0.5 size-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </div>
            </div>
          </button>
        ) : hasMedia ? (
          <button
            type="button"
            aria-label="Abrir foto en el visor"
            disabled={selectMode}
            className="absolute inset-0 cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none focus-visible:ring-inset disabled:cursor-default"
            onClick={() => onOpenLightbox(moment)}
          >
            <Image
              src={url}
              alt="Momento del evento"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
          </button>
        ) : moment.description ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-raised/80 to-surface p-5">
            <p className="line-clamp-6 text-center text-sm leading-relaxed text-ink-secondary italic">
              &ldquo;{moment.description}&rdquo;
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-raised/50">
            <PhotoIcon className="size-10 text-ink-muted" />
          </div>
        )
      ) : (
        <div className="absolute inset-0 animate-pulse rounded-xl bg-surface-raised/40" />
      )}

      {/* ── Status badge (top-left) ─────────────────────────── */}
      {!isProcessing && !isFailed && (
        <div className="absolute top-2 left-2 z-10">
          {approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/25 px-2 py-0.5 text-[10px] font-semibold text-lime-300 ring-1 ring-lime-500/30 backdrop-blur-sm">
              <CheckIcon className="size-2.5" /> Aprobado
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30 backdrop-blur-sm">
              Pendiente
            </span>
          )}
        </div>
      )}

      {/* ── Oversized badge (top-right) ─────────────────────── */}
      {isOversized(moment) && (
        <div className="absolute top-2 right-2 z-10">
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            <ExclamationTriangleIcon className="h-3 w-3" />
            {formatBytes(moment.optimized_size_bytes!)}
          </span>
        </div>
      )}

      {/* ── Description chip — above action bar, only when card has media ── */}
      {hasMedia && moment.description && !isProcessing && !isFailed && (
        <div className="pointer-events-none absolute right-2 bottom-12 left-2 z-10 sm:opacity-0 sm:transition-opacity sm:duration-200 sm:group-hover:opacity-100">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[10px] text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
            <ChatBubbleOvalLeftIcon className="size-3 flex-none shrink-0 text-white/50" />
            <span className="truncate">{moment.description}</span>
          </span>
        </div>
      )}

      {/* ── Action bar (bottom overlay) ─────────────────────────
           Always visible on mobile. Fade+slide in on desktop hover. */}
      {canManage && !isProcessing && (
        <div
          className={clsx(
            'absolute right-0 bottom-0 left-0 z-10',
            'flex items-stretch',
            'bg-gradient-to-t from-black/80 via-black/50 to-transparent backdrop-blur-[2px]',
            'transition-all duration-200',
            'sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100'
          )}
        >
          {!approved && !isFailed && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setActioning('approve')
                await onApprove(moment)
                setActioning(null)
              }}
              disabled={actioning !== null}
              className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold text-lime-300 transition-colors hover:bg-lime-500/20 disabled:opacity-40 sm:py-3.5"
            >
              <CheckIcon className="size-3.5 shrink-0" />
              <span>{actioning === 'approve' ? '…' : 'Aprobar'}</span>
            </button>
          )}
          {approved && !isFailed && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setActioning('unapprove')
                await onUnapprove(moment)
                setActioning(null)
              }}
              disabled={actioning !== null}
              aria-label="Desaprobar momento"
              className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40 sm:py-3.5"
            >
              <ArrowUturnLeftIcon className="size-3.5 shrink-0" />
              <span>{actioning === 'unapprove' ? '…' : 'Desaprobar'}</span>
            </button>
          )}
          <button
            onClick={async (e) => {
              e.stopPropagation()
              setActioning('delete')
              await onDelete(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            aria-label="Eliminar momento"
            className={clsx(
              'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40 sm:py-3.5',
              approved || isFailed ? 'flex-1' : 'px-4'
            )}
          >
            <XMarkIcon className="size-3.5 shrink-0" />
            {(approved || isFailed) && <span>{actioning === 'delete' ? '…' : 'Eliminar'}</span>}
          </button>
        </div>
      )}
    </motion.div>
  )
})

// ─── Note Card ────────────────────────────────────────────────────────────────

interface NoteCardProps {
  moment: Moment
  canManage?: boolean
  onApprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
  resolveUrl: (m: Moment) => string
}

function NoteCard({ moment, canManage = true, onApprove, onDelete, resolveUrl }: NoteCardProps) {
  const [actioning, setActioning] = useState<'approve' | 'delete' | null>(null)
  const url = resolveUrl(moment)
  const video = isBackendVideoMedia(url, moment.content_type)
  const approved = moment.is_approved

  const timeLabel = new Date(moment.created_at).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <motion.div
      data-testid="moment-note-card"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-4 rounded-xl border border-white/8 bg-surface/70 p-4 transition-colors hover:bg-surface"
    >
      {/* Thumbnail — media preview */}
      {url && (
        <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-surface-raised ring-1 ring-white/8">
          {video ? (
            <div className="flex size-full items-center justify-center bg-surface-raised">
              <svg className="ml-0.5 size-5 text-ink-secondary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </div>
          ) : (
            <Image src={url} alt="Momento" width={56} height={56} className="size-full object-cover" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          {approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-semibold text-lime-300 ring-1 ring-lime-500/25">
              <CheckIcon className="size-2.5" /> Aprobado
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/25">
              Pendiente
            </span>
          )}
          <span className="text-[10px] text-ink-muted tabular-nums">{timeLabel}</span>
        </div>

        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink italic">
          &ldquo;{moment.description}&rdquo;
        </p>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex shrink-0 flex-col gap-1.5">
          {!approved && (
            <button
              onClick={async () => {
                setActioning('approve')
                await onApprove(moment)
                setActioning(null)
              }}
              disabled={actioning !== null}
              title="Aprobar nota"
              className="flex items-center justify-center gap-1 rounded-lg border border-lime-500/20 bg-lime-500/10 px-2.5 py-1.5 text-xs font-medium text-lime-300 transition-colors hover:bg-lime-500/20 disabled:opacity-40"
            >
              {actioning === 'approve' ? (
                <ArrowPathIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              <span className="hidden sm:inline">Aprobar</span>
            </button>
          )}
          <button
            onClick={async () => {
              setActioning('delete')
              await onDelete(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            title="Eliminar nota"
            className="flex items-center justify-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
          >
            {actioning === 'delete' ? (
              <ArrowPathIcon className="size-3.5 animate-spin" />
            ) : (
              <XMarkIcon className="size-3.5" />
            )}
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ─── Sortable card wrapper ────────────────────────────────────────────────────

// ─── Main Wall ────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  /** Hides moderation and publishing controls for read-only event members. */
  canManage?: boolean
  /** Used to construct the shared upload URL for QR code */
  eventIdentifier: string
  /** Displayed in the QR modal heading */
  eventName?: string
  /** When false, hides the QR upload button. Defaults to true. */
  shareUploadsEnabled?: boolean
  /** Backend upload gate required before shared QR uploads can accept files. */
  allowUploadsEnabled?: boolean
  /** When true, uploaded moments skip manual review after processing. */
  autoApproveUploads?: boolean
  /** Whether the moments wall is published (closes uploads for guests) */
  momentsWallPublished?: boolean
  /** Called when EventConfig changes and the public PageSpec should be refreshed. */
  onPublicContentChanged?: () => void
  /** Poll for newly uploaded moments only while the event can still change live. */
  liveRefreshEnabled?: boolean
}

type MomentConfirmation =
  | { kind: 'delete-one'; moment: Moment }
  | { kind: 'delete-selected'; count: number }
  | { kind: 'reject-pending'; count: number }
  | { kind: 'toggle-publish'; publish: boolean }

type MomentDashboardPage = {
  data: Moment[]
  in_flight?: Moment[]
  reoptimizing?: Moment[]
  total: number
  page: number
  page_size: number
  total_pages: number
  counts: {
    total: number
    pending: number
    approved: number
    failed: number
    photos: number
    videos: number
    notes: number
    legacy: number
  }
}

function updateMomentDashboardPages(
  pages: MomentDashboardPage[] | undefined,
  updater: (page: MomentDashboardPage) => unknown
): MomentDashboardPage[] | undefined {
  return pages?.map((page) => updater(page) as MomentDashboardPage)
}

function adjustMomentCounts(
  page: MomentDashboardPage,
  delta: Partial<MomentDashboardPage['counts']>
): MomentDashboardPage {
  return {
    ...page,
    counts: Object.fromEntries(
      Object.entries(page.counts).map(([key, value]) => [
        key,
        Math.max(0, value + (delta[key as keyof typeof delta] ?? 0)),
      ])
    ) as MomentDashboardPage['counts'],
  }
}

function approvalCountDelta(moment: Moment, approved: boolean): Partial<MomentDashboardPage['counts']> {
  if (moment.is_approved === approved) return {}
  return approved ? { pending: -1, approved: 1 } : { pending: 1, approved: -1 }
}

function deletionCountDelta(moments: Moment[]): Partial<MomentDashboardPage['counts']> {
  return moments.reduce<Partial<MomentDashboardPage['counts']>>((delta, moment) => {
    delta.total = (delta.total ?? 0) - 1
    if (moment.is_approved) delta.approved = (delta.approved ?? 0) - 1
    else if (moment.processing_status !== 'failed') delta.pending = (delta.pending ?? 0) - 1
    if (moment.processing_status === 'failed') delta.failed = (delta.failed ?? 0) - 1
    if (moment.description?.trim()) delta.notes = (delta.notes ?? 0) - 1
    if (!moment.processing_status) delta.legacy = (delta.legacy ?? 0) - 1
    return delta
  }, {})
}

export function MomentsWall({
  eventId,
  canManage = true,
  eventIdentifier,
  eventName,
  shareUploadsEnabled,
  allowUploadsEnabled,
  autoApproveUploads,
  momentsWallPublished,
  onPublicContentChanged,
  liveRefreshEnabled = true,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'failed' | 'photos' | 'videos' | 'notes'>('all')
  const [timeRange, setTimeRange] = useState<{ from: string; to: string } | null>(null)
  const [wallPublished, setWallPublished] = useState(momentsWallPublished ?? true)
  const [uploadsEnabled, setUploadsEnabled] = useState(allowUploadsEnabled ?? false)
  const [shareEnabled, setShareEnabled] = useState(Boolean(shareUploadsEnabled && (allowUploadsEnabled ?? false)))
  const momentWallState = getEventConfigMomentWallState({
    allow_uploads: uploadsEnabled,
    share_uploads_enabled: shareEnabled,
    show_moment_wall: wallPublished,
  })
  const sharedUploadStatus = momentWallState.sharedUploadStatus
  const sharedUploadActive = sharedUploadStatus === 'active'
  const sharedUploadClosedByPublishedWall = sharedUploadStatus === 'closed-by-wall'

  useEffect(() => {
    setWallPublished(momentsWallPublished ?? true)
  }, [momentsWallPublished])
  useEffect(() => {
    setUploadsEnabled(allowUploadsEnabled ?? false)
  }, [allowUploadsEnabled])
  useEffect(() => {
    setShareEnabled(Boolean(shareUploadsEnabled && (allowUploadsEnabled ?? false)))
  }, [allowUploadsEnabled, shareUploadsEnabled])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [showWallShare, setShowWallShare] = useState(false)
  const [showMoreSheet, setShowMoreSheet] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [showZipMenu, setShowZipMenu] = useState(false)
  const [confirmation, setConfirmation] = useState<MomentConfirmation | null>(null)
  const [confirmationBusy, setConfirmationBusy] = useState(false)
  const zipMenuRef = useRef<HTMLDivElement>(null)

  // Pause polling while the admin tab is hidden — no point hitting the API
  // when no one is watching. Resumes automatically when tab regains focus.
  const isPageActive = usePageActivity()

  // ─── Drag & drop reorder ──────────────────────────────────────────────────────
  const [dragMode, setDragMode] = useState(false)

  const {
    data: momentPages,
    isLoading,
    isValidating,
    error: momentsError,
    size: momentPageCount,
    setSize: setMomentPageCount,
    mutate: mutateMomentPages,
  } = useSWRInfinite<MomentDashboardPage>(
    (pageIndex, previousPage) => {
      if (!eventId || (previousPage && pageIndex >= previousPage.total_pages)) return null
      return momentsPagePath(eventId, pageIndex + 1, MOMENTS_PAGE_SIZE)
    },
    fetcher,
    {
      ...responsiveListSwrOptions,
      refreshInterval: isPageActive && liveRefreshEnabled && !dragMode ? REFRESH_INTERVAL : 0,
      revalidateAll: false,
      persistSize: false,
    }
  )
  const moments = useMemo(() => momentPages?.flatMap((page) => page.data ?? []) ?? [], [momentPages])
  const momentCounts = momentPages?.[0]?.counts
  const totalMoments = momentCounts?.total ?? moments.length
  const totalMomentPages = momentPages?.[0]?.total_pages ?? 0
  const hasMoreMomentPages = momentPageCount < totalMomentPages
  const momentsErrorState = getDataErrorState(momentsError, momentPages)
  const mutatePagesWith = useCallback(
    (updater: (page: MomentDashboardPage) => unknown) =>
      mutateMomentPages((current) => updateMomentDashboardPages(current, updater), { revalidate: false }),
    [mutateMomentPages]
  )
  const loadAllMoments = useCallback(async (): Promise<Moment[]> => {
    if (!eventId || totalMomentPages <= momentPageCount) return moments
    const missingPages = Array.from(
      { length: totalMomentPages - momentPageCount },
      (_, index) => momentPageCount + index + 1
    )
    const pageResults = await mapSettledWithConcurrency(missingPages, 3, (page) =>
      api.get<MomentDashboardPage>(momentsPagePath(eventId, page, MOMENTS_PAGE_SIZE))
    )
    const failedPage = pageResults.find((result) => result.status === 'rejected')
    if (failedPage?.status === 'rejected') throw failedPage.reason
    const loaded = pageResults.flatMap((result) =>
      result.status === 'fulfilled' ? (readApiData<MomentDashboardPage | null>(result.value.data)?.data ?? []) : []
    )
    const byId = new Map([...moments, ...loaded].map((moment) => [moment.id, moment]))
    return [...byId.values()]
  }, [eventId, momentPageCount, moments, totalMomentPages])
  const mediaRefreshDelay = useMemo(
    () => (isPageActive && !dragMode ? getMomentsRefreshDelay(moments) : null),
    [dragMode, isPageActive, moments]
  )
  const mediaRefreshKey = useMemo(() => momentsMediaRefreshKey(moments), [moments])
  const lastMediaRefreshKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!eventId || !isPageActive || dragMode || mediaRefreshDelay === null || !mediaRefreshKey) return

    const refreshMoments = () => {
      lastMediaRefreshKeyRef.current = mediaRefreshKey
      void mutateMomentPages()
    }

    if (mediaRefreshDelay <= 0) {
      if (lastMediaRefreshKeyRef.current === mediaRefreshKey) return
      refreshMoments()
      return
    }

    const timer = window.setTimeout(refreshMoments, mediaRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [dragMode, eventId, isPageActive, mediaRefreshDelay, mediaRefreshKey, mutateMomentPages])

  // ─── In-flight re-optimization (separate 5s hook) ────────────────────────
  const embeddedMomentActivity = useMemo(
    () => ({
      in_flight: momentPages?.[0]?.in_flight ?? [],
      reoptimizing: momentPages?.[0]?.reoptimizing ?? [],
    }),
    [momentPages]
  )
  const hasActiveMomentJobs =
    embeddedMomentActivity.in_flight.length > 0 || embeddedMomentActivity.reoptimizing.length > 0
  const activitySwrKey = eventId && hasActiveMomentJobs ? momentActivityPath(eventId) : null
  const { data: liveMomentActivity } = useSWR<{ in_flight: Moment[]; reoptimizing: Moment[] }>(
    activitySwrKey,
    fetcher,
    {
      fallbackData: embeddedMomentActivity,
      revalidateOnMount: false,
      revalidateOnFocus: false,
      refreshInterval: isPageActive ? 5_000 : 0,
    }
  )
  const momentActivity = activitySwrKey ? (liveMomentActivity ?? embeddedMomentActivity) : embeddedMomentActivity
  const inFlightMoments = momentActivity?.in_flight ?? []
  const reoptimizingMoments = momentActivity?.reoptimizing ?? []

  // Toast when Lambda finishes — fires when count drops
  const prevReoptimizingCount = useRef(0)
  useEffect(() => {
    const curr = reoptimizingMoments.length
    const prev = prevReoptimizingCount.current
    if (prev > 0 && curr < prev) {
      const finished = prev - curr
      toast.success(`${finished} archivo${finished !== 1 ? 's' : ''} reoptimizado${finished !== 1 ? 's' : ''}`)
    }
    prevReoptimizingCount.current = curr
  }, [reoptimizingMoments.length])

  // ─── In-flight new uploads (separate 5s hook) ─────────────────────────────
  // Toast when Lambda finishes a new upload
  const prevInFlightCount = useRef(0)
  useEffect(() => {
    const curr = inFlightMoments.length
    const prev = prevInFlightCount.current
    if (prev > 0 && curr < prev) {
      const finished = prev - curr
      toast.success(
        `${finished} archivo${finished !== 1 ? 's' : ''} optimizado${finished !== 1 ? 's' : ''} — listo para aprobar`
      )
    }
    prevInFlightCount.current = curr
  }, [inFlightMoments.length])

  const refreshMomentStreams = useCallback(() => {
    void mutateMomentPages()
    if (activitySwrKey) void globalMutate(activitySwrKey)
  }, [activitySwrKey, mutateMomentPages])

  const notifyPublicContentChanged = useCallback(() => {
    onPublicContentChanged?.()
  }, [onPublicContentChanged])

  // Local ordered copy used only while drag mode is active
  const [orderedMoments, setOrderedMoments] = useState<Moment[]>([])
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync orderedMoments whenever approved moments change externally
  useEffect(() => {
    if (!dragMode) return
    setOrderedMoments(moments.filter((m) => m.is_approved))
  }, [moments, dragMode])

  const enterDragMode = useCallback(async () => {
    const allMoments = await loadAllMoments()
    setOrderedMoments(allMoments.filter((moment) => moment.is_approved))
    setDragMode(true)
  }, [loadAllMoments])

  const exitDragMode = useCallback(() => {
    setDragMode(false)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
  }, [])

  // Debounced save — fires 800ms after last drag ends
  useEffect(() => {
    if (!dragMode || orderedMoments.length === 0) return
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(async () => {
      const toastId = toast.loading('Guardando orden…')
      try {
        const payload = orderedMoments.map((m, i) => ({ id: m.id, order: i + 1 }))
        await api.patch(momentsReorderPath(), payload)
        await mutateMomentPages()
        notifyPublicContentChanged()
        toast.success('Orden guardado', { id: toastId })
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Error al guardar el orden'), { id: toastId })
      }
    }, 800)
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [orderedMoments, dragMode, mutateMomentPages, notifyPublicContentChanged])

  // Reset drag mode when filter changes away from approved
  useEffect(() => {
    if (filter !== 'approved') exitDragMode()
  }, [filter, exitDragMode])

  // Close ZIP menu when clicking outside
  useEffect(() => {
    if (!showZipMenu) return
    const handler = (e: MouseEvent) => {
      if (zipMenuRef.current && !zipMenuRef.current.contains(e.target as Node)) {
        setShowZipMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showZipMenu])

  // Backend usually returns presigned URLs, but in tests/local fallback paths can be object keys.
  const resolveUrl = useCallback((m: Moment) => resolveMomentContentUrl(m), [])

  const {
    filteredMoments,
    lightboxMoments,
    pendingCount,
    approvedCount,
    failedCount,
    photoCount,
    videoCount,
    notesCount,
    legacyCount,
  } = useMemo(() => {
    const filteredMoments = moments
      .filter((m) => {
        if (filter === 'pending') return !m.is_approved && m.processing_status !== 'failed'
        if (filter === 'approved') return m.is_approved
        if (filter === 'failed') return m.processing_status === 'failed'
        if (filter === 'photos')
          return m.is_approved && !!resolveUrl(m) && !isBackendVideoMedia(resolveUrl(m), m.content_type)
        if (filter === 'videos')
          return m.is_approved && !!resolveUrl(m) && isBackendVideoMedia(resolveUrl(m), m.content_type)
        if (filter === 'notes') return !!m.description?.trim()
        return m.processing_status !== 'failed'
      })
      .filter((m) => {
        if (!timeRange) return true
        if (!m.created_at) return true
        const d = new Date(m.created_at)
        const mins = d.getHours() * 60 + d.getMinutes()
        const [fh, fm] = timeRange.from.split(':').map(Number)
        const [th, tm] = timeRange.to.split(':').map(Number)
        return mins >= fh * 60 + fm && mins <= th * 60 + tm
      })

    const pendingCount =
      momentCounts?.pending ?? moments.filter((m) => !m.is_approved && m.processing_status !== 'failed').length
    const approvedCount = momentCounts?.approved ?? moments.filter((m) => m.is_approved).length
    const failedCount = momentCounts?.failed ?? moments.filter((m) => m.processing_status === 'failed').length
    const photoCount =
      momentCounts?.photos ??
      moments.filter((m) => m.is_approved && !!resolveUrl(m) && !isBackendVideoMedia(resolveUrl(m), m.content_type))
        .length
    const videoCount =
      momentCounts?.videos ??
      moments.filter((m) => m.is_approved && !!resolveUrl(m) && isBackendVideoMedia(resolveUrl(m), m.content_type))
        .length
    const notesCount = momentCounts?.notes ?? moments.filter((m) => !!m.description?.trim()).length
    // Moments that never went through Lambda (legacy direct uploads)
    // '' is falsy — Go omitempty omits it so the JSON field arrives as "" which TypeScript models as ''
    const legacyCount = momentCounts?.legacy ?? moments.filter((m) => !m.processing_status).length

    // Moments eligible for lightbox (media present + not processing)
    const lightboxMoments = filteredMoments.filter(
      (m) => !!resolveUrl(m) && m.processing_status !== 'pending' && m.processing_status !== 'processing'
    )

    return {
      filteredMoments,
      lightboxMoments,
      pendingCount,
      approvedCount,
      failedCount,
      photoCount,
      videoCount,
      notesCount,
      legacyCount,
    }
  }, [filter, momentCounts, moments, resolveUrl, timeRange])

  const filteredTotal = timeRange
    ? filteredMoments.length
    : filter === 'pending'
      ? pendingCount
      : filter === 'approved'
        ? approvedCount
        : filter === 'failed'
          ? failedCount
          : filter === 'photos'
            ? photoCount
            : filter === 'videos'
              ? videoCount
              : filter === 'notes'
                ? notesCount
                : Math.max(0, totalMoments - failedCount)
  const isDiscoveringFilteredMoments =
    !timeRange && filteredMoments.length === 0 && filteredTotal > 0 && hasMoreMomentPages

  useEffect(() => {
    if (!isDiscoveringFilteredMoments || isValidating) return
    void setMomentPageCount((count) => count + 1)
  }, [isDiscoveringFilteredMoments, isValidating, setMomentPageCount])

  const handleApprove = useCallback(
    async (moment: Moment) => {
      const snapshot = momentPages
      // Optimistic: mark as approved immediately
      await mutatePagesWith((page) =>
        adjustMomentCounts(
          patchMomentsCacheValue(page, [moment.id], { is_approved: true }) as MomentDashboardPage,
          approvalCountDelta(moment, true)
        )
      )
      try {
        const res = await api.put<Moment>(momentPath(moment.id), { is_approved: true })
        const updatedMoment = readApiData<Moment | null>(res.data)
        if (updatedMoment?.id) {
          await mutatePagesWith((page) => upsertMomentCacheValue(page, updatedMoment))
        } else {
          await mutateMomentPages()
        }
        notifyPublicContentChanged()
        toast.success('Momento aprobado')
      } catch (err: unknown) {
        await mutateMomentPages(snapshot, { revalidate: false })
        toast.error(getApiErrorMessage(err, 'Error al aprobar el momento'))
      }
    },
    [momentPages, mutateMomentPages, mutatePagesWith, notifyPublicContentChanged]
  )

  const handleUnapprove = useCallback(
    async (moment: Moment) => {
      const snapshot = momentPages
      // Optimistic: mark as pending immediately
      await mutatePagesWith((page) =>
        adjustMomentCounts(
          patchMomentsCacheValue(page, [moment.id], { is_approved: false }) as MomentDashboardPage,
          approvalCountDelta(moment, false)
        )
      )
      try {
        const res = await api.put<Moment>(momentPath(moment.id), { is_approved: false })
        const updatedMoment = readApiData<Moment | null>(res.data)
        if (updatedMoment?.id) {
          await mutatePagesWith((page) => upsertMomentCacheValue(page, updatedMoment))
        } else {
          await mutateMomentPages()
        }
        notifyPublicContentChanged()
        toast.success('Momento desaprobado')
      } catch (err: unknown) {
        await mutateMomentPages(snapshot, { revalidate: false })
        toast.error(getApiErrorMessage(err, 'Error al desaprobar el momento'))
      }
    },
    [momentPages, mutateMomentPages, mutatePagesWith, notifyPublicContentChanged]
  )

  const executeDelete = useCallback(
    async (moment: Moment) => {
      const snapshot = momentPages
      // Optimistic: remove from list immediately
      await mutatePagesWith((page) =>
        adjustMomentCounts(
          removeMomentsCacheValue(page, [moment.id]) as MomentDashboardPage,
          deletionCountDelta([moment])
        )
      )
      // Remove from selection if active
      setSelectedIds((prev) => {
        if (!prev.has(moment.id)) return prev
        const next = new Set(prev)
        next.delete(moment.id)
        return next
      })
      try {
        await api.delete(momentPath(moment.id))
        notifyPublicContentChanged()
        toast.success('Momento eliminado')
      } catch (err: unknown) {
        await mutateMomentPages(snapshot, { revalidate: false })
        toast.error(getApiErrorMessage(err, 'Error al eliminar el momento'))
      }
    },
    [momentPages, mutateMomentPages, mutatePagesWith, notifyPublicContentChanged]
  )

  const handleDelete = useCallback(async (moment: Moment) => {
    setLightboxIndex(null)
    setConfirmation({ kind: 'delete-one', moment })
  }, [])

  // Clamp lightboxIndex when moments are deleted from within the lightbox
  useEffect(() => {
    if (lightboxIndex === null) return
    if (lightboxMoments.length === 0) {
      setLightboxIndex(null)
    } else if (lightboxIndex >= lightboxMoments.length) {
      setLightboxIndex(lightboxMoments.length - 1)
    }
  }, [lightboxMoments.length, lightboxIndex])

  const handleOpenLightbox = (m: Moment) => {
    const idx = lightboxMoments.findIndex((x) => x.id === m.id)
    if (idx !== -1) setLightboxIndex(idx)
  }

  const handleDownloadZip = async (typeFilter: 'all' | 'photos' | 'videos' = 'all') => {
    const JSZip = (await import('jszip')).default
    const allMoments = await loadAllMoments()
    const approved = allMoments.filter((m) => {
      if (!m.is_approved || !resolveUrl(m)) return false
      if (typeFilter === 'photos') return !isBackendVideoMedia(resolveUrl(m), m.content_type)
      if (typeFilter === 'videos') return isBackendVideoMedia(resolveUrl(m), m.content_type)
      return true
    })
    if (approved.length === 0) {
      toast.info('No hay momentos aprobados para descargar')
      return
    }
    setShowZipMenu(false)
    setDownloadingZip(true)
    let succeeded = 0
    let failed = 0
    let processed = 0
    const toastId = toast.loading(`Descargando 0 de ${approved.length} archivos…`)
    try {
      const zip = new JSZip()
      const folder = zip.folder('momentos') ?? zip
      const results = await mapSettledWithConcurrency(approved, 4, async (moment, index) => {
        try {
          const fileUrl = resolveUrl(moment)
          const response = await fetch(fileUrl)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          if (!blob || blob.size === 0) throw new Error('Empty media response')
          const key = moment.content_url || moment.content_view_url || fileUrl
          const extMatch = key.match(/\.(\w{2,5})(?:\?|$)/)
          const extension = extMatch?.[1] ?? (isBackendVideoMedia(key, moment.content_type) ? 'mp4' : 'jpg')
          return { blob, filename: `momento-${String(index + 1).padStart(3, '0')}.${extension}` }
        } finally {
          processed++
          toast.loading(`Descargando ${processed} de ${approved.length} archivos…`, { id: toastId })
        }
      })
      for (const result of results) {
        if (result.status === 'fulfilled') {
          folder.file(result.value.filename, result.value.blob)
          succeeded++
        } else {
          failed++
        }
      }
      if (succeeded === 0) {
        toast.error('No se pudo descargar ningún archivo. Intenta de nuevo.', { id: toastId })
        return
      }
      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 3 },
      })
      const suffix = typeFilter === 'photos' ? '-fotos' : typeFilter === 'videos' ? '-videos' : ''
      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = `momentos-${eventIdentifier}${suffix}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      if (failed > 0) {
        toast.success(`${succeeded} archivos descargados (${failed} fallaron)`, { id: toastId })
      } else {
        toast.success(`${succeeded} archivos descargados`, { id: toastId })
      }
    } catch {
      toast.error('Error al generar el ZIP', { id: toastId })
    } finally {
      setDownloadingZip(false)
    }
  }

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupByTime, setGroupByTime] = useState(false)

  // ─── Windowing ────────────────────────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE)
  // Reset when filter or grouping changes
  useEffect(() => {
    setVisibleCount(VISIBLE_PAGE)
  }, [filter, groupByTime])
  const visibleMoments = filteredMoments.slice(0, visibleCount)

  // ─── Bulk optimize (legacy + oversized) ─────────────────────────────────
  const [optimizing, setOptimizing] = useState(false)

  const oversizedMoments = useMemo(() => (moments ?? []).filter(isOversized), [moments])

  const failedMoments = useMemo(() => (moments ?? []).filter((m) => m.processing_status === 'failed'), [moments])

  const handleOptimizeAll = async () => {
    const allMoments = await loadAllMoments()
    const legacy = allMoments.filter((moment) => !moment.processing_status)
    const allOversizedMoments = allMoments.filter(isOversized)
    const totalCount = legacy.length + allOversizedMoments.length
    if (totalCount === 0 || optimizing) return
    setOptimizing(true)
    let succeeded = 0
    let failed = 0
    let firstError: string | null = null
    const toastId = toast.loading(`Enviando a Lambda 0 de ${totalCount}…`)

    // Legacy files require individual requests. A bounded pool keeps the
    // operation responsive without flooding the API.
    let processed = 0
    const legacyResults = await mapSettledWithConcurrency(legacy, 4, async (moment) => {
      try {
        return await api.put(momentRequeuePath(moment.id), {})
      } finally {
        processed++
        toast.loading(`Enviando a Lambda ${processed} de ${totalCount}…`, { id: toastId })
      }
    })
    for (const result of legacyResults) {
      if (result.status === 'fulfilled') succeeded++
      else {
        firstError ??= getApiErrorMessage(result.reason, 'Error al enviar a Lambda')
        failed++
      }
    }

    // Step 2: oversized done moments — batch in chunks of 200
    const CHUNK = 200
    for (let i = 0; i < allOversizedMoments.length; i += CHUNK) {
      const chunk = allOversizedMoments.slice(i, i + CHUNK)
      try {
        const res = await api.post(momentsBatchReoptimizePath(), { ids: chunk.map((m) => m.id) })
        const { succeeded: s = 0, failed: f = 0 } = readApiData<Partial<MomentBatchResult>>(res.data) ?? {}
        succeeded += s
        failed += f
      } catch (err: unknown) {
        firstError ??= getApiErrorMessage(err, 'Error al enviar a Lambda')
        failed += chunk.length
      }
      processed += chunk.length
      toast.loading(`Enviando a Lambda ${processed} de ${totalCount}…`, { id: toastId })
    }

    refreshMomentStreams()
    if (succeeded > 0) notifyPublicContentChanged()
    setOptimizing(false)
    if (failed > 0) {
      const detail = firstError ? `: ${firstError}` : ''
      toast.error(`${succeeded} enviados, ${failed} con error${detail}`, { id: toastId })
    } else {
      toast.success(`${succeeded} archivos enviados a Lambda`, { id: toastId })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleApproveSelected = async () => {
    const toApprove = moments.filter((m) => selectedIds.has(m.id) && !m.is_approved)
    if (toApprove.length === 0) return
    const approveIds = new Set(toApprove.map((m) => m.id))
    const snapshot = momentPages
    // Optimistic: mark selected as approved immediately
    await mutatePagesWith((page) =>
      adjustMomentCounts(patchMomentsCacheValue(page, approveIds, { is_approved: true }) as MomentDashboardPage, {
        pending: -toApprove.length,
        approved: toApprove.length,
      })
    )
    try {
      await api.post(momentsBulkApprovePath(), {
        ids: toApprove.map((m) => m.id),
        is_approved: true,
      })
      refreshMomentStreams()
      notifyPublicContentChanged()
      setSelectedIds(new Set())
      toast.success(`${toApprove.length} momento${toApprove.length !== 1 ? 's' : ''} aprobados`)
    } catch (err: unknown) {
      await mutateMomentPages(snapshot, { revalidate: false })
      toast.error(getApiErrorMessage(err, 'Error al aprobar momentos'))
    }
  }

  const executeDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    const deleteCount = selectedIds.size
    const deleteIds = new Set(selectedIds)
    const deletedMoments = moments.filter((moment) => deleteIds.has(moment.id))
    const snapshot = momentPages
    // Optimistic: remove selected from list immediately
    await mutatePagesWith((page) =>
      adjustMomentCounts(
        removeMomentsCacheValue(page, deleteIds) as MomentDashboardPage,
        deletionCountDelta(deletedMoments)
      )
    )
    try {
      await api.delete(momentsBulkDeletePath(), { data: { ids: [...deleteIds] } })
      refreshMomentStreams()
      notifyPublicContentChanged()
      setSelectedIds(new Set())
      setSelectMode(false)
      toast.success(`${deleteCount} momento${deleteCount !== 1 ? 's' : ''} eliminados`)
    } catch (err: unknown) {
      await mutateMomentPages(snapshot, { revalidate: false })
      toast.error(getApiErrorMessage(err, 'Error al eliminar momentos'))
    }
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setConfirmation({ kind: 'delete-selected', count: selectedIds.size })
  }

  const [approvingAll, setApprovingAll] = useState(false)

  const handleApproveAll = async () => {
    const allMoments = await loadAllMoments()
    const pending = allMoments.filter((m) => !m.is_approved && m.processing_status !== 'failed')
    if (pending.length === 0) return
    setApprovingAll(true)
    const snapshot = momentPages
    // Optimistic: mark all pending as approved immediately
    await mutatePagesWith((page) =>
      adjustMomentCounts(
        patchMomentsCacheValue(
          page,
          pending.map((m) => m.id),
          { is_approved: true }
        ) as MomentDashboardPage,
        { pending: -pending.length, approved: pending.length }
      )
    )
    try {
      await api.post(momentsBulkApprovePath(), {
        ids: pending.map((m) => m.id),
        is_approved: true,
      })
      refreshMomentStreams()
      notifyPublicContentChanged()
      toast.success(`${pending.length} momento${pending.length !== 1 ? 's' : ''} aprobados`)
    } catch (err: unknown) {
      await mutateMomentPages(snapshot, { revalidate: false })
      toast.error(getApiErrorMessage(err, 'Error al aprobar momentos'))
    } finally {
      setApprovingAll(false)
    }
  }

  const [rejectingAll, setRejectingAll] = useState(false)

  const executeRejectAll = async () => {
    const allMoments = await loadAllMoments()
    const pending = allMoments.filter((m) => !m.is_approved && m.processing_status !== 'failed')
    if (pending.length === 0) return
    setRejectingAll(true)
    const pendingIds = new Set(pending.map((m) => m.id))
    const snapshot = momentPages
    // Optimistic: remove all pending from list immediately
    await mutatePagesWith((page) =>
      adjustMomentCounts(removeMomentsCacheValue(page, pendingIds) as MomentDashboardPage, deletionCountDelta(pending))
    )
    try {
      await api.delete(momentsBulkDeletePath(), { data: { ids: pending.map((m) => m.id) } })
      refreshMomentStreams()
      notifyPublicContentChanged()
      toast.success(`${pending.length} momento${pending.length !== 1 ? 's' : ''} eliminados`)
    } catch (err: unknown) {
      await mutateMomentPages(snapshot, { revalidate: false })
      toast.error(getApiErrorMessage(err, 'Error al eliminar momentos'))
    } finally {
      setRejectingAll(false)
    }
  }

  const handleRejectAll = () => {
    const pendingCount =
      momentCounts?.pending ?? moments.filter((m) => !m.is_approved && m.processing_status !== 'failed').length
    if (pendingCount === 0) return
    setConfirmation({ kind: 'reject-pending', count: pendingCount })
  }

  const executeTogglePublish = async (newValue: boolean) => {
    try {
      const payload = normalizeEventConfigPatch({ show_moment_wall: newValue })
      const res = await api.put<EventConfig>(eventConfigPath(eventId), payload)
      const updated = readApiData<EventConfig | null>(res.data)
      setWallPublished(newValue)
      if (hasEventConfigCacheIdentity(updated)) {
        await globalMutate(
          eventConfigPath(eventId),
          (current: EventConfig | undefined) => replaceEventConfigCacheValue(current, updated) as EventConfig,
          { revalidate: false }
        )
        await globalMutate(
          (key) => isEventConfigBackedEventCacheKey(key, eventId),
          (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, updated),
          { revalidate: false }
        )
      } else {
        await globalMutate(eventConfigPath(eventId))
        await globalMutate((key) => isEventConfigBackedEventCacheKey(key, eventId))
      }
      notifyPublicContentChanged()
      toast.success(newValue ? 'Muro publicado' : 'Muro despublicado')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al actualizar el muro'))
    }
  }

  const handleTogglePublish = () => {
    setConfirmation({ kind: 'toggle-publish', publish: !wallPublished })
  }

  const confirmPendingAction = async () => {
    const pending = confirmation
    if (!pending || confirmationBusy) return
    setConfirmationBusy(true)
    try {
      if (pending.kind === 'delete-one') await executeDelete(pending.moment)
      if (pending.kind === 'delete-selected') await executeDeleteSelected()
      if (pending.kind === 'reject-pending') await executeRejectAll()
      if (pending.kind === 'toggle-publish') await executeTogglePublish(pending.publish)
    } finally {
      setConfirmationBusy(false)
      setConfirmation(null)
    }
  }

  const [generatingPreview, setGeneratingPreview] = useState(false)
  const [generatingTvPreview, setGeneratingTvPreview] = useState(false)
  const [generatingUploadPreview, setGeneratingUploadPreview] = useState(false)
  const { ensureToken: ensurePreviewToken } = usePreviewToken(eventId)

  const handleOpenPreview = async () => {
    if (generatingPreview) return
    setGeneratingPreview(true)
    try {
      const token = await ensurePreviewToken()
      window.open(
        getEventMomentsPreviewUrl(eventIdentifier, {
          cacheKey: Date.now(),
          previewToken: token,
        }),
        '_blank',
        'noopener,noreferrer'
      )
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'No se pudo generar el preview'))
    } finally {
      setGeneratingPreview(false)
    }
  }

  const handleOpenTvPreview = async () => {
    if (generatingTvPreview) return
    setGeneratingTvPreview(true)
    try {
      const token = await ensurePreviewToken()
      window.open(
        getEventTvPreviewUrl(eventIdentifier, {
          cacheKey: Date.now(),
          previewToken: token,
        }),
        '_blank',
        'noopener,noreferrer'
      )
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'No se pudo generar el modo TV'))
    } finally {
      setGeneratingTvPreview(false)
    }
  }

  const handleOpenUploadPreview = async () => {
    if (generatingUploadPreview) return
    setGeneratingUploadPreview(true)
    try {
      const token = await ensurePreviewToken()
      window.open(
        getEventUploadPreviewUrl(eventIdentifier, {
          cacheKey: Date.now(),
          previewToken: token,
        }),
        '_blank',
        'noopener,noreferrer'
      )
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'No se pudo generar el preview de subida'))
    } finally {
      setGeneratingUploadPreview(false)
    }
  }

  const handleToggleShare = async () => {
    if (wallPublished) {
      toast.error('Despublica el muro para volver a habilitar la subida QR')
      return
    }
    const newValue = !sharedUploadActive
    const payload = normalizeEventConfigPatch(
      newValue ? { share_uploads_enabled: true, allow_uploads: true } : { share_uploads_enabled: false }
    ) satisfies EventConfigPatch
    try {
      const res = await api.put<EventConfig>(eventConfigPath(eventId), payload)
      const updated = readApiData<EventConfig | null>(res.data)
      setShareEnabled(newValue)
      if (newValue) setUploadsEnabled(true)
      if (hasEventConfigCacheIdentity(updated)) {
        await globalMutate(
          eventConfigPath(eventId),
          (current: EventConfig | undefined) => replaceEventConfigCacheValue(current, updated) as EventConfig,
          { revalidate: false }
        )
        await globalMutate(
          (key) => isEventConfigBackedEventCacheKey(key, eventId),
          (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, updated),
          { revalidate: false }
        )
      } else {
        await globalMutate(eventConfigPath(eventId))
        await globalMutate((key) => isEventConfigBackedEventCacheKey(key, eventId))
      }
      notifyPublicContentChanged()
      toast.success(newValue ? 'Subida compartida habilitada' : 'Subida compartida deshabilitada')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Error al actualizar configuración'))
    }
  }

  const uploadUrl = getEventUploadUrl(eventIdentifier)
  const wallUrl = getEventMomentsUrl(eventIdentifier)
  const canSharePublishedWall = wallPublished

  if (isLoading && (!momentPages || momentPages.length === 0)) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-xl" />
        ))}
      </div>
    )
  }

  if (momentsErrorState === 'fatal') {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-12 text-center">
        <ExclamationTriangleIcon className="mx-auto size-10 text-amber-500/60" />
        <p className="mt-4 text-sm font-semibold text-amber-100">No pudimos cargar los momentos del evento.</p>
        <button
          type="button"
          onClick={() => void mutateMomentPages()}
          disabled={isValidating}
          aria-busy={isValidating}
          className="mt-4 text-xs font-semibold text-amber-300 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {isValidating ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {momentsErrorState === 'stale' && (
        <div className="mb-4">
          <StaleDataNotice label="los momentos" onRetry={() => void mutateMomentPages()} retrying={isValidating} />
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/10">
        {/* ── Mobile compact toolbar (hidden on md+) ─────────────────── */}
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 md:hidden">
          {/* Count */}
          <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">{filteredTotal} momentos</span>

          {canManage && (
            <>
              {/* Select mode toggle */}
              <button
                type="button"
                onClick={() => {
                  setSelectMode((v) => !v)
                  setSelectedIds(new Set())
                }}
                className={clsx(
                  'flex size-11 items-center justify-center rounded-xl text-xs font-medium transition-colors',
                  selectMode ? 'bg-indigo-600 text-white' : 'bg-white/10 text-ink-secondary hover:bg-white/15'
                )}
                aria-label={selectMode ? 'Cancelar selección' : 'Seleccionar'}
                aria-pressed={selectMode}
              >
                <CheckIcon className="size-4" aria-hidden="true" />
              </button>

              {/* ZIP download */}
              <button
                type="button"
                onClick={() => setShowZipMenu((v) => !v)}
                disabled={downloadingZip || moments.length === 0}
                className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-ink-secondary transition-colors hover:bg-white/15 disabled:opacity-40"
                aria-label="Descargar ZIP"
              >
                {downloadingZip ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="h-4 w-4" />
                )}
              </button>

              {/* Approve all — only when pending exist and not in selectMode */}
              {pendingCount > 0 && !selectMode && (
                <button
                  type="button"
                  onClick={handleApproveAll}
                  disabled={approvingAll}
                  className="flex size-11 items-center justify-center rounded-xl bg-lime-500/20 text-lime-300 transition-colors hover:bg-lime-500/30 disabled:opacity-40"
                  aria-label="Aprobar todos"
                >
                  {approvingAll ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckIcon className="h-4 w-4" />
                  )}
                </button>
              )}

              {/* Bulk approve/delete when items selected */}
              {selectMode && selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleApproveSelected}
                    disabled={approvingAll}
                    className="flex size-11 items-center justify-center rounded-xl bg-lime-500/20 text-lime-300 transition-colors hover:bg-lime-500/30 disabled:opacity-40"
                    aria-label="Aprobar selección"
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={approvingAll}
                    className="flex size-11 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 transition-colors hover:bg-rose-500/30 disabled:opacity-40"
                    aria-label="Eliminar selección"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* ⋯ More actions */}
              <button
                type="button"
                onClick={() => setShowMoreSheet(true)}
                className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-ink-secondary transition-colors hover:bg-white/15"
                aria-label="Más acciones"
                aria-expanded={showMoreSheet}
              >
                <EllipsisHorizontalIcon className="size-5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Row 1 — Content actions */}
        <div className="hidden flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3 md:flex">
          {/* Counts + badges */}
          <p className="min-w-0 flex-1 text-sm text-ink-secondary">
            {totalMoments} momento{totalMoments !== 1 ? 's' : ''} en total
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
            {autoApproveUploads && (
              <span
                className="ml-2 inline-flex items-center rounded-full bg-lime-500/10 px-2 py-0.5 text-xs font-medium text-lime-400 ring-1 ring-lime-500/20"
                title="Los nuevos momentos se aprueban automáticamente al terminar de procesarse"
              >
                Auto-aprobación activa
              </span>
            )}
            {failedCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 ring-1 ring-rose-500/20">
                {failedCount} con error
              </span>
            )}
            {(photoCount > 0 || videoCount > 0) && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                {photoCount > 0 && (
                  <span>
                    {photoCount} foto{photoCount !== 1 ? 's' : ''}
                  </span>
                )}
                {photoCount > 0 && videoCount > 0 && <span className="text-ink-muted">·</span>}
                {videoCount > 0 && (
                  <span>
                    {videoCount} video{videoCount !== 1 ? 's' : ''}
                  </span>
                )}
              </span>
            )}
          </p>

          {/* Bulk actions */}
          <div className={clsx('flex flex-wrap items-center gap-2', !canManage && 'hidden')}>
            {/* Drag & drop reorder toggle — only for approved flat view */}
            {filter === 'approved' && !groupByTime && (
              <button
                onClick={dragMode ? exitDragMode : enterDragMode}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  dragMode
                    ? 'border-cyan-500/30 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                    : 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
                )}
                title={dragMode ? 'Salir del modo reordenamiento' : 'Reordenar momentos arrastrando'}
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="5" cy="4" r="1.2" />
                  <circle cx="11" cy="4" r="1.2" />
                  <circle cx="5" cy="8" r="1.2" />
                  <circle cx="11" cy="8" r="1.2" />
                  <circle cx="5" cy="12" r="1.2" />
                  <circle cx="11" cy="12" r="1.2" />
                </svg>
                <span className="hidden sm:inline">{dragMode ? 'Salir de reordenar' : 'Reordenar'}</span>
                <span className="sm:hidden">Orden</span>
              </button>
            )}
            {dragMode && (
              <button
                onClick={async () => {
                  const toastId = toast.loading('Restableciendo orden…')
                  try {
                    const payload = orderedMoments.map((m) => ({ id: m.id, order: 0 }))
                    await api.patch(momentsReorderPath(), payload)
                    await mutateMomentPages()
                    notifyPublicContentChanged()
                    toast.success('Orden restablecido', { id: toastId })
                  } catch (err: unknown) {
                    toast.error(getApiErrorMessage(err, 'Error al restablecer'), { id: toastId })
                  }
                  exitDragMode()
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-soft"
                title="Restablecer al orden cronológico original"
              >
                Restablecer orden
              </button>
            )}
            {/* Seleccionar toggle */}
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              title={selectMode ? 'Cancelar selección' : 'Seleccionar momentos'}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                selectMode
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
              )}
            >
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline">{selectMode ? `Cancelar (${selectedIds.size})` : 'Seleccionar'}</span>
            </button>
            {/* Seleccionar todo checkbox */}
            {selectMode && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary select-none">
                <input
                  type="checkbox"
                  className="rounded border-border-subtle bg-surface-raised text-indigo-500 focus:ring-indigo-500"
                  checked={filteredMoments.length > 0 && selectedIds.size === filteredMoments.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filteredMoments.map((m) => m.id)))
                    else setSelectedIds(new Set())
                  }}
                />
                <span className="hidden sm:inline">Seleccionar todo</span>
              </label>
            )}
            {approvedCount > 0 && (
              <div ref={zipMenuRef} className="relative">
                <div className="flex overflow-hidden rounded-lg border border-white/10">
                  <button
                    onClick={() => handleDownloadZip('all')}
                    disabled={downloadingZip}
                    className="flex items-center gap-1.5 bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-soft disabled:opacity-50"
                    title="Descargar todos los momentos aprobados en un ZIP"
                  >
                    {downloadingZip ? (
                      <ArrowPathIcon className="size-3.5 animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="size-3.5" />
                    )}
                    <span className="hidden sm:inline">{downloadingZip ? 'Generando…' : 'Descargar ZIP'}</span>
                    <span className="sm:hidden">ZIP</span>
                  </button>
                  <button
                    onClick={() => setShowZipMenu((v) => !v)}
                    title="Opciones de descarga"
                    aria-label="Opciones de descarga"
                    disabled={downloadingZip}
                    className="flex items-center border-l border-white/10 bg-surface-raised px-2 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-surface-soft disabled:opacity-50"
                  >
                    <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                {showZipMenu && (
                  <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-lg border border-white/10 bg-surface py-1 shadow-xl shadow-black/40">
                    <button
                      onClick={() => handleDownloadZip('all')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-white/5"
                    >
                      <ArrowDownTrayIcon className="size-3.5" /> Todos
                    </button>
                    <button
                      onClick={() => handleDownloadZip('photos')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-white/5"
                    >
                      <ArrowDownTrayIcon className="size-3.5" /> Solo fotos
                    </button>
                    <button
                      onClick={() => handleDownloadZip('videos')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-white/5"
                    >
                      <ArrowDownTrayIcon className="size-3.5" /> Solo vídeos
                    </button>
                  </div>
                )}
              </div>
            )}
            {pendingCount > 0 && (
              <button
                onClick={handleApproveAll}
                disabled={approvingAll}
                className="flex items-center gap-1.5 rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-1.5 text-xs font-medium text-lime-400 transition-colors hover:bg-lime-500/20 disabled:opacity-50"
                title={`Aprobar ${pendingCount} momento${pendingCount !== 1 ? 's' : ''} pendientes`}
              >
                {approvingAll ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">
                  {approvingAll ? 'Aprobando…' : `Aprobar todos (${pendingCount})`}
                </span>
                <span className="sm:hidden">{approvingAll ? '…' : `Aprobar (${pendingCount})`}</span>
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={handleRejectAll}
                disabled={rejectingAll}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                title={`Eliminar ${pendingCount} momento${pendingCount !== 1 ? 's' : ''} pendientes`}
              >
                {rejectingAll ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <XMarkIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">
                  {rejectingAll ? 'Eliminando…' : `Rechazar todos (${pendingCount})`}
                </span>
                <span className="sm:hidden">{rejectingAll ? '…' : `Rechazar (${pendingCount})`}</span>
              </button>
            )}

            {/* Single optimize button — covers legacy (never processed) + oversized (done but too large) */}
            {(legacyCount > 0 || oversizedMoments.length > 0) && (
              <button
                onClick={handleOptimizeAll}
                disabled={optimizing}
                className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
                title={`${legacyCount + oversizedMoments.length} momento${legacyCount + oversizedMoments.length !== 1 ? 's' : ''} por optimizar`}
              >
                {optimizing ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
                <span>{optimizing ? 'Optimizando…' : `Optimizar (${legacyCount + oversizedMoments.length})`}</span>
              </button>
            )}

            {/* Selection bulk actions */}
            {selectMode && selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleApproveSelected}
                  className="flex items-center gap-1.5 rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-1.5 text-xs font-medium text-lime-400 transition-colors hover:bg-lime-500/20"
                >
                  <CheckIcon className="size-3.5" />
                  <span className="hidden sm:inline">Aprobar selección ({selectedIds.size})</span>
                  <span className="sm:hidden">Aprobar ({selectedIds.size})</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/20"
                >
                  <XMarkIcon className="size-3.5" />
                  <span className="hidden sm:inline">Eliminar selección ({selectedIds.size})</span>
                  <span className="sm:hidden">Eliminar ({selectedIds.size})</span>
                </button>
              </>
            )}

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              {isValidating && <ArrowPathIcon className="size-3 animate-spin text-ink-secondary" />}
              <span className="sm:hidden">{isValidating ? '…' : '15s'}</span>
              <span className="hidden sm:inline">{isValidating ? 'Actualizando…' : 'Auto-actualiza cada 15s'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMoreSheet(true)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Abrir herramientas del muro"
              aria-expanded={showMoreSheet}
            >
              <EllipsisHorizontalIcon className="size-4" aria-hidden="true" />
              Herramientas
            </button>
          </div>
        </div>

        {/* Row 2 — Sharing & settings */}
        <div className="hidden">
          <button
            onClick={handleToggleShare}
            disabled={wallPublished}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              sharedUploadActive
                ? 'border-indigo-500/20 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                : sharedUploadClosedByPublishedWall
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                  : 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
            }`}
            title={
              sharedUploadClosedByPublishedWall
                ? 'Subida QR cerrada porque el muro ya está publicado'
                : sharedUploadActive
                  ? 'Subida por QR habilitada — cualquiera con el enlace puede subir'
                  : 'Habilitar subida por QR compartido'
            }
          >
            <QrCodeIcon className="size-3.5" />
            <span className="hidden sm:inline">
              {sharedUploadClosedByPublishedWall
                ? 'QR cerrado por muro publicado'
                : sharedUploadActive
                  ? 'Subida QR activa'
                  : 'Habilitar subida QR'}
            </span>
            <span className="sm:hidden">
              {sharedUploadClosedByPublishedWall ? 'QR cerrado' : sharedUploadActive ? 'QR activo' : 'QR subida'}
            </span>
          </button>
          <button
            onClick={handleTogglePublish}
            title={wallPublished ? 'Muro publicado — visible para los invitados' : 'Publicar muro para invitados'}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              wallPublished
                ? 'border-lime-500/20 bg-lime-500/20 text-lime-400 hover:bg-lime-500/30'
                : 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
            }`}
          >
            <GlobeAltIcon className="size-3.5" />
            <span className="hidden sm:inline">{wallPublished ? 'Muro publicado' : 'Publicar muro'}</span>
            <span className="sm:hidden">{wallPublished ? 'Publicado' : 'Publicar'}</span>
          </button>

          {/* TV mode link */}
          {eventIdentifier && (
            <button
              type="button"
              onClick={handleOpenTvPreview}
              disabled={generatingTvPreview}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-soft hover:text-ink"
              title="Abrir modo TV en nueva pestaña"
              aria-label="Abrir modo TV en nueva pestaña"
            >
              {generatingTvPreview ? (
                <ArrowPathIcon className="size-3.5 animate-spin" />
              ) : (
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
              )}
              <span className="hidden sm:inline">{generatingTvPreview ? 'Generando…' : 'Modo TV'}</span>
            </button>
          )}

          {/* Separator */}
          <div className="hidden h-5 w-px bg-white/10 sm:block" />

          {/* Vista previa admin */}
          <button
            onClick={handleOpenPreview}
            disabled={generatingPreview}
            title={
              wallPublished ? 'Ver el muro publicado (ya es público)' : 'Abrir vista previa — solo visible para ti'
            }
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              wallPublished
                ? 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
                : 'border-violet-500/20 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
            }`}
          >
            {generatingPreview ? <ArrowPathIcon className="size-3.5 animate-spin" /> : <EyeIcon className="size-3.5" />}
            <span className="hidden sm:inline">{generatingPreview ? 'Generando…' : 'Vista previa'}</span>
            <span className="sm:hidden">Preview</span>
          </button>

          {canSharePublishedWall && (
            <a
              href={wallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-soft hover:text-white"
              title="Ver el muro de momentos en eventiapp"
            >
              <ArrowTopRightOnSquareIcon className="size-3.5" />
              <span className="hidden sm:inline">Ver muro</span>
              <span className="sm:hidden">Ver</span>
            </a>
          )}
          <button
            onClick={() => setGroupByTime((v) => !v)}
            title="Agrupar por hora"
            aria-label="Agrupar por hora"
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              groupByTime
                ? 'border-indigo-500/20 bg-indigo-500/20 text-indigo-400'
                : 'border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-soft'
            )}
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Por hora</span>
          </button>
          {canSharePublishedWall && (
            <button
              onClick={() => setShowWallShare(true)}
              className="flex items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/20 px-2.5 py-1.5 text-xs font-medium text-pink-300 transition-colors hover:bg-pink-500/30"
              title="Compartir muro de momentos"
            >
              <ShareIcon className="size-3.5" />
              <span className="hidden sm:inline">Compartir muro</span>
              <span className="sm:hidden">Muro</span>
            </button>
          )}
          {sharedUploadActive && (
            <button
              type="button"
              onClick={handleOpenUploadPreview}
              disabled={generatingUploadPreview}
              className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
              title="Abrir preview de subida en nueva pestaña"
              aria-label="Abrir preview de subida en nueva pestaña"
            >
              {generatingUploadPreview ? (
                <ArrowPathIcon className="size-3.5 animate-spin" />
              ) : (
                <EyeIcon className="size-3.5" />
              )}
              <span className="hidden sm:inline">{generatingUploadPreview ? 'Generando...' : 'Preview subida'}</span>
              <span className="sm:hidden">Preview</span>
            </button>
          )}
          {sharedUploadActive && (
            <button
              onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/20 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-600/30"
              title="Generar QR para subida compartida"
            >
              <QrCodeIcon className="size-3.5" />
              <span className="hidden sm:inline">QR de subida</span>
              <span className="sm:hidden">QR</span>
            </button>
          )}
        </div>

        {/* Row 3 — Filters */}
        <div
          role="group"
          aria-label="Filtrar momentos"
          className="flex gap-1 overflow-x-auto border-t border-white/[0.04] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              { value: 'all', label: 'Todos', count: moments.length },
              { value: 'pending', label: 'Pendientes', count: pendingCount },
              { value: 'approved', label: 'Aprobados', count: approvedCount },
              ...(photoCount > 0 ? [{ value: 'photos', label: 'Fotos', count: photoCount }] : []),
              ...(videoCount > 0 ? [{ value: 'videos', label: 'Videos', count: videoCount }] : []),
              ...(notesCount > 0 ? [{ value: 'notes', label: 'Notas', count: notesCount }] : []),
            ] as const
          ).map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value as typeof filter)}
              className={clsx(
                'min-h-10 flex-shrink-0 rounded-lg px-3 py-2 text-center text-xs font-medium whitespace-nowrap transition-colors sm:flex-1',
                filter === f.value
                  ? 'bg-indigo-400/15 text-indigo-100 ring-1 ring-indigo-300/20'
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink'
              )}
            >
              {f.label}
              {f.count > 0 && (
                <span
                  className={clsx(
                    'ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    filter === f.value ? 'bg-white/20' : 'bg-surface-raised text-ink-muted'
                  )}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Row 4 — Time range filter */}
        <div className="flex items-center gap-2 border-t border-white/5 px-1 py-2">
          <span className="shrink-0 text-[11px] text-ink-muted">Hora:</span>
          <input
            type="time"
            value={timeRange?.from ?? ''}
            onChange={(e) => {
              const from = e.target.value
              if (!from) {
                // Clear only the "from" bound; keep "to" if set
                setTimeRange((prev) => (prev?.to ? { from: '00:00', to: prev.to } : null))
                return
              }
              setTimeRange((prev) => ({ from, to: prev?.to ?? '23:59' }))
            }}
            className="rounded border border-white/10 bg-surface-raised px-2 py-0.5 text-xs text-ink-secondary"
            aria-label="Desde hora"
          />
          <span className="text-[11px] text-ink-muted">–</span>
          <input
            type="time"
            value={timeRange?.to ?? ''}
            onChange={(e) => {
              const to = e.target.value
              if (!to) {
                // Clear only the "to" bound; keep "from" if set
                setTimeRange((prev) => (prev?.from ? { from: prev.from, to: '23:59' } : null))
                return
              }
              setTimeRange((prev) => ({ from: prev?.from ?? '00:00', to }))
            }}
            className="rounded border border-white/10 bg-surface-raised px-2 py-0.5 text-xs text-ink-secondary"
            aria-label="Hasta hora"
          />
          {timeRange && (
            <button
              type="button"
              onClick={() => setTimeRange(null)}
              className="ml-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-[11px] text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-secondary"
              aria-label="Limpiar filtro de hora"
            >
              <XMarkIcon className="size-3.5" aria-hidden="true" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <BottomSheet isOpen={showMoreSheet} onClose={() => setShowMoreSheet(false)} title="Herramientas del muro">
          {pendingCount > 0 && (
            <SheetRow
              icon={<XMarkIcon className="h-4 w-4" />}
              label={`Rechazar todos (${pendingCount} pendientes)`}
              variant="danger"
              disabled={rejectingAll}
              onClick={() => {
                setShowMoreSheet(false)
                handleRejectAll()
              }}
            />
          )}
          <SheetRow
            icon={<QrCodeIcon className="h-4 w-4" />}
            label="QR de carga"
            trailing={
              <span
                className={clsx(
                  'text-xs font-medium',
                  sharedUploadActive
                    ? 'text-lime-400'
                    : sharedUploadClosedByPublishedWall
                      ? 'text-amber-300'
                      : 'text-ink-muted'
                )}
              >
                {sharedUploadActive ? 'Activo' : sharedUploadClosedByPublishedWall ? 'Cerrado' : 'Inactivo'}
              </span>
            }
            disabled={wallPublished}
            onClick={() => {
              setShowMoreSheet(false)
              if (sharedUploadActive) {
                setShowQR(true)
              } else {
                void handleToggleShare()
              }
            }}
          />
          <SheetRow
            icon={<GlobeAltIcon className="h-4 w-4" />}
            label="Publicar muro"
            trailing={
              <span className={clsx('text-xs font-medium', wallPublished ? 'text-lime-400' : 'text-ink-muted')}>
                {wallPublished ? 'Publicado' : 'Oculto'}
              </span>
            }
            onClick={() => {
              setShowMoreSheet(false)
              handleTogglePublish()
            }}
          />
          {canSharePublishedWall && (
            <SheetRow
              icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
              label="Ver muro público"
              onClick={() => {
                setShowMoreSheet(false)
                window.open(wallUrl, '_blank')
              }}
            />
          )}
          <SheetRow
            icon={<EyeIcon className="h-4 w-4" />}
            label={generatingPreview ? 'Generando preview…' : 'Vista previa (solo tú)'}
            disabled={generatingPreview}
            onClick={() => {
              setShowMoreSheet(false)
              handleOpenPreview()
            }}
          />
          {eventIdentifier && (
            <SheetRow
              icon={<ComputerDesktopIcon className="size-4" />}
              label={generatingTvPreview ? 'Generando modo TV…' : 'Modo TV'}
              disabled={generatingTvPreview}
              onClick={() => {
                setShowMoreSheet(false)
                handleOpenTvPreview()
              }}
            />
          )}
          <SheetRow
            icon={<ClockIcon className="size-4" />}
            label="Agrupar por hora"
            trailing={
              <span className={clsx('text-xs font-medium', groupByTime ? 'text-indigo-400' : 'text-ink-muted')}>
                {groupByTime ? 'Activo' : 'Inactivo'}
              </span>
            }
            onClick={() => {
              setShowMoreSheet(false)
              setGroupByTime((v) => !v)
            }}
          />
          {canSharePublishedWall && (
            <SheetRow
              icon={<ShareIcon className="h-4 w-4" />}
              label="Compartir muro"
              onClick={() => {
                setShowMoreSheet(false)
                setShowWallShare(true)
              }}
            />
          )}
          {(legacyCount > 0 || oversizedMoments.length > 0) && (
            <SheetRow
              icon={<ArrowPathIcon className="h-4 w-4" />}
              label={`Optimizar (${legacyCount + oversizedMoments.length})`}
              disabled={optimizing}
              onClick={() => {
                setShowMoreSheet(false)
                handleOptimizeAll()
              }}
            />
          )}
        </BottomSheet>
      )}

      {/* ── Failed moments section ──────────────────────────────────────── */}
      <AnimatePresence>
        {failedMoments.length > 0 && (
          <FailedSection moments={failedMoments} resolveUrl={resolveUrl} onRetried={refreshMomentStreams} />
        )}
      </AnimatePresence>

      {/* ── New uploads being optimized ───────────────────────────────── */}
      <AnimatePresence>{inFlightMoments.length > 0 && <InFlightSection moments={inFlightMoments} />}</AnimatePresence>

      {/* ── Re-optimization in-flight section ────────────────────────── */}
      <AnimatePresence>
        {reoptimizingMoments.length > 0 && (
          <ReoptimizingSection moments={reoptimizingMoments} resolveUrl={resolveUrl} />
        )}
      </AnimatePresence>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div>
        {filteredMoments.length === 0 && totalMoments === 0 ? (
          /* Coming soon / empty wall hero */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-surface via-surface/95 to-surface-raised/80 p-8 text-center sm:p-12"
          >
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-pink-500/20 bg-pink-500/10">
              <SparklesIcon className="size-8 text-pink-400" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-ink sm:text-xl">El muro de momentos está listo</h3>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-ink-secondary">
              Cuando los invitados compartan fotos y videos, aparecerán aquí para que los apruebes y se muestren en el
              muro público del evento.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              {sharedUploadActive && (
                <button
                  onClick={() => setShowQR(true)}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-500"
                >
                  <QrCodeIcon className="size-4" />
                  Compartir QR de subida
                </button>
              )}
              {canSharePublishedWall ? (
                <button
                  onClick={() => setShowWallShare(true)}
                  className="flex items-center gap-2 rounded-xl border border-pink-500/30 bg-pink-500/10 px-5 py-2.5 text-sm font-medium text-pink-300 transition-colors hover:bg-pink-500/20"
                >
                  <GlobeAltIcon className="size-4" />
                  Ver enlace del muro
                </button>
              ) : (
                <button
                  onClick={handleOpenPreview}
                  disabled={generatingPreview}
                  className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
                >
                  {generatingPreview ? (
                    <ArrowPathIcon className="size-4 animate-spin" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                  {generatingPreview ? 'Generando preview...' : 'Vista previa del muro'}
                </button>
              )}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-2 opacity-30 sm:grid-cols-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl border border-white/5 bg-surface-raised/60" />
              ))}
            </div>
            <p className="mt-3 text-[10px] tracking-wide text-ink-muted uppercase">
              Pronto se llenará de momentos increíbles
            </p>
          </motion.div>
        ) : isDiscoveringFilteredMoments ? (
          <div
            className="rounded-2xl border border-white/10 bg-surface/70 px-6 py-10 text-center"
            role="status"
            aria-live="polite"
          >
            <ArrowPathIcon className="mx-auto mb-3 size-6 animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-ink">Buscando resultados en el resto de la colección...</p>
            <p className="mt-1 text-xs text-ink-muted">
              Cargamos la siguiente página porque este filtro tiene {filteredTotal} resultado
              {filteredTotal !== 1 ? 's' : ''}.
            </p>
          </div>
        ) : filteredMoments.length === 0 ? (
          <EmptyState
            icon={PhotoIcon}
            title="Sin momentos"
            description={
              filter === 'pending'
                ? 'No hay momentos pendientes de aprobación.'
                : filter === 'approved'
                  ? 'Aún no hay momentos aprobados.'
                  : filter === 'failed'
                    ? 'No hay momentos con error de procesamiento.'
                    : filter === 'notes'
                      ? 'Ningún invitado ha dejado notas todavía.'
                      : 'Los invitados aún no han compartido momentos, o están siendo procesados por Lambda.'
            }
          />
        ) : filter === 'notes' ? (
          /* Notes list view */
          <motion.div className="space-y-2" layout>
            <AnimatePresence>
              {visibleMoments.map((moment) => (
                <NoteCard
                  key={moment.id}
                  moment={moment}
                  canManage={canManage}
                  onApprove={handleApprove}
                  onDelete={handleDelete}
                  resolveUrl={resolveUrl}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : groupByTime ? (
          /* Grouped view */
          <div className="space-y-6">
            {groupByTimeBuckets(visibleMoments).map(({ label, items }) => (
              <div key={label}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-medium text-ink-muted tabular-nums">{label}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <motion.div
                  className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5 md:grid-cols-4 xl:grid-cols-5"
                  layout
                >
                  <AnimatePresence>
                    {items.map((moment) => (
                      <MomentCard
                        key={moment.id}
                        moment={moment}
                        canManage={canManage}
                        onApprove={handleApprove}
                        onUnapprove={handleUnapprove}
                        onDelete={handleDelete}
                        onOpenLightbox={handleOpenLightbox}
                        resolveUrl={resolveUrl}
                        selectMode={selectMode}
                        selected={selectedIds.has(moment.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
            ))}
          </div>
        ) : /* Flat grid — with optional drag-and-drop reorder */
        dragMode ? (
          <MomentDragGrid
            moments={orderedMoments}
            onOrderChange={setOrderedMoments}
            renderCard={(moment) => (
              <MomentCard
                moment={moment}
                canManage={canManage}
                onApprove={handleApprove}
                onUnapprove={handleUnapprove}
                onDelete={handleDelete}
                onOpenLightbox={handleOpenLightbox}
                resolveUrl={resolveUrl}
                selectMode={false}
                selected={false}
                onToggleSelect={toggleSelect}
              />
            )}
          />
        ) : (
          <motion.div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5 md:grid-cols-4 xl:grid-cols-5" layout>
            <AnimatePresence>
              {visibleMoments.map((moment) => (
                <MomentCard
                  key={moment.id}
                  moment={moment}
                  canManage={canManage}
                  onApprove={handleApprove}
                  onUnapprove={handleUnapprove}
                  onDelete={handleDelete}
                  onOpenLightbox={handleOpenLightbox}
                  resolveUrl={resolveUrl}
                  selectMode={selectMode}
                  selected={selectedIds.has(moment.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── Load more ───────────────────────────────────────────────────── */}
      {(visibleCount < filteredMoments.length || hasMoreMomentPages) && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted">
            Mostrando {Math.min(visibleCount, filteredMoments.length)} de {filteredTotal} momentos
          </p>
          <button
            onClick={() => {
              if (visibleCount >= filteredMoments.length && hasMoreMomentPages) {
                void setMomentPageCount((count) => count + 1)
              }
              setVisibleCount((count) => count + VISIBLE_PAGE)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-soft"
          >
            {isValidating
              ? 'Cargando...'
              : `Mostrar ${Math.min(VISIBLE_PAGE, Math.max(0, filteredTotal - visibleCount))} más`}
          </button>
        </div>
      )}

      {/* ── Lightbox portal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxIndex !== null && lightboxMoments.length > 0 && (
          <Lightbox
            moments={lightboxMoments}
            index={lightboxIndex}
            canManage={canManage}
            resolveUrl={resolveUrl}
            onClose={() => setLightboxIndex(null)}
            onNext={() => setLightboxIndex((i) => ((i ?? 0) + 1) % lightboxMoments.length)}
            onPrev={() => setLightboxIndex((i) => ((i ?? 0) - 1 + lightboxMoments.length) % lightboxMoments.length)}
            onApprove={handleApprove}
            onUnapprove={handleUnapprove}
            onDelete={handleDelete}
          />
        )}
      </AnimatePresence>

      {/* ── QR portal ───────────────────────────────────────────────────── */}
      <AnimatePresence>{showQR && <QRModal url={uploadUrl} onClose={() => setShowQR(false)} />}</AnimatePresence>

      {/* ── Wall share portal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showWallShare && canSharePublishedWall && (
          <WallShareModal
            wallUrl={wallUrl}
            uploadUrl={sharedUploadActive ? uploadUrl : undefined}
            onClose={() => setShowWallShare(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmAlert
        open={Boolean(confirmation)}
        title={
          confirmation?.kind === 'toggle-publish'
            ? confirmation.publish
              ? '¿Publicar el muro?'
              : '¿Despublicar el muro?'
            : confirmation?.kind === 'delete-one'
              ? '¿Eliminar este momento?'
              : confirmation?.kind === 'delete-selected'
                ? `¿Eliminar ${confirmation.count} momento${confirmation.count !== 1 ? 's' : ''}?`
                : `¿Eliminar ${confirmation?.count ?? 0} momento${confirmation?.count !== 1 ? 's' : ''} pendientes?`
        }
        description={
          confirmation?.kind === 'toggle-publish'
            ? confirmation.publish
              ? 'El muro será visible y se cerrará la subida de fotos para los invitados.'
              : 'El muro dejará de ser visible y los invitados podrán volver a subir fotos.'
            : 'Los archivos desaparecerán permanentemente. Esta acción no se puede deshacer.'
        }
        confirmLabel={
          confirmation?.kind === 'toggle-publish'
            ? confirmation.publish
              ? 'Publicar muro'
              : 'Despublicar muro'
            : 'Eliminar momentos'
        }
        tone={confirmation?.kind === 'toggle-publish' ? 'primary' : 'danger'}
        busy={confirmationBusy}
        onClose={() => setConfirmation(null)}
        onConfirm={confirmPendingAction}
      />
    </div>
  )
}
