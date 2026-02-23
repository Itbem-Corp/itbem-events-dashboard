# Public Moments Wall — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public, beautifully themed moments gallery page in the Astro project at `/e/{identifier}/momentos` that displays approved photos/videos with guest comments and animations. Modify the upload page to show a "thank you" screen when the wall is published. Add a QR code + copy link for the wall URL in the dashboard. Add a publish toggle in the dashboard Momentos tab.

**Architecture:** New Astro page `/e/[identifier]/momentos.astro` renders a React `MomentsGallery` component that fetches approved moments + page-spec from the Go backend. A theme system maps event types (wedding, graduation, etc.) to visual styles (colors, fonts, decorations). The existing upload page checks a `moments_wall_published` flag and shows a "thank you" screen when the wall is live. The dashboard's Momentos tab gets a publish toggle and a dedicated QR modal for the wall URL.

**Tech Stack:** Astro 5, React 19, Framer Motion 12, Tailwind CSS 3, TypeScript

**Projects:**
- Astro: `C:\Users\AndBe\Desktop\Projects\cafetton-casero`
- Dashboard: `C:\Users\AndBe\Desktop\Projects\dashboard-ts`

---

## Task 1: Theme System

Create the theme registry that maps event types to visual configurations (colors, fonts, decorations, messages).

**Files (Astro project):**
- Create: `src/components/moments/themes/index.ts`

**Step 1: Create theme registry**

```typescript
// src/components/moments/themes/index.ts

export interface MomentsTheme {
  /** CSS class for the heading font */
  headingFont: string
  /** CSS class for the body font */
  bodyFont: string
  /** Gradient classes for the hero background */
  heroBg: string
  /** Primary accent color for buttons, links, counters */
  accent: string
  /** Accent color at lower opacity for hover states */
  accentSoft: string
  /** SVG decoration component key */
  decorationType: 'botanical' | 'confetti' | 'geometric' | 'sparkles' | 'minimal'
  /** Footer closing message */
  footerMessage: string
  /** Lightbox backdrop color */
  lightboxBg: string
  /** Stats bar icon color */
  statsIconColor: string
  /** Card hover overlay color */
  cardOverlay: string
}

const WEDDING: MomentsTheme = {
  headingFont: 'font-bigilla',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-amber-50 via-yellow-50/80 to-orange-50/60',
  accent: 'text-amber-700',
  accentSoft: 'bg-amber-100/80',
  decorationType: 'botanical',
  footerMessage: 'Gracias por ser parte de este día tan especial',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-amber-600',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const GRADUATION: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900',
  accent: 'text-blue-400',
  accentSoft: 'bg-blue-500/10',
  decorationType: 'confetti',
  footerMessage: 'Felicidades por este gran logro',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-blue-400',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const BIRTHDAY: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-fuchsia-50 via-pink-50 to-orange-50',
  accent: 'text-fuchsia-600',
  accentSoft: 'bg-fuchsia-100/80',
  decorationType: 'confetti',
  footerMessage: 'Gracias por celebrar con nosotros',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-fuchsia-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const QUINCEANERA: MomentsTheme = {
  headingFont: 'font-astralaga',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-pink-50 via-rose-50/80 to-amber-50/60',
  accent: 'text-rose-600',
  accentSoft: 'bg-rose-100/80',
  decorationType: 'sparkles',
  footerMessage: 'Gracias por acompañarnos en esta noche tan especial',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-rose-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const CORPORATE: MomentsTheme = {
  headingFont: 'font-quicksand font-semibold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100',
  accent: 'text-slate-700',
  accentSoft: 'bg-slate-100',
  decorationType: 'geometric',
  footerMessage: 'Gracias por ser parte de este evento',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-slate-600',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const DEFAULT_THEME: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-violet-50 via-indigo-50/80 to-sky-50/60',
  accent: 'text-indigo-600',
  accentSoft: 'bg-indigo-100/80',
  decorationType: 'minimal',
  footerMessage: 'Gracias por compartir estos momentos',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-indigo-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
}

const THEME_MAP: Record<string, MomentsTheme> = {
  wedding: WEDDING,
  boda: WEDDING,
  graduation: GRADUATION,
  graduacion: GRADUATION,
  birthday: BIRTHDAY,
  cumpleanos: BIRTHDAY,
  quinceanera: QUINCEANERA,
  quinceañera: QUINCEANERA,
  corporate: CORPORATE,
  corporativo: CORPORATE,
  conference: CORPORATE,
  conferencia: CORPORATE,
}

export function getTheme(eventType?: string): MomentsTheme {
  if (!eventType) return DEFAULT_THEME
  return THEME_MAP[eventType.toLowerCase().trim()] ?? DEFAULT_THEME
}
```

