'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR, { mutate as globalMutate } from 'swr'
import { motion, AnimatePresence } from 'motion/react'

import Image from 'next/image'
import { api } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'
import { toast } from 'sonner'
import type { Moment } from '@/models/Moment'
import { EmptyState } from '@/components/ui/empty-state'
import { BrandedQR } from '@/components/ui/branded-qr'
import clsx from 'clsx'
import { useLazyVisible } from '@/hooks/useLazyVisible'
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'
import {
  PhotoIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  QrCodeIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ShareIcon,
  SparklesIcon,
  GlobeAltIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleOvalLeftIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline'

const REFRESH_INTERVAL = 15_000
const VISIBLE_PAGE = 40

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
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
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

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(url)
}

function processingLabel(status: Moment['processing_status']): string {
  switch (status) {
    case 'pending':     return 'En cola'
    case 'processing':  return 'Procesando…'
    case 'failed':      return 'Error al procesar'
    default:            return ''
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
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }))
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

interface LightboxProps {
  moments: Moment[]
  index: number
  onClose: () => void
  onNext: () => void
  onPrev: () => void
  resolveUrl: (m: Moment) => string
}

function Lightbox({ moments, index, onClose, onNext, onPrev, resolveUrl }: LightboxProps) {
  const [scale, setScale] = useState(1)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)
  const moment = moments[index]
  const url = resolveUrl(moment)
  const video = isVideo(url)

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') { setScale(1); onNext() }
      if (e.key === 'ArrowLeft')  { setScale(1); onPrev() }
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
      const res = await api.get(`/moments/${moment.id}/download`, { responseType: 'blob' })
      const key = moment.content_url ?? url
      const extMatch = key.match(/\.(\w{2,5})(?:\?|$)/)
      const ext = extMatch?.[1] ?? 'jpg'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(res.data)
      a.download = `momento-${moment.id}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Error al descargar archivo')
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
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs sm:text-sm text-white/70 min-w-0 truncate">
          {index + 1} / {moments.length}
          {moment.description && (
            <span className="hidden sm:inline ml-3 text-white/50 italic line-clamp-1 max-w-xs sm:max-w-sm">
              &ldquo;{moment.description}&rdquo;
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!video && (
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Alejar"
              >
                <MagnifyingGlassMinusIcon className="size-5" />
              </button>
              <button
                onClick={() => setScale((s) => Math.min(4, s + 0.25))}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Acercar"
              >
                <MagnifyingGlassPlusIcon className="size-5" />
              </button>
            </div>
          )}
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Descargar"
          >
            <ArrowDownTrayIcon className="size-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Cerrar (Esc)"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>
      </div>

      {/* Prev — hidden on mobile, use swipe instead */}
      {moments.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setScale(1); onPrev() }}
          className="hidden sm:block absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
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
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl"
          />
        ) : (
          <img
            src={url}
            alt="Momento del evento"
            className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl object-contain"
          />
        )}
      </motion.div>

      {/* Note / description from guest */}
      {moment.description && (
        <div className="absolute bottom-16 left-4 right-4 z-20 pointer-events-none">
          <div className="flex items-start gap-2 rounded-xl bg-black/70 backdrop-blur-md px-3 py-2.5 ring-1 ring-white/10">
            <ChatBubbleOvalLeftIcon className="size-4 text-white/50 shrink-0 mt-0.5" />
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">{moment.description}</p>
          </div>
        </div>
      )}

      {/* Next — hidden on mobile, use swipe instead */}
      {moments.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setScale(1); onNext() }}
          className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
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

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
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

        <div className="space-y-2 pt-1 w-full">
          <p className="text-xs text-zinc-500 break-all text-center px-2">{url}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
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

function WallShareModal({ wallUrl, uploadUrl, onClose }: { wallUrl: string; uploadUrl: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'wall' | 'upload'>('wall')
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  const activeUrl = activeTab === 'wall' ? wallUrl : uploadUrl

  const copy = async () => {
    await navigator.clipboard.writeText(activeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        >
          <XMarkIcon className="size-4" />
        </button>

        {/* Tab bar */}
        <div className="flex w-full rounded-lg overflow-hidden border border-white/10">
          {([
            { key: 'wall',   label: 'Ver muro' },
            { key: 'upload', label: 'Subir fotos' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCopied(false) }}
              className={clsx(
                'flex-1 py-2 text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* QR for active tab */}
        <BrandedQR
          value={activeUrl}
          title={activeTab === 'wall' ? 'Muro de Momentos' : 'Subir Fotos'}
          subtitle={activeTab === 'wall' ? 'Escanea para ver los mejores momentos' : 'Escanea para subir fotos y videos'}
          downloadName={activeTab === 'wall' ? 'qr-muro-momentos' : 'qr-subida-momentos'}
          size={180}
          dark
        />

        {/* URL + actions */}
        <div className="space-y-2 pt-1 w-full">
          <p className="text-xs text-zinc-500 break-all text-center px-2">{activeUrl}</p>
          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            onClick={copy}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-medium transition-colors',
              activeTab === 'wall'
                ? 'bg-pink-500 hover:bg-pink-400'
                : 'bg-indigo-600 hover:bg-indigo-500',
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

// ─── Processing status badge ──────────────────────────────────────────────────

function ProcessingBadge({ status }: { status: Moment['processing_status'] }) {
  if (!status || status === 'done') return null
  const colors: Record<string, string> = {
    pending:    'bg-sky-500/15 text-sky-400 ring-sky-500/25',
    processing: 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/25',
    failed:     'bg-rose-500/15 text-rose-400 ring-rose-500/25',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${colors[status] ?? ''}`}>
      {status === 'processing' && <ArrowPathIcon className="size-3 animate-spin" />}
      {status === 'failed' && <ExclamationTriangleIcon className="size-3" />}
      {processingLabel(status)}
    </span>
  )
}