**Step 2: Verify it compiles**

Run: `cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npx tsc --noEmit`

**Step 3: Commit**

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/moments/themes/index.ts
git commit -m "feat(moments-wall): add theme system with event-type mapping"
```

---

## Task 2: Astro Page + MomentsGallery Orchestrator

Create the Astro page shell and the main React orchestrator that fetches data and renders the gallery.

**Files (Astro project):**
- Create: `src/pages/e/[identifier]/momentos.astro`
- Create: `src/components/moments/MomentsGallery.tsx`

**Step 1: Create Astro page**

```astro
---
export const prerender = false

import TemplateLayout from '../../../layouts/template.astro'
import MomentsGallery from '../../../components/moments/MomentsGallery'

const EVENTS_URL = import.meta.env.PUBLIC_EVENTS_URL as string ?? 'http://localhost:8080/'
const { identifier } = Astro.params

let ogTitle = 'Momentos del evento'
let ogDesc = 'Revive los mejores momentos del evento.'
const ogUrl = Astro.url.href

if (identifier) {
  try {
    const res = await fetch(
      `${EVENTS_URL}api/events/${encodeURIComponent(identifier)}/page-spec`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      const json = await res.json() as {
        data?: { meta?: { pageTitle?: string } }
      }
      const meta = json?.data?.meta
      if (meta?.pageTitle) ogTitle = `Momentos — ${meta.pageTitle}`
    }
  } catch { /* silent */ }
}
---

<TemplateLayout
  title={ogTitle}
  ogTitle={ogTitle}
  ogDescription={ogDesc}
  ogUrl={ogUrl}
>
  <body>
    <MomentsGallery
      client:only="react"
      EVENTS_URL={EVENTS_URL}
    />
  </body>
</TemplateLayout>
```

**Step 2: Create MomentsGallery orchestrator**

This is the main component. It fetches data, manages state, picks the theme, and renders child components.

```tsx
// src/components/moments/MomentsGallery.tsx
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { getTheme, type MomentsTheme } from "./themes"

// ── Types ──────────────────────────────────────────────────────────────────

interface Moment {
  id: string
  content_url: string
  thumbnail_url?: string
  description?: string
  created_at: string
  processing_status?: string
}

interface MomentsResponse {
  items: Moment[]
  total: number
  page: number
  limit: number
  has_more: boolean
  published: number
  uploads_remaining: number
  uploads_used: number
  moments_wall_published?: boolean
  event_name?: string
  event_type?: string
  event_date?: string
}

interface PageSpecMeta {
  pageTitle?: string
  identifier?: string
  eventId?: string
  eventType?: string
  eventDate?: string
  colorPalette?: { role: string; hex: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return ""
  // URL pattern: /e/{identifier}/momentos
  const match = window.location.pathname.match(/\/e\/([^/]+)\/momentos/)
  return match?.[1] ?? ""
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(url)
}

function resolveMediaUrl(m: Moment, EVENTS_URL: string): string {
  const url = m.thumbnail_url || m.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${EVENTS_URL}${url.startsWith("/") ? url.slice(1) : url}`
}

function resolveFullUrl(m: Moment, EVENTS_URL: string): string {
  const url = m.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${EVENTS_URL}${url.startsWith("/") ? url.slice(1) : url}`
}

const PAGE_SIZE = 30

// ── MomentsGallery ─────────────────────────────────────────────────────────

interface Props {
  EVENTS_URL: string
}

export default function MomentsGallery({ EVENTS_URL }: Props) {
  const [identifier, setIdentifier] = useState("")
  const [moments, setMoments] = useState<Moment[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [published, setPublished] = useState<boolean | null>(null) // null = unknown yet
  const [eventName, setEventName] = useState("")
  const [eventType, setEventType] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [error, setError] = useState("")

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    setIdentifier(getIdentifier())
  }, [])

  // Fetch moments
  const fetchMoments = useCallback(async (id: string, pageNum: number, append: boolean) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=${pageNum}&limit=${PAGE_SIZE}`
      )
      if (!res.ok) {
        if (res.status === 404) { setError("Evento no encontrado"); return }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      const data: MomentsResponse = json.data ?? json

      setMoments(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
      setHasMore(data.has_more ?? false)
      setPublished(data.moments_wall_published ?? true) // Default to true if field missing

      if (data.event_name) setEventName(data.event_name)
      if (data.event_type) setEventType(data.event_type)
      if (data.event_date) setEventDate(data.event_date)
    } catch (err) {
      setError("No se pudieron cargar los momentos")
    }
  }, [EVENTS_URL])

  // Also fetch page-spec for event metadata (event name, type, date)
  const fetchPageSpec = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/page-spec`
      )
      if (!res.ok) return
      const json = await res.json()
      const meta: PageSpecMeta = json.data?.meta ?? {}
      if (meta.pageTitle && !eventName) setEventName(meta.pageTitle)
      if (meta.eventType) setEventType(meta.eventType)
      if (meta.eventDate) setEventDate(meta.eventDate)
    } catch { /* silent fallback */ }
  }, [EVENTS_URL, eventName])

  // Initial load
  useEffect(() => {
    if (!identifier) return
    setLoading(true)
    Promise.all([
      fetchMoments(identifier, 1, false),
      fetchPageSpec(identifier),
    ]).finally(() => setLoading(false))
  }, [identifier, fetchMoments, fetchPageSpec])

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !identifier) return
    const nextPage = page + 1
    setLoadingMore(true)
    await fetchMoments(identifier, nextPage, true)
    setPage(nextPage)
    setLoadingMore(false)
  }, [loadingMore, hasMore, identifier, page, fetchMoments])

  // Theme
  const theme = getTheme(eventType)

  // Stats
  const photos = moments.filter(m => !isVideo(resolveFullUrl(m, EVENTS_URL)))
  const videos = moments.filter(m => isVideo(resolveFullUrl(m, EVENTS_URL)))
  const comments = moments.filter(m => m.description?.trim())

  // ── Invalid URL ──────────────────────────────────────────────────────────
  if (!identifier && typeof window !== "undefined") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-400 text-sm">Enlace inválido.</p>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full"
        />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // ── Not published yet ────────────────────────────────────────────────────
  if (published === false) {
    return <ComingSoonScreen eventName={eventName} theme={theme} />
  }

  // ── Empty wall ───────────────────────────────────────────────────────────
  if (moments.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${theme.heroBg}`}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className={`text-5xl ${theme.headingFont} ${theme.accent}`}>
            {eventName || "Momentos"}
          </div>
          <p className="text-gray-500 text-sm">Aún no hay momentos publicados. ¡Vuelve pronto!</p>
        </motion.div>
      </div>
    )
  }

  // ── Gallery ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Header */}
      <HeroHeader
        eventName={eventName}
        eventDate={eventDate}
        theme={theme}
      />

      {/* Stats Bar */}
      <StatsBar
        photoCount={photos.length}
        videoCount={videos.length}
        commentCount={comments.length}
        total={moments.length}
        theme={theme}
      />

      {/* Masonry Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
          {moments.map((m, i) => (
            <MomentCard
              key={m.id}
              moment={m}
              index={i}
              EVENTS_URL={EVENTS_URL}
              theme={theme}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mt-10">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className={`px-8 py-3 rounded-full text-sm font-medium transition-all ${theme.accentSoft} ${theme.accent} hover:opacity-80 disabled:opacity-50`}
            >
              {loadingMore ? "Cargando..." : "Cargar más momentos"}
            </button>
          </div>
        )}
      </div>

      {/* Comments Marquee */}
      {comments.length >= 3 && (
        <CommentsMarquee comments={comments.map(m => m.description!)} theme={theme} />
      )}

      {/* Footer */}
      <ThemeFooter theme={theme} eventName={eventName} />

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <GalleryLightbox
            moments={moments}
            index={lightboxIndex}
            EVENTS_URL={EVENTS_URL}
            theme={theme}
            onClose={() => setLightboxIndex(null)}
            onNext={() => setLightboxIndex(i => i !== null ? Math.min(i + 1, moments.length - 1) : null)}
            onPrev={() => setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HeroHeader({ eventName, eventDate, theme }: {
  eventName: string; eventDate: string; theme: MomentsTheme
}) {
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString("es-MX", { dateStyle: "long" })
    : ""

  return (
    <div className={`relative overflow-hidden ${theme.heroBg}`}>
      {/* Decorative elements */}
      <Decorations type={theme.decorationType} />

      <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-24 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4"
        >
          Los momentos de
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
          className={`text-4xl sm:text-5xl lg:text-6xl ${theme.headingFont} ${theme.accent} leading-tight`}
        >
          {eventName || "Nuestros Momentos"}
        </motion.h1>

        {formattedDate && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 text-sm text-gray-400"
          >
            {formattedDate}
          </motion.p>
        )}

        {/* Subtle divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 mx-auto w-16 h-px bg-gray-300/50"
        />
      </div>
    </div>
  )
}

function StatsBar({ photoCount, videoCount, commentCount, total, theme }: {
  photoCount: number; videoCount: number; commentCount: number; total: number; theme: MomentsTheme
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="flex items-center justify-center gap-6 sm:gap-10 py-6 border-b border-gray-100"
    >
      {[
        { icon: "📸", count: photoCount, label: photoCount === 1 ? "foto" : "fotos" },
        ...(videoCount > 0 ? [{ icon: "🎬", count: videoCount, label: videoCount === 1 ? "video" : "videos" }] : []),
        ...(commentCount > 0 ? [{ icon: "💬", count: commentCount, label: commentCount === 1 ? "mensaje" : "mensajes" }] : []),
      ].map((stat, i) => (
        <div key={stat.label} className="flex items-center gap-2">
          <span className="text-lg">{stat.icon}</span>
          <AnimatedCounter value={stat.count} delay={0.7 + i * 0.15} />
          <span className="text-sm text-gray-400">{stat.label}</span>
        </div>
      ))}
    </motion.div>
  )
}

function AnimatedCounter({ value, delay }: { value: number; delay: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(false)

  useEffect(() => {
    if (ref.current) return
    ref.current = true
    const timer = setTimeout(() => {
      const duration = 800
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / duration, 1)
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(eased * value))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay * 1000)
    return () => clearTimeout(timer)
  }, [value, delay])

  return <span className="text-lg font-bold text-gray-800 tabular-nums">{display}</span>
}

function MomentCard({ moment, index, EVENTS_URL, theme, onClick }: {
  moment: Moment; index: number; EVENTS_URL: string; theme: MomentsTheme; onClick: () => void
}) {
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL)
  const fullUrl = resolveFullUrl(moment, EVENTS_URL)
  const video = isVideo(fullUrl)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 1.2), type: "spring", stiffness: 300, damping: 25 }}
      className="break-inside-avoid mb-3 sm:mb-4 group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative rounded-2xl overflow-hidden bg-gray-100">
        {video ? (
          <div className="relative aspect-video">
            {moment.thumbnail_url ? (
              <img
                src={thumbUrl}
                alt=""
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
            )}
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt={moment.description ?? ""}
            className="w-full transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        )}

        {/* Hover overlay with comment */}
        {moment.description && (
          <div className={`absolute inset-0 ${theme.cardOverlay} opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4`}>
            <p className="text-white text-sm leading-relaxed line-clamp-3 font-light">
              "{moment.description}"
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function GalleryLightbox({ moments, index, EVENTS_URL, theme, onClose, onNext, onPrev }: {
  moments: Moment[]; index: number; EVENTS_URL: string; theme: MomentsTheme
  onClose: () => void; onNext: () => void; onPrev: () => void
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const moment = moments[index]
  const url = resolveFullUrl(moment, EVENTS_URL)
  const video = isVideo(url)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") onNext()
      if (e.key === "ArrowLeft") onPrev()
    }
    window.addEventListener("keydown", handler)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handler)
      document.body.style.overflow = ""
    }
  }, [onClose, onNext, onPrev])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-50 ${theme.lightboxBg} backdrop-blur-sm flex flex-col items-center justify-center`}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation arrows (desktop) */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      {index < moments.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Media */}
      <motion.div
        key={moment.id}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="max-w-full max-h-[80vh] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {video ? (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] max-w-full rounded-2xl"
          />
        ) : (
          <img
            src={url}
            alt={moment.description ?? ""}
            className="max-h-[80vh] max-w-full rounded-2xl object-contain"
          />
        )}
      </motion.div>

      {/* Description */}
      {moment.description && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-md px-6"
        >
          <p className="text-white/90 text-sm text-center bg-black/30 backdrop-blur-md rounded-2xl px-5 py-3 leading-relaxed">
            "{moment.description}"
          </p>
        </motion.div>
      )}

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs font-medium">
        {index + 1} / {moments.length}
      </div>
    </motion.div>
  )
}