// ─── Moment Card ──────────────────────────────────────────────────────────────

interface MomentCardProps {
  moment: Moment
  onApprove: (m: Moment) => Promise<void>
  onUnapprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
  onOpenLightbox: (m: Moment) => void
  resolveUrl: (m: Moment) => string
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const MomentCard = memo(function MomentCard({ moment, onApprove, onUnapprove, onDelete, onOpenLightbox, resolveUrl, selectMode, selected, onToggleSelect }: MomentCardProps) {
  const [actioning, setActioning] = useState<'approve' | 'unapprove' | 'delete' | null>(null)
  const url = resolveUrl(moment)
  const hasMedia = !!url
  const video = hasMedia && isVideo(url)
  const isProcessing = moment.processing_status === 'pending' || moment.processing_status === 'processing'
  const isFailed = moment.processing_status === 'failed'
  const approved = moment.is_approved
  const { ref: lazyRef, visible } = useLazyVisible()

  // Extract first frame for videos without a server-generated thumbnail
  const extractedThumb = useVideoThumbnail(
    video && !moment.thumbnail_url ? url : null
  )

  return (
    <motion.div
      ref={lazyRef}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-xl overflow-hidden bg-zinc-900 group aspect-square"
    >
      {/* ── Select mode overlay ─────────────────────────── */}
      {selectMode && (
        <div
          className="absolute inset-0 z-20 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(moment.id) }}
        >
          <div className={clsx(
            'absolute top-2 right-2 size-6 rounded-full border-2 flex items-center justify-center transition-colors',
            selected
              ? 'bg-indigo-500 border-indigo-400'
              : 'bg-black/40 border-white/40 backdrop-blur-sm',
          )}>
            {selected && <CheckIcon className="size-3.5 text-white" />}
          </div>
          {selected && (
            <div className="absolute inset-0 bg-indigo-500/20 border-2 border-indigo-400/60 rounded-xl" />
          )}
        </div>
      )}
      {/* ── Media area ─────────────────────────────────────── */}
      {visible ? (
        isProcessing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 gap-3">
            <ArrowPathIcon className="size-8 text-indigo-400 animate-spin opacity-60" />
            <p className="text-xs text-zinc-500 text-center px-4">{processingLabel(moment.processing_status)}</p>
          </div>
        ) : isFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/40 gap-2 p-4">
            <ExclamationTriangleIcon className="size-8 text-rose-500 opacity-70" />
            <p className="text-xs text-rose-400 text-center">Error al procesar</p>
            <button
              onClick={async () => {
                try {
                  await api.put(`/moments/${moment.id}/requeue`, {})
                  toast.success('Reintentando…')
                } catch {
                  toast.error('No se pudo reintentar.')
                }
              }}
              className="flex items-center gap-1 text-xs text-rose-300 hover:text-rose-100 underline underline-offset-2"
            >
              <ArrowPathIcon className="size-3" /> Reintentar
            </button>
          </div>
        ) : video ? (
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => { if (!selectMode) onOpenLightbox(moment) }}
          >
            {moment.thumbnail_url ? (
              <img
                src={moment.thumbnail_url}
                alt="Video momento"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              extractedThumb ? (
                <img
                  src={extractedThumb}
                  alt="Video momento"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                  <div className="flex items-center justify-center size-14 rounded-full bg-black/50 ring-1 ring-white/20">
                    <svg className="size-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.14v14l11-7-11-7z" />
                    </svg>
                  </div>
                </div>
              )
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div className="flex items-center justify-center size-12 rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/20 opacity-80 group-hover:opacity-100 transition-opacity">
                <svg className="size-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </div>
            </div>
          </div>
        ) : hasMedia ? (
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => !selectMode && onOpenLightbox(moment)}
          >
            <Image
              src={url}
              alt="Momento del evento"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>
        ) : moment.description ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800/80 to-zinc-900 p-5">
            <p className="text-sm text-zinc-300 text-center leading-relaxed italic line-clamp-6">
              &ldquo;{moment.description}&rdquo;
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50">
            <PhotoIcon className="size-10 text-zinc-600" />
          </div>
        )
      ) : (
        <div className="absolute inset-0 bg-zinc-800/40 animate-pulse rounded-xl" />
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

      {/* ── Description chip — above action bar, only when card has media ── */}
      {hasMedia && moment.description && !isProcessing && !isFailed && (
        <div className="absolute bottom-12 left-2 right-2 z-10 pointer-events-none sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity sm:duration-200">
          <span className="inline-flex items-center gap-1 max-w-full rounded-full bg-black/65 backdrop-blur-sm px-2.5 py-1 text-[10px] text-white/75 ring-1 ring-white/10">
            <ChatBubbleOvalLeftIcon className="size-3 shrink-0 text-white/50 flex-none" />
            <span className="truncate">{moment.description}</span>
          </span>
        </div>
      )}

      {/* ── Action bar (bottom overlay) ─────────────────────────
           Always visible on mobile. Fade+slide in on desktop hover. */}
      {!isProcessing && (
        <div className={clsx(
          'absolute bottom-0 left-0 right-0 z-10',
          'flex items-stretch',
          'bg-gradient-to-t from-black/80 via-black/50 to-transparent backdrop-blur-[2px]',
          'transition-all duration-200',
          'sm:opacity-0 sm:translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0',
        )}>
          {!approved && !isFailed && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setActioning('approve')
                await onApprove(moment)
                setActioning(null)
              }}
              disabled={actioning !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs font-semibold text-lime-300 hover:bg-lime-500/20 transition-colors disabled:opacity-40"
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
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
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
              'flex items-center justify-center gap-1.5 py-3.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40',
              approved || isFailed ? 'flex-1' : 'px-4',
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
  onApprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
  resolveUrl: (m: Moment) => string
}

function NoteCard({ moment, onApprove, onDelete, resolveUrl }: NoteCardProps) {
  const [actioning, setActioning] = useState<'approve' | 'delete' | null>(null)
  const url = resolveUrl(moment)
  const video = url && isVideo(url)
  const approved = moment.is_approved

  const timeLabel = new Date(moment.created_at).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-4 rounded-xl border border-white/8 bg-zinc-900/70 p-4 hover:bg-zinc-900 transition-colors"
    >
      {/* Thumbnail — media preview */}
      {url && (
        <div className="shrink-0 size-14 rounded-lg overflow-hidden bg-zinc-800 ring-1 ring-white/8">
          {video ? (
            <div className="size-full flex items-center justify-center bg-zinc-800">
              <svg className="size-5 text-zinc-400 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </div>
          ) : (
            <Image
              src={url}
              alt="Momento"
              width={56}
              height={56}
              className="size-full object-cover"
            />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-semibold text-lime-300 ring-1 ring-lime-500/25">
              <CheckIcon className="size-2.5" /> Aprobado
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/25">
              Pendiente
            </span>
          )}
          <span className="text-[10px] text-zinc-600 tabular-nums">{timeLabel}</span>
        </div>

        <p className="text-sm text-zinc-200 leading-relaxed italic whitespace-pre-wrap break-words">
          &ldquo;{moment.description}&rdquo;
        </p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-1.5">
        {!approved && (
          <button
            onClick={async () => {
              setActioning('approve')
              await onApprove(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            title="Aprobar nota"
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-lime-300 bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/20 transition-colors disabled:opacity-40"
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
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors disabled:opacity-40"
        >
          {actioning === 'delete' ? (
            <ArrowPathIcon className="size-3.5 animate-spin" />
          ) : (
            <XMarkIcon className="size-3.5" />
          )}
          <span className="hidden sm:inline">Eliminar</span>
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main Wall ────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  /** Used to construct the shared upload URL for QR code */
  eventIdentifier: string
  /** Displayed in the QR modal heading */
  eventName?: string
  /** When false, hides the QR upload button. Defaults to true. */
  shareUploadsEnabled?: boolean
  /** Whether the moments wall is published (closes uploads for guests) */
  momentsWallPublished?: boolean
}

export function MomentsWall({ eventId, eventIdentifier, eventName, shareUploadsEnabled, momentsWallPublished }: Props) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'failed' | 'photos' | 'videos' | 'notes'>('all')
  const [wallPublished, setWallPublished] = useState(momentsWallPublished ?? false)
  const [shareEnabled, setShareEnabled] = useState(shareUploadsEnabled ?? false)

  useEffect(() => { setWallPublished(momentsWallPublished ?? false) }, [momentsWallPublished])
  useEffect(() => { setShareEnabled(shareUploadsEnabled ?? false) }, [shareUploadsEnabled])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [showWallShare, setShowWallShare] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [showZipMenu, setShowZipMenu] = useState(false)
  const zipMenuRef = useRef<HTMLDivElement>(null)

  const swrKey = eventId ? `/moments?event_id=${eventId}` : null
  const { data: moments = [], isLoading, isValidating } = useSWR<Moment[]>(swrKey, fetcher, {
    revalidateOnFocus: false,
    // Poll every 15s so newly optimized moments appear automatically
    refreshInterval: REFRESH_INTERVAL,
  })

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

  // S3 URLs are presigned — content_url may be a full URL or a key.
  // If it's a key (no "http"), we serve it as-is (backend should return presigned URLs).
  const resolveUrl = useCallback((m: Moment) => m.content_url ?? '', [])

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
    const filteredMoments = moments.filter((m) => {
      if (filter === 'pending')  return !m.is_approved && m.processing_status !== 'failed'
      if (filter === 'approved') return m.is_approved
      if (filter === 'failed')   return m.processing_status === 'failed'
      if (filter === 'photos')   return m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m))
      if (filter === 'videos')   return m.is_approved && !!resolveUrl(m) && isVideo(resolveUrl(m))
      if (filter === 'notes')    return !!m.description?.trim()
      return true
    })

    const pendingCount  = moments.filter((m) => !m.is_approved && m.processing_status !== 'failed').length
    const approvedCount = moments.filter((m) => m.is_approved).length
    const failedCount   = moments.filter((m) => m.processing_status === 'failed').length
    const photoCount    = moments.filter((m) => m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m))).length
    const videoCount    = moments.filter((m) => m.is_approved && !!resolveUrl(m) && isVideo(resolveUrl(m))).length
    const notesCount    = moments.filter((m) => !!m.description?.trim()).length
    // Moments that never went through Lambda (legacy direct uploads)
    const legacyCount   = moments.filter((m) => m.processing_status === '').length

    // Moments eligible for lightbox (media present + not processing)
    const lightboxMoments = filteredMoments.filter((m) =>
      !!resolveUrl(m) && m.processing_status !== 'pending' && m.processing_status !== 'processing'
    )

    return { filteredMoments, lightboxMoments, pendingCount, approvedCount, failedCount, photoCount, videoCount, notesCount, legacyCount }
  }, [moments, filter, resolveUrl])

  const handleApprove = useCallback(async (moment: Moment) => {
    // Optimistic: mark as approved immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.map((m) => m.id === moment.id ? { ...m, is_approved: true } : m),
      { revalidate: false }
    )
    try {
      await api.put(`/moments/${moment.id}`, { ...moment, is_approved: true })
      await globalMutate(swrKey)
      toast.success('Momento aprobado')
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al aprobar el momento')
    }
  }, [swrKey])

  const handleUnapprove = useCallback(async (moment: Moment) => {
    // Optimistic: mark as pending immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.map((m) => m.id === moment.id ? { ...m, is_approved: false } : m),
      { revalidate: false }
    )
    try {
      await api.put(`/moments/${moment.id}`, { ...moment, is_approved: false })
      await globalMutate(swrKey)
      toast.success('Momento desaprobado')
    } catch {
      await globalMutate(swrKey)
      toast.error('Error al desaprobar el momento')
    }
  }, [swrKey])

  const handleDelete = useCallback(async (moment: Moment) => {
    if (!window.confirm('¿Eliminar este momento? Esta acción no se puede deshacer.')) return
    // Optimistic: remove from list immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.filter((m) => m.id !== moment.id),
      { revalidate: false }
    )
    try {
      await api.delete(`/moments/${moment.id}`)
      await globalMutate(swrKey)
      toast.success('Momento eliminado')
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al eliminar el momento')
    }
  }, [swrKey])

  const handleOpenLightbox = (m: Moment) => {
    const idx = lightboxMoments.findIndex((x) => x.id === m.id)
    if (idx !== -1) setLightboxIndex(idx)
  }

  const handleDownloadZip = async (typeFilter: 'all' | 'photos' | 'videos' = 'all') => {
    const JSZip = (await import('jszip')).default
    const approved = moments.filter((m) => {
      if (!m.is_approved || !resolveUrl(m)) return false
      if (typeFilter === 'photos') return !isVideo(resolveUrl(m))
      if (typeFilter === 'videos') return isVideo(resolveUrl(m))
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
    try {
      const zip = new JSZip()
      const folder = zip.folder('momentos') ?? zip
      await Promise.all(
        approved.map(async (m, i) => {
          try {
            const res = await api.get(`/moments/${m.id}/download`, { responseType: 'blob' })
            // Verify we actually got a blob, not an error object
            if (!(res.data instanceof Blob) || res.data.size === 0) {
              failed++
              return
            }
            const key = m.content_url ?? ''
            const extMatch = key.match(/\.(\w{2,5})(?:\?|$)/)
            const ext = extMatch?.[1] ?? (isVideo(key) ? 'mp4' : 'jpg')
            folder.file(`momento-${String(i + 1).padStart(3, '0')}.${ext}`, res.data)
            succeeded++
          } catch (err) {
            console.warn(`[ZIP] Failed to download moment ${m.id}:`, err)
            failed++
          }
        })
      )
      if (succeeded === 0) {
        toast.error('No se pudo descargar ningún archivo. Intenta de nuevo.')
        return
      }
      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
      const suffix = typeFilter === 'photos' ? '-fotos' : typeFilter === 'videos' ? '-videos' : ''
      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = `momentos-${eventIdentifier}${suffix}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      if (failed > 0) {
        toast.success(`${succeeded} archivos descargados (${failed} fallaron)`)
      } else {
        toast.success(`${succeeded} archivos descargados`)
      }
    } catch {
      toast.error('Error al generar el ZIP')
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
  useEffect(() => { setVisibleCount(VISIBLE_PAGE) }, [filter, groupByTime])
  const visibleMoments = filteredMoments.slice(0, visibleCount)

  // ─── Bulk requeue (legacy moments never processed by Lambda) ─────────────
  const [requeuingLegacy, setRequeuingLegacy] = useState(false)
  const handleRequeueLegacy = async () => {
    const legacy = moments.filter((m) => m.processing_status === '')
    if (legacy.length === 0) return
    if (!window.confirm(
      `¿Reoptimizar ${legacy.length} momento${legacy.length !== 1 ? 's' : ''} sin procesar?\n\nSe reenviarán a Lambda para compresión y optimización.`
    )) return
    setRequeuingLegacy(true)
    let succeeded = 0
    for (const m of legacy) {
      try {
        await api.put(`/moments/${m.id}/requeue`, {})
        succeeded++
      } catch {
        // continue with the rest
      }
    }
    await globalMutate(swrKey)
    setRequeuingLegacy(false)
    toast.success(`${succeeded} momento${succeeded !== 1 ? 's' : ''} enviados a optimizar`)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
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
    const toApprove = moments.filter(m => selectedIds.has(m.id) && !m.is_approved)
    if (toApprove.length === 0) return
    const approveIds = new Set(toApprove.map(m => m.id))
    // Optimistic: mark selected as approved immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.map((m) => approveIds.has(m.id) ? { ...m, is_approved: true } : m),
      { revalidate: false }
    )
    try {
      await Promise.all(toApprove.map(m => api.put(`/moments/${m.id}`, { ...m, is_approved: true })))
      await globalMutate(swrKey)
      setSelectedIds(new Set())
      toast.success(`${toApprove.length} momento${toApprove.length !== 1 ? 's' : ''} aprobados`)
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al aprobar momentos')
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`¿Eliminar ${selectedIds.size} momento${selectedIds.size !== 1 ? 's' : ''}?`)) return
    const deleteCount = selectedIds.size
    const deleteIds = new Set(selectedIds)
    // Optimistic: remove selected from list immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.filter((m) => !deleteIds.has(m.id)),
      { revalidate: false }
    )
    try {
      await Promise.all([...deleteIds].map(id => api.delete(`/moments/${id}`)))
      await globalMutate(swrKey)
      setSelectedIds(new Set())
      setSelectMode(false)
      toast.success(`${deleteCount} momento${deleteCount !== 1 ? 's' : ''} eliminados`)
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al eliminar momentos')
    }
  }

  const [approvingAll, setApprovingAll] = useState(false)

  const handleApproveAll = async () => {
    const pending = moments.filter((m) => !m.is_approved && m.processing_status !== 'failed')
    if (pending.length === 0) return
    setApprovingAll(true)
    // Optimistic: mark all pending as approved immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.map((m) => (!m.is_approved && m.processing_status !== 'failed') ? { ...m, is_approved: true } : m),
      { revalidate: false }
    )
    try {
      await Promise.all(
        pending.map((m) => api.put(`/moments/${m.id}`, { ...m, is_approved: true }))
      )
      await globalMutate(swrKey)
      toast.success(`${pending.length} momento${pending.length !== 1 ? 's' : ''} aprobados`)
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al aprobar momentos')
    } finally {
      setApprovingAll(false)
    }
  }

  const [rejectingAll, setRejectingAll] = useState(false)

  const handleRejectAll = async () => {
    const pending = moments.filter((m) => !m.is_approved && m.processing_status !== 'failed')
    if (pending.length === 0) return
    if (!window.confirm(`¿Eliminar ${pending.length} momento${pending.length !== 1 ? 's' : ''} pendientes? Esta acción no se puede deshacer.`)) return
    setRejectingAll(true)
    const pendingIds = new Set(pending.map((m) => m.id))
    // Optimistic: remove all pending from list immediately
    await globalMutate(
      swrKey,
      (prev: Moment[] | undefined) =>
        prev?.filter((m) => !pendingIds.has(m.id)),
      { revalidate: false }
    )
    try {
      await Promise.all(pending.map((m) => api.delete(`/moments/${m.id}`)))
      await globalMutate(swrKey)
      toast.success(`${pending.length} momento${pending.length !== 1 ? 's' : ''} eliminados`)
    } catch {
      await globalMutate(swrKey) // revert on error
      toast.error('Error al eliminar momentos')
    } finally {
      setRejectingAll(false)
    }
  }

  const handleTogglePublish = async () => {
    const newValue = !wallPublished
    const confirmMsg = newValue
      ? '¿Publicar el muro de momentos? Esto cerrará la subida de fotos para los invitados.'
      : '¿Despublicar el muro? Los invitados podrán volver a subir fotos.'
    if (!window.confirm(confirmMsg)) return
    try {
      await api.put(`/events/${eventId}/config`, { show_moment_wall: newValue })
      setWallPublished(newValue)
      await globalMutate(`/events/${eventId}/config`)
      toast.success(newValue ? 'Muro publicado' : 'Muro despublicado')
    } catch {
      toast.error('Error al actualizar el muro')
    }
  }

  const [generatingPreview, setGeneratingPreview] = useState(false)

  const handleOpenPreview = async () => {
    if (generatingPreview) return
    setGeneratingPreview(true)
    try {
      const res = await api.post<{ data: { token: string } }>(`/events/${eventId}/preview-token`)
      const token = res.data.data.token
      window.open(`${wallUrl}?preview_token=${token}`, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('No se pudo generar el preview')
    } finally {
      setGeneratingPreview(false)
    }
  }

  const handleToggleShare = async () => {
    const newValue = !shareEnabled
    try {
      await api.put(`/events/${eventId}/config`, { share_uploads_enabled: newValue })
      setShareEnabled(newValue)
      await globalMutate(`/events/${eventId}/config`)
      toast.success(newValue ? 'Subida compartida habilitada' : 'Subida compartida deshabilitada')
    } catch {
      toast.error('Error al actualizar configuración')
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'
  const uploadUrl = `${siteUrl}/events/${eventIdentifier}/upload`
  const wallUrl = `${siteUrl}/e/${eventIdentifier}/momentos`

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square skeleton rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-white/10 overflow-hidden">

        {/* Row 1 — Content actions */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5">
          {/* Counts + badges */}
          <p className="text-sm text-zinc-400 flex-1 min-w-0">
            {moments.length} momento{moments.length !== 1 ? 's' : ''} en total
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
            {failedCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 ring-1 ring-rose-500/20">
                {failedCount} con error
              </span>
            )}
            {(photoCount > 0 || videoCount > 0) && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                {photoCount > 0 && <span>{photoCount} foto{photoCount !== 1 ? 's' : ''}</span>}
                {photoCount > 0 && videoCount > 0 && <span className="text-zinc-700">·</span>}
                {videoCount > 0 && <span>{videoCount} video{videoCount !== 1 ? 's' : ''}</span>}
              </span>
            )}
          </p>

          {/* Bulk actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seleccionar toggle */}
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? 'Cancelar selección' : 'Seleccionar momentos'}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                selectMode
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10',
              )}
            >
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/>
              </svg>
              <span className="hidden sm:inline">{selectMode ? `Cancelar (${selectedIds.size})` : 'Seleccionar'}</span>
            </button>
            {/* Seleccionar todo checkbox */}
            {selectMode && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
                  checked={filteredMoments.length > 0 && selectedIds.size === filteredMoments.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filteredMoments.map(m => m.id)))
                    else setSelectedIds(new Set())
                  }}
                />
                <span className="hidden sm:inline">Seleccionar todo</span>
              </label>
            )}
            {approvedCount > 0 && (
              <div ref={zipMenuRef} className="relative">
                <div className="flex rounded-lg overflow-hidden border border-white/10">
                  <button
                    onClick={() => handleDownloadZip('all')}
                    disabled={downloadingZip}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
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
                    onClick={() => setShowZipMenu(v => !v)}
                    title="Opciones de descarga"
                    aria-label="Opciones de descarga"
                    disabled={downloadingZip}
                    className="flex items-center px-2 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-l border-white/10 transition-colors disabled:opacity-50"
                  >
                    <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>

                {showZipMenu && (
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border border-white/10 bg-zinc-900 shadow-xl shadow-black/40 py-1">
                    <button onClick={() => handleDownloadZip('all')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
                      <ArrowDownTrayIcon className="size-3.5" /> Todos
                    </button>
                    <button onClick={() => handleDownloadZip('photos')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
                      <ArrowDownTrayIcon className="size-3.5" /> Solo fotos
                    </button>
                    <button onClick={() => handleDownloadZip('videos')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 transition-colors border border-lime-500/20 disabled:opacity-50"
                title={`Aprobar ${pendingCount} momento${pendingCount !== 1 ? 's' : ''} pendientes`}
              >
                {approvingAll ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{approvingAll ? 'Aprobando…' : `Aprobar todos (${pendingCount})`}</span>
                <span className="sm:hidden">{approvingAll ? '…' : `Aprobar (${pendingCount})`}</span>
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={handleRejectAll}
                disabled={rejectingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors border border-rose-500/20 disabled:opacity-50"
                title={`Eliminar ${pendingCount} momento${pendingCount !== 1 ? 's' : ''} pendientes`}
              >
                {rejectingAll ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <XMarkIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{rejectingAll ? 'Eliminando…' : `Rechazar todos (${pendingCount})`}</span>
                <span className="sm:hidden">{rejectingAll ? '…' : `Rechazar (${pendingCount})`}</span>
              </button>
            )}

            {/* Bulk requeue legacy moments */}
            {legacyCount > 0 && (
              <button
                onClick={handleRequeueLegacy}
                disabled={requeuingLegacy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors border border-violet-500/20 disabled:opacity-50"
                title={`Reoptimizar ${legacyCount} momento${legacyCount !== 1 ? 's' : ''} que nunca pasaron por Lambda`}
              >
                {requeuingLegacy ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{requeuingLegacy ? 'Reoptimizando…' : `Reoptimizar (${legacyCount})`}</span>
                <span className="sm:hidden">{requeuingLegacy ? '…' : `Opt. (${legacyCount})`}</span>
              </button>
            )}

            {/* Selection bulk actions */}
            {selectMode && selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleApproveSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 border border-lime-500/20 transition-colors"
                >
                  <CheckIcon className="size-3.5" />
                  <span className="hidden sm:inline">Aprobar selección ({selectedIds.size})</span>
                  <span className="sm:hidden">Aprobar ({selectedIds.size})</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                >
                  <XMarkIcon className="size-3.5" />
                  <span className="hidden sm:inline">Eliminar selección ({selectedIds.size})</span>
                  <span className="sm:hidden">Eliminar ({selectedIds.size})</span>
                </button>
              </>
            )}

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              {isValidating && (
                <ArrowPathIcon className="size-3 animate-spin text-zinc-400" />
              )}
              <span className="sm:hidden">
                {isValidating ? '…' : '15s'}
              </span>
              <span className="hidden sm:inline">
                {isValidating ? 'Actualizando…' : 'Auto-actualiza cada 15s'}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2 — Sharing & settings */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/5 border-l-2 border-l-indigo-500/30">
          <button
            onClick={handleToggleShare}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
              shareEnabled
                ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border-indigo-500/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10'
            }`}
            title={shareEnabled ? 'Subida por QR habilitada — cualquiera con el enlace puede subir' : 'Habilitar subida por QR compartido'}
          >
            <QrCodeIcon className="size-3.5" />
            <span className="hidden sm:inline">{shareEnabled ? 'Subida QR activa' : 'Habilitar subida QR'}</span>
            <span className="sm:hidden">{shareEnabled ? 'QR activo' : 'QR subida'}</span>
          </button>
          <button
            onClick={handleTogglePublish}
            title={wallPublished ? 'Muro publicado — visible para los invitados' : 'Publicar muro para invitados'}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
              wallPublished
                ? 'bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 border-lime-500/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10'
            }`}
          >
            <GlobeAltIcon className="size-3.5" />
            <span className="hidden sm:inline">{wallPublished ? 'Muro publicado' : 'Publicar muro'}</span>
            <span className="sm:hidden">{wallPublished ? 'Publicado' : 'Publicar'}</span>
          </button>

          {/* Separator */}
          <div className="hidden sm:block h-5 w-px bg-white/10" />

          {/* Vista previa admin */}
          <button
            onClick={handleOpenPreview}
            disabled={generatingPreview}
            title={wallPublished ? 'Ver el muro publicado (ya es público)' : 'Abrir vista previa — solo visible para ti'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border disabled:opacity-50 ${
              wallPublished
                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10'
                : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border-violet-500/20'
            }`}
          >
            {generatingPreview ? (
              <ArrowPathIcon className="size-3.5 animate-spin" />
            ) : (
              <EyeIcon className="size-3.5" />
            )}
            <span className="hidden sm:inline">{generatingPreview ? 'Generando…' : 'Vista previa'}</span>
            <span className="sm:hidden">Preview</span>
          </button>

          <a
            href={wallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-white/10"
            title="Ver el muro de momentos en eventiapp"
          >
            <ArrowTopRightOnSquareIcon className="size-3.5" />
            <span className="hidden sm:inline">Ver muro</span>
            <span className="sm:hidden">Ver</span>
          </a>
          <button
            onClick={() => setGroupByTime(v => !v)}
            title="Agrupar por hora"
            aria-label="Agrupar por hora"
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              groupByTime
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10',
            )}
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd"/>
            </svg>
            <span className="hidden sm:inline">Por hora</span>
          </button>
          <button
            onClick={() => setShowWallShare(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 transition-colors border border-pink-500/30"
            title="Compartir muro de momentos"
          >
            <ShareIcon className="size-3.5" />
            <span className="hidden sm:inline">Compartir muro</span>
            <span className="sm:hidden">Muro</span>
          </button>
          {shareEnabled && (
            <button
              onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 transition-colors border border-indigo-500/30"
              title="Generar QR para subida compartida"
            >
              <QrCodeIcon className="size-3.5" />
              <span className="hidden sm:inline">QR de subida</span>
              <span className="sm:hidden">QR</span>
            </button>
          )}
        </div>

        {/* Row 3 — Filters */}
        <div role="tablist" className="flex">
          {([
            { value: 'all',      label: 'Todos',      count: moments.length },
            { value: 'pending',  label: 'Pendientes', count: pendingCount },
            { value: 'approved', label: 'Aprobados',  count: approvedCount },
            ...(photoCount  > 0 ? [{ value: 'photos', label: 'Fotos',  count: photoCount  }] : []),
            ...(videoCount  > 0 ? [{ value: 'videos', label: 'Videos', count: videoCount  }] : []),
            ...(notesCount  > 0 ? [{ value: 'notes',  label: 'Notas',  count: notesCount  }] : []),
            ...(failedCount > 0 ? [{ value: 'failed', label: 'Errores', count: failedCount }] : []),
          ] as const).map((f) => (
            <button
              key={f.value}
              id={`tab-${f.value}`}
              role="tab"
              aria-selected={filter === f.value}
              aria-controls={`tab-panel-${f.value}`}
              onClick={() => setFilter(f.value as typeof filter)}
              className={clsx(
                'flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors text-center',
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              )}
            >
              {f.label}
              {f.count > 0 && (
                <span className={clsx(
                  'ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  filter === f.value ? 'bg-white/20' : 'bg-zinc-800 text-zinc-500',
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div role="tabpanel" id={`tab-panel-${filter}`}>
      {filteredMoments.length === 0 && moments.length === 0 ? (
        /* Coming soon / empty wall hero */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-800/80 p-8 sm:p-12 text-center"
        >
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-pink-500/10 border border-pink-500/20 mb-6">
            <SparklesIcon className="size-8 text-pink-400" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-zinc-100 mb-2">
            El muro de momentos esta listo
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6 leading-relaxed">
            Cuando los invitados compartan fotos y videos, apareceran aqui para que los apruebes
            y se muestren en el muro publico del evento.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {shareEnabled && (
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-sm shadow-indigo-600/20"
              >
                <QrCodeIcon className="size-4" />
                Compartir QR de subida
              </button>
            )}
            <button
              onClick={() => setShowWallShare(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 text-sm font-medium transition-colors"
            >
              <GlobeAltIcon className="size-4" />
              Ver enlace del muro
            </button>
          </div>

          <div className="mt-8 grid grid-cols-3 sm:grid-cols-6 gap-2 opacity-30">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-zinc-800/60 border border-white/5" />
            ))}
          </div>
          <p className="mt-3 text-[10px] text-zinc-700 uppercase tracking-wide">
            Pronto se llenara de momentos increibles
          </p>
        </motion.div>
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
            {filteredMoments.map((moment) => (
              <NoteCard
                key={moment.id}
                moment={moment}
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
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-medium text-zinc-500 tabular-nums">{label}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
                <AnimatePresence>
                  {items.map((moment) => (
                    <MomentCard
                      key={moment.id}
                      moment={moment}
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
      ) : (
        /* Flat grid */
        <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
          <AnimatePresence>
            {visibleMoments.map((moment) => (
              <MomentCard
                key={moment.id}
                moment={moment}
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
      {visibleCount < filteredMoments.length && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-zinc-500">
            Mostrando {visibleCount} de {filteredMoments.length} momentos
          </p>
          <button
            onClick={() => setVisibleCount((v) => v + VISIBLE_PAGE)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition-colors"
          >
            Mostrar {Math.min(VISIBLE_PAGE, filteredMoments.length - visibleCount)} más
          </button>
        </div>
      )}

      {/* ── Lightbox portal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxIndex !== null && lightboxMoments.length > 0 && (
          <Lightbox
            moments={lightboxMoments}
            index={lightboxIndex}
            resolveUrl={resolveUrl}
            onClose={() => setLightboxIndex(null)}
            onNext={() => setLightboxIndex((i) => ((i ?? 0) + 1) % lightboxMoments.length)}
            onPrev={() => setLightboxIndex((i) => ((i ?? 0) - 1 + lightboxMoments.length) % lightboxMoments.length)}
          />
        )}
      </AnimatePresence>

      {/* ── QR portal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQR && <QRModal url={uploadUrl} onClose={() => setShowQR(false)} />}
      </AnimatePresence>

      {/* ── Wall share portal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showWallShare && (
          <WallShareModal
            wallUrl={wallUrl}
            uploadUrl={uploadUrl}
            onClose={() => setShowWallShare(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