function CommentsMarquee({ comments, theme }: { comments: string[]; theme: MomentsTheme }) {
  // Duplicate for seamless loop
  const doubled = [...comments, ...comments]

  return (
    <div className="overflow-hidden py-10 border-t border-gray-100">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-300 mb-6">
        Mensajes de los invitados
      </p>
      <div className="relative">
        <div
          className="flex gap-8 animate-marquee whitespace-nowrap"
          style={{ animationDuration: `${comments.length * 4}s` }}
        >
          {doubled.map((c, i) => (
            <span
              key={i}
              className={`inline-block text-lg ${theme.headingFont} text-gray-300 italic`}
            >
              "{c}"
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ThemeFooter({ theme, eventName }: { theme: MomentsTheme; eventName: string }) {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`py-16 text-center ${theme.heroBg} relative overflow-hidden`}
    >
      <Decorations type={theme.decorationType} />
      <div className="relative z-10 space-y-4">
        <p className={`text-xl sm:text-2xl ${theme.headingFont} ${theme.accent}`}>
          {theme.footerMessage}
        </p>
        {eventName && (
          <p className="text-sm text-gray-400">
            {eventName}
          </p>
        )}
      </div>
    </motion.footer>
  )
}

function ComingSoonScreen({ eventName, theme }: { eventName: string; theme: MomentsTheme }) {
  return (
    <div className={`min-h-screen flex items-center justify-center px-6 ${theme.heroBg} relative overflow-hidden`}>
      <Decorations type={theme.decorationType} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center space-y-6"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="text-5xl"
        >
          ✨
        </motion.div>
        <h1 className={`text-3xl sm:text-4xl ${theme.headingFont} ${theme.accent}`}>
          Próximamente
        </h1>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">
          El muro de momentos de <span className="font-medium text-gray-600">{eventName || "este evento"}</span> se está preparando.
        </p>
      </motion.div>
    </div>
  )
}

function Decorations({ type }: { type: MomentsTheme['decorationType'] }) {
  if (type === 'botanical') {
    return (
      <>
        <svg className="absolute top-0 left-0 w-32 h-32 text-amber-200/30 -translate-x-1/3 -translate-y-1/4" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
        <svg className="absolute bottom-0 right-0 w-40 h-40 text-amber-200/20 translate-x-1/4 translate-y-1/4 rotate-45" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
      </>
    )
  }

  if (type === 'confetti') {
    return (
      <>
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${10 + (i * 12)}%`,
              top: `${5 + (i % 3) * 30}%`,
              backgroundColor: ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fb923c', '#22d3ee'][i],
            }}
            animate={{ y: [0, -8, 0], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 + i * 0.5, delay: i * 0.3, ease: "easeInOut" }}
          />
        ))}
      </>
    )
  }

  if (type === 'sparkles') {
    return (
      <>
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-rose-300/40"
            style={{ left: `${15 + i * 15}%`, top: `${10 + (i % 2) * 60}%` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.4, ease: "easeInOut" }}
          >
            ✦
          </motion.div>
        ))}
      </>
    )
  }

  if (type === 'geometric') {
    return (
      <>
        <div className="absolute top-10 right-10 w-20 h-20 border border-gray-200/30 rotate-45" />
        <div className="absolute bottom-10 left-10 w-16 h-16 border border-gray-200/20 rotate-12" />
      </>
    )
  }

  // minimal
  return null
}
```

**Step 3: Add marquee keyframe to Tailwind config**

In `tailwind.config.cjs`, add to `extend`:

```javascript
keyframes: {
  marquee: {
    '0%': { transform: 'translateX(0%)' },
    '100%': { transform: 'translateX(-50%)' },
  },
},
animation: {
  marquee: 'marquee linear infinite',
},
```

**Step 4: Verify it compiles**

Run: `cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npx tsc --noEmit`

**Step 5: Commit**

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/pages/e/\[identifier\]/momentos.astro src/components/moments/ tailwind.config.cjs
git commit -m "feat(moments-wall): add public moments gallery page with themed UI"
```

---

## Task 3: Modify Upload Page — ThankYou Screen

Modify `SharedUploadPage.tsx` to check `moments_wall_published` from the moments API and show a themed "Thank You" screen when the wall is published.

**Files (Astro project):**
- Modify: `src/components/SharedUploadPage.tsx`

**Step 1: Add ThankYouScreen and published check**

At the top of `SharedUploadPage.tsx`, after the existing state declarations (around line 244), add:

```typescript
const [wallPublished, setWallPublished] = useState(false)
const [wallEventName, setWallEventName] = useState("")
```

In the `checkQuota` function (around line 256), add after the `uploads_remaining` check:

```typescript
// Check if moments wall is published
const wallPublished = json.data?.moments_wall_published
if (wallPublished === true) {
  setWallPublished(true)
  if (json.data?.event_name) setWallEventName(json.data.event_name)
}
```

Before the existing `if (limitReached)` screen check (around line 455), add:

```typescript
if (wallPublished) {
  return <ThankYouScreen eventName={wallEventName} identifier={identifier} />
}
```

Add the ThankYouScreen component at the bottom of the file (after `LimitReachedScreen`):

```tsx
function ThankYouScreen({ eventName, identifier }: { eventName: string; identifier: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      {/* Floating sparkles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-amber-300/40 text-lg pointer-events-none"
          style={{
            left: `${10 + i * 11}%`,
            top: `${15 + (i % 3) * 25}%`,
          }}
          animate={{
            y: [0, -12, 0],
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 2.5 + i * 0.3,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        >
          ✦
        </motion.div>
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-8 shadow-lg shadow-amber-500/20"
      >
        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4"
      >
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          Gracias por compartir tus<br />mejores momentos
        </h2>

        {eventName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg font-medium text-gray-600"
          >
            {eventName}
          </motion.p>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-400 text-sm max-w-[300px] mx-auto leading-relaxed"
        >
          Estamos muy agradecidos de que hayas sido parte de este día tan especial
        </motion.p>

        <motion.a
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          href={`/e/${identifier}/momentos`}
          className="inline-flex items-center gap-2 mt-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-xl active:scale-[0.98] transition-all"
        >
          Ver el muro de momentos
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </motion.a>
      </motion.div>
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npx tsc --noEmit`

**Step 3: Commit**

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): show thank-you screen when moments wall is published"
```

---

## Task 4: Dashboard — Publish Toggle + Wall QR

Add a publish toggle button and a dedicated QR modal for the wall URL in the dashboard's Momentos tab.

**Files (Dashboard project):**
- Modify: `src/components/events/moments-wall.tsx` — add publish toggle and wall QR button
- Modify: `src/models/Event.ts` — add `moments_wall_published` field

**Step 1: Add field to Event model**

In `src/models/Event.ts`, add inside the interface before the closing `}`:

```typescript
  // Moments wall
  moments_wall_published?: boolean;
```

**Step 2: Add publish toggle to MomentsWall**

In `src/components/events/moments-wall.tsx`:

The component receives `eventId` and `eventIdentifier` as props. We need to:

1. Add a prop for the event (or fetch it) to check `moments_wall_published`.
2. Add a publish toggle button in the toolbar area.
3. Add a dedicated "Wall QR" button that opens the existing `WallShareModal`.

Find the `MomentsWall` component's props interface and add:

```typescript
  momentsWallPublished?: boolean;
```

In the toolbar section (near the QR/Share buttons around lines 690-730), add a publish toggle button:

```tsx
{/* Publish toggle */}
<button
  onClick={handleTogglePublish}
  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    momentsWallPublished
      ? 'bg-lime-500/20 text-lime-400 hover:bg-lime-500/30'
      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
  }`}
>
  <GlobeAltIcon className="size-4" />
  {momentsWallPublished ? 'Muro publicado' : 'Publicar muro'}
</button>
```

Add the handler:

```typescript
const handleTogglePublish = async () => {
  const newValue = !momentsWallPublished
  const confirmMsg = newValue
    ? '¿Publicar el muro de momentos? Esto cerrará la subida de fotos para los invitados.'
    : '¿Despublicar el muro? Los invitados podrán volver a subir fotos.'
  if (!window.confirm(confirmMsg)) return
  try {
    await api.put(`/events/${eventId}`, { moments_wall_published: newValue })
    await globalMutate(`/events/${eventId}`)
    toast.success(newValue ? 'Muro publicado' : 'Muro despublicado')
  } catch {
    toast.error('Error al actualizar el muro')
  }
}
```

**Step 3: Update the parent page to pass `momentsWallPublished` prop**

In `src/app/(app)/events/[id]/page.tsx`, where `<MomentsWall>` is rendered (around line 1121), add the prop:

```tsx
<MomentsWall
  eventId={event.id}
  eventIdentifier={event.identifier}
  eventName={event.name}
  momentsWallPublished={event.moments_wall_published}
/>
```

**Step 4: Verify it compiles**

Run: `cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npx tsc --noEmit`

**Step 5: Commit**

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
git add src/models/Event.ts src/components/events/moments-wall.tsx src/app/\(app\)/events/\[id\]/page.tsx
git commit -m "feat(dashboard): add moments wall publish toggle and wall QR"
```

---

## Task 5: Cloudflare Redirects + Testing

Update the Cloudflare `_redirects` file so the new moments page works with the rewrite pattern.

**Files (Astro project):**
- Modify: `public/_redirects`

**Step 1: Add redirect rule**

Add this line to `public/_redirects`:

```
/e/*/momentos  /e/momentos  200
```

The full file should look like:

```
# Cloudflare Pages routing rules
/events/*/upload  /events/upload  200
/e/*/momentos  /e/momentos  200
```

Wait — actually the `/e/[identifier].astro` page already works as a dynamic Astro page with `prerender = false`. Since we created `src/pages/e/[identifier]/momentos.astro` with `prerender = false`, Cloudflare should handle it natively via Astro's SSR adapter.

Check if the Astro project uses `@astrojs/cloudflare` adapter. If yes, the `_redirects` rewrite may not be needed since Astro SSR handles the routing. But adding the rewrite is a safe fallback.

**Step 2: Create the actual Astro page file**

Ensure the file at `src/pages/e/[identifier]/momentos.astro` exists (created in Task 2).

**Step 3: Test locally**

Run: `cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run dev`

Visit: `http://localhost:4321/e/test-event/momentos`

Expected: The page should load and show either the loading spinner, then either the gallery (if moments exist) or the "Coming soon" screen.

**Step 4: Commit**

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add public/_redirects
git commit -m "chore: add moments wall redirect rule"
```

---

## Task 6: Final Integration Commit

Verify both projects compile and commit any remaining changes.

**Step 1: Verify Dashboard**

Run: `cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npx tsc --noEmit`

**Step 2: Verify Astro**

Run: `cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npx tsc --noEmit`

**Step 3: Test the full flow**

1. Open dashboard → event → Momentos tab → verify "Publicar muro" button exists
2. Click "Share" → verify Wall QR modal shows the wall URL
3. Open `http://localhost:4321/e/{identifier}/momentos` → verify gallery or coming soon
4. Open `http://localhost:4321/events/{identifier}/upload` → verify upload still works (or shows thank you if published)

---

## Summary of Changes

### Astro Project (`cafetton-casero`)
| File | Action |
|------|--------|
| `src/components/moments/themes/index.ts` | **Create** — Theme registry (wedding, graduation, birthday, quinceanera, corporate, default) |
| `src/components/moments/MomentsGallery.tsx` | **Create** — Main gallery with hero, stats, masonry grid, lightbox, marquee, footer |
| `src/pages/e/[identifier]/momentos.astro` | **Create** — Astro page shell |
| `src/components/SharedUploadPage.tsx` | **Modify** — Add ThankYouScreen when wall is published |
| `tailwind.config.cjs` | **Modify** — Add marquee keyframes |
| `public/_redirects` | **Modify** — Add moments wall rewrite rule |

### Dashboard Project (`dashboard-ts`)
| File | Action |
|------|--------|
| `src/models/Event.ts` | **Modify** — Add `moments_wall_published` field |
| `src/components/events/moments-wall.tsx` | **Modify** — Add publish toggle + pass prop |
| `src/app/(app)/events/[id]/page.tsx` | **Modify** — Pass `momentsWallPublished` prop to MomentsWall |
