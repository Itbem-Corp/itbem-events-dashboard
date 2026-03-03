# TV Mode + Drag & Drop Reorder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fullscreen live-event TV slideshow at `/e/[identifier]/tv` and drag-and-drop moment reordering in the dashboard.

**Architecture:** Backend gains a `PATCH /moments/reorder` endpoint and a corrected ORDER BY in `ListApprovedForWall`. Dashboard wraps the approved flat grid in `@dnd-kit/sortable` (already installed). Astro frontend gets a new `/e/[identifier]/tv` page with a self-contained `TvSlideshow` React island.

**Tech Stack:** Go/Echo/GORM (backend), Next.js 15/React 19/`@dnd-kit` (dashboard), Astro 5/React 19/`framer-motion`/`qrcode.react` (frontend)

---

## Task 1: Backend — `PATCH /moments/reorder` + fix ORDER BY

**Files:**
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\models\Moment.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\repositories\momentrepository\MomentRepository.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\ports\ports.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\moments\MomentService.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\moments\moments.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\routes\routes.go`

### Step 1: Add `MomentOrderItem` to models/Moment.go

After the `MomentSummary` struct (around line 14), add:

```go
// MomentOrderItem is used by PATCH /moments/reorder to set custom display order.
type MomentOrderItem struct {
	ID    uuid.UUID `json:"id"`
	Order int       `json:"order"`
}
```

### Step 2: Add `BulkReorder` to MomentRepository.go

After the `SummaryByEventIDs` receiver method (end of file), add:

```go
// BulkReorder updates the "order" field for multiple moments in a single transaction.
func BulkReorder(items []models.MomentOrderItem) error {
	return configuration.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			if err := tx.Model(&models.Moment{}).
				Where("id = ?", item.ID).
				Update("order", item.Order).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *MomentRepo) BulkReorder(items []models.MomentOrderItem) error {
	return BulkReorder(items)
}
```

Note: `gorm.io/gorm` is already imported. No new imports needed.

### Step 3: Fix ORDER BY in `ListApprovedForWall` (MomentRepository.go ~line 128)

Replace:
```go
		ORDER BY m.created_at DESC
```
With:
```go
		ORDER BY
		  CASE WHEN m."order" > 0 THEN m."order" ELSE 2147483647 END ASC,
		  m.created_at DESC
```

### Step 4: Add `BulkReorder` to ports.go interface

Inside `MomentRepository` interface (after `SummaryByEventIDs`):
```go
// BulkReorder sets custom display order for multiple moments.
BulkReorder(items []models.MomentOrderItem) error
```

### Step 5: Add service wrapper to MomentService.go

After `SummaryByEventIDs` functions (around line 238):

```go
// BulkReorder sets custom display order and busts all wall caches for affected events.
func (s *MomentService) BulkReorder(items []models.MomentOrderItem) error {
	if err := s.repo.BulkReorder(items); err != nil {
		return err
	}
	// Bust all wall caches — we don't know which events are affected without a query,
	// so pattern-delete all wall keys for safety (cheap Redis operation).
	ctx := context.Background()
	_ = s.cache.DeleteKeysByPattern(ctx, "moments:wall:*")
	return nil
}

func BulkReorder(items []models.MomentOrderItem) error {
	return _momentSvc.BulkReorder(items)
}
```

### Step 6: Add `ReorderMoments` controller to moments.go

After the `SummaryMoments` function:

```go
// PATCH /moments/reorder
// Sets custom display order for multiple moments.
// Body: [{ "id": "uuid", "order": 1 }, ...]
func ReorderMoments(c echo.Context) error {
	var items []models.MomentOrderItem
	if err := c.Bind(&items); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if len(items) == 0 {
		return utils.Success(c, http.StatusOK, "Nothing to reorder", nil)
	}
	if err := momentSvc.BulkReorder(items); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error reordering moments", err.Error())
	}
	return utils.Success(c, http.StatusOK, "Order updated", nil)
}
```

### Step 7: Register route in routes.go

After `GET /moments/summary` line (~239):
```go
protected.PATCH("/moments/reorder", moments.ReorderMoments)        // bulk order — must be before /:id
```

### Step 8: Build and verify

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./..."
```
Expected: no output (success).

### Step 9: Commit

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && git add -A && git commit -m 'feat(moments): PATCH /moments/reorder + custom order in wall query'"
```

---

## Task 2: Dashboard — Drag & Drop in moments-wall.tsx

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Add dnd-kit imports at top of moments-wall.tsx (after existing imports)

```tsx
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

### Step 2: Add `SortableMomentCard` wrapper component

Insert this component just before the `MomentsWall` export function. It is a thin wrapper that adds drag-handle UX to `MomentCard`:

```tsx
// ─── Sortable card wrapper ────────────────────────────────────────────────────

interface SortableMomentCardProps extends MomentCardProps {
  dragMode: boolean
}

const SortableMomentCard = memo(function SortableMomentCard({ dragMode, ...cardProps }: SortableMomentCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardProps.moment.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: dragMode ? (isDragging ? 'grabbing' : 'grab') : undefined,
    position: 'relative',
    zIndex: isDragging ? 999 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {dragMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 z-10 rounded-md p-1 bg-black/50 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/70 transition-colors cursor-grab active:cursor-grabbing touch-none"
          title="Arrastrar para reordenar"
          aria-label="Arrastrar para reordenar"
        >
          {/* 6-dot drag handle */}
          <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
            <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
            <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
          </svg>
        </div>
      )}
      <MomentCard {...cardProps} />
    </div>
  )
})
```

### Step 3: Add state and handlers inside `MomentsWall`

After the `isTabVisible` / `visibilitychange` effect block, add:

```tsx
// ─── Drag & drop reorder ──────────────────────────────────────────────────────
const [dragMode, setDragMode] = useState(false)
const [activeDragId, setActiveDragId] = useState<string | null>(null)
// Local ordered copy used only while drag mode is active
const [orderedMoments, setOrderedMoments] = useState<Moment[]>([])
const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// Sync orderedMoments whenever approved moments change externally
useEffect(() => {
  if (!dragMode) return
  setOrderedMoments(moments.filter((m) => m.is_approved))
}, [moments, dragMode])

const enterDragMode = useCallback(() => {
  setOrderedMoments(moments.filter((m) => m.is_approved))
  setDragMode(true)
}, [moments])

const exitDragMode = useCallback(() => {
  setDragMode(false)
  setActiveDragId(null)
  if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
}, [])

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
)

const handleDragStart = useCallback((event: DragStartEvent) => {
  setActiveDragId(String(event.active.id))
}, [])

const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  setActiveDragId(null)
  const { active, over } = event
  if (!over || active.id === over.id) return

  setOrderedMoments((prev) => {
    const oldIdx = prev.findIndex((m) => m.id === active.id)
    const newIdx = prev.findIndex((m) => m.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return prev
    return arrayMove(prev, oldIdx, newIdx)
  })
}, [])

// Debounced save — fires 800ms after last drag ends
useEffect(() => {
  if (!dragMode || orderedMoments.length === 0) return
  if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
  saveDebounceRef.current = setTimeout(async () => {
    const toastId = toast.loading('Guardando orden…')
    try {
      const payload = orderedMoments.map((m, i) => ({ id: m.id, order: i + 1 }))
      await api.patch('/moments/reorder', payload)
      await globalMutate(swrKey)
      toast.success('Orden guardado', { id: toastId })
    } catch {
      toast.error('Error al guardar el orden', { id: toastId })
    }
  }, 800)
}, [orderedMoments, dragMode, swrKey])

// Reset drag mode when filter changes away from approved
useEffect(() => {
  if (filter !== 'approved') exitDragMode()
}, [filter, exitDragMode])
```

### Step 4: Add "Reordenar" button to the toolbar

In Row 1 of the toolbar (around line 1376, inside the `<div className="flex items-center gap-2 flex-wrap">` block), add this button BEFORE the "Seleccionar" button, visible only when `filter === 'approved' && !groupByTime`:

```tsx
{/* Drag & drop reorder toggle — only for approved flat view */}
{filter === 'approved' && !groupByTime && (
  <button
    onClick={dragMode ? exitDragMode : enterDragMode}
    className={clsx(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
      dragMode
        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30'
        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10',
    )}
    title={dragMode ? 'Salir del modo reordenamiento' : 'Reordenar momentos arrastrando'}
  >
    {/* Drag handle icon */}
    <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
      <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
      <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
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
        await api.patch('/moments/reorder', payload)
        await globalMutate(swrKey)
        toast.success('Orden restablecido', { id: toastId })
      } catch {
        toast.error('Error al restablecer', { id: toastId })
      }
      exitDragMode()
    }}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/10 transition-colors"
    title="Restablecer al orden cronológico original"
  >
    Restablecer orden
  </button>
)}
```

### Step 5: Replace the flat grid with DndContext + SortableContext

Find this block (around line 1830):
```tsx
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
```

Replace with:
```tsx
      ) : (
        /* Flat grid — with optional drag-and-drop reorder */
        dragMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedMoments.map((m) => m.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
                {orderedMoments.map((moment) => (
                  <SortableMomentCard
                    key={moment.id}
                    dragMode={dragMode}
                    moment={moment}
                    onApprove={handleApprove}
                    onUnapprove={handleUnapprove}
                    onDelete={handleDelete}
                    onOpenLightbox={handleOpenLightbox}
                    resolveUrl={resolveUrl}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDragId ? (() => {
                const m = orderedMoments.find((x) => x.id === activeDragId)
                if (!m) return null
                return (
                  <div className="ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-950 rounded-xl opacity-95 shadow-2xl shadow-black/60 rotate-1 scale-105 transition-transform">
                    <MomentCard
                      moment={m}
                      onApprove={handleApprove}
                      onUnapprove={handleUnapprove}
                      onDelete={handleDelete}
                      onOpenLightbox={handleOpenLightbox}
                      resolveUrl={resolveUrl}
                      selectMode={false}
                      selected={false}
                      onToggleSelect={toggleSelect}
                    />
                  </div>
                )
              })() : null}
            </DragOverlay>
          </DndContext>
        ) : (
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
        )
      )}
```

### Step 6: TypeScript check

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && npx tsc --noEmit
```
Expected: zero errors.

### Step 7: Commit

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts"
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments-wall): drag-and-drop reorder with @dnd-kit"
```

---

## Task 3: Frontend — `TvSlideshow.tsx` React component

**Files:**
- Create: `cafetton-casero/src/components/moments/TvSlideshow.tsx`

This is the entire component. Create it with this exact content:

```tsx
"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { QRCodeSVG } from "qrcode.react"

// ── Types ────────────────────────────────────────────────────────────────────

interface Slide {
  id: string
  content_url: string
  thumbnail_url?: string
  description?: string
  created_at: string
  order?: number
}

interface Props {
  EVENTS_URL: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return ""
  const match = window.location.pathname.match(/\/e\/([^/]+)\/tv/)
  return match?.[1] ?? ""
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(url)
}

function resolveUrl(slide: Slide, base: string): string {
  const url = slide.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${base}${url.startsWith("/") ? url.slice(1) : url}`
}

// Random Ken-Burns params: scale + translate in random directions, seeded per ID
function kenBurns(id: string) {
  // deterministic pseudo-random from id so it doesn't change on re-render
  const h = id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffffff, 0)
  const dx = ((h & 0xff) / 255 - 0.5) * 5
  const dy = (((h >> 8) & 0xff) / 255 - 0.5) * 5
  const scaleEnd = 1.06 + (((h >> 16) & 0xff) / 255) * 0.06
  return { dx, dy, scaleEnd }
}

const PHOTO_DURATION = 6000   // ms per photo slide
const VIDEO_MAX_MS   = 30000  // cap for very long videos
const POLL_INTERVAL  = 30000  // re-fetch for new moments

// ── Component ────────────────────────────────────────────────────────────────

export default function TvSlideshow({ EVENTS_URL }: Props) {
  const [identifier, setIdentifier] = useState("")
  const [slides, setSlides] = useState<Slide[]>([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showQR, setShowQR] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [eventName, setEventName] = useState("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Init ──
  useEffect(() => { setIdentifier(getIdentifier()) }, [])

  // ── Fetch ──
  const fetchSlides = useCallback(async (id: string, isInitial: boolean) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=1&limit=500`
      )
      if (!res.ok) return
      const json = await res.json()
      const data = json.data ?? json
      const items: Slide[] = (data.items ?? [])
      if (data.event_name && isInitial) setEventName(data.event_name)

      setSlides((prev) => {
        if (isInitial) return items
        const newIds = new Set(items.map((s: Slide) => s.id))
        const prevIds = new Set(prev.map((s) => s.id))
        const added = items.filter((s: Slide) => !prevIds.has(s.id)).length
        if (added > 0) setNewCount((n) => n + added)
        // Merge new items at end; preserve current index position
        const merged = [
          ...prev.filter((s) => newIds.has(s.id)),
          ...items.filter((s: Slide) => !prevIds.has(s.id)),
        ]
        return merged
      })
    } catch { /* silent */ }
  }, [EVENTS_URL])

  useEffect(() => {
    if (!identifier) return
    fetchSlides(identifier, true)
    const poll = setInterval(() => fetchSlides(identifier, false), POLL_INTERVAL)
    return () => clearInterval(poll)
  }, [identifier, fetchSlides])

  // ── Navigation ──
  const advance = useCallback(() => {
    setIndex((i) => (slides.length > 0 ? (i + 1) % slides.length : 0))
    setNewCount(0)
  }, [slides.length])

  const goBack = useCallback(() => {
    setIndex((i) => (slides.length > 0 ? (i - 1 + slides.length) % slides.length : 0))
  }, [slides.length])

  // ── Auto-advance timer (photos only) ──
  const currentSlide = slides[index]
  const currentUrl = currentSlide ? resolveUrl(currentSlide, EVENTS_URL) : ""
  const currentIsVideo = !!currentUrl && isVideo(currentUrl)

  useEffect(() => {
    if (paused || currentIsVideo || slides.length === 0) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(advance, PHOTO_DURATION)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [index, paused, currentIsVideo, slides.length, advance])

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); advance() }
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack() }
      if (e.key === "f" || e.key === "F") toggleFullscreen()
      if (e.key === "Escape") setPaused(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [advance, goBack])

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // ── QR auto-hide after 10s idle ──
  const resetQrTimer = useCallback(() => {
    setShowQR(true)
    if (qrHideRef.current) clearTimeout(qrHideRef.current)
    qrHideRef.current = setTimeout(() => setShowQR(false), 10000)
  }, [])

  useEffect(() => {
    resetQrTimer()
    window.addEventListener("mousemove", resetQrTimer)
    window.addEventListener("touchstart", resetQrTimer)
    return () => {
      window.removeEventListener("mousemove", resetQrTimer)
      window.removeEventListener("touchstart", resetQrTimer)
    }
  }, [resetQrTimer])

  // ── Click zones (left half = back, right half = next) ──
  const handleClick = useCallback((e: React.MouseEvent) => {
    const x = e.clientX / window.innerWidth
    if (x < 0.5) goBack(); else advance()
  }, [advance, goBack])

  // ── Upload URL ──
  const uploadUrl = useMemo(() => {
    if (typeof window === "undefined" || !identifier) return ""
    return `${window.location.origin}/e/${identifier}`
  }, [identifier])

  // ── Ken-Burns params for current slide (stable per slide id) ──
  const kb = useMemo(() => currentSlide ? kenBurns(currentSlide.id) : null, [currentSlide?.id])

  // ── Empty state ──
  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-8">
        <p className="text-white/40 text-lg tracking-wide animate-pulse">Esperando momentos…</p>
        {uploadUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={uploadUrl} size={160} />
            </div>
            <p className="text-white/50 text-sm">Escanea para compartir momentos</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden select-none"
      onClick={handleClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Slides ── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={currentSlide?.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {currentIsVideo ? (
            <video
              key={currentUrl}
              src={currentUrl}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-contain"
              onEnded={advance}
              onError={advance}
              ref={(el) => {
                if (el) {
                  // Cap very long videos
                  const cap = () => { if (el.duration > VIDEO_MAX_MS / 1000) el.currentTime = el.duration - 1 }
                  el.addEventListener("loadedmetadata", cap, { once: true })
                }
              }}
            />
          ) : (
            kb && (
              <motion.img
                key={currentUrl}
                src={currentUrl}
                alt={currentSlide?.description ?? ""}
                className="absolute inset-0 w-full h-full object-contain"
                initial={{ scale: 1, x: "0%", y: "0%" }}
                animate={{ scale: kb.scaleEnd, x: `${kb.dx}%`, y: `${kb.dy}%` }}
                transition={{ duration: PHOTO_DURATION / 1000, ease: "linear" }}
                draggable={false}
              />
            )
          )}

          {/* Dark gradient for captions */}
          {currentSlide?.description && (
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Caption ── */}
      <AnimatePresence>
        {currentSlide?.description && (
          <motion.div
            key={`caption-${currentSlide.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="absolute bottom-10 inset-x-0 flex justify-center px-8 pointer-events-none"
          >
            <p className="text-white text-lg sm:text-xl font-medium text-center max-w-2xl leading-relaxed drop-shadow-2xl">
              &ldquo;{currentSlide.description}&rdquo;
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Progress bar ── */}
      {!currentIsVideo && (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 pointer-events-none">
          <motion.div
            key={`${currentSlide?.id}-${paused}`}
            className="h-full bg-white/60 origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: paused ? undefined : 1 }}
            transition={{ duration: PHOTO_DURATION / 1000, ease: "linear" }}
          />
        </div>
      )}

      {/* ── Top bar (event name + controls) ── */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-between p-5 pointer-events-none">
        <div className="flex flex-col gap-1">
          {eventName && (
            <p className="text-white/50 text-sm font-medium tracking-wide drop-shadow">{eventName}</p>
          )}
          {paused && (
            <span className="text-white/40 text-xs tracking-widest uppercase">Pausado</span>
          )}
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          {newCount > 0 && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {newCount} nuevo{newCount !== 1 ? "s" : ""}
            </motion.div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
            title={isFullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
          >
            {isFullscreen ? (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M9 15H4.5M9 15v4.5M15 15v4.5M15 15h4.5" />
              </svg>
            ) : (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Slide counter (bottom-right) ── */}
      <div className="absolute bottom-4 right-5 text-white/30 text-xs tabular-nums font-mono pointer-events-none">
        {index + 1} / {slides.length}
      </div>

      {/* ── QR (bottom-left, auto-hides) ── */}
      <AnimatePresence>
        {showQR && uploadUrl && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-5 left-5 flex items-end gap-3 pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-sm p-2 rounded-xl shadow-2xl shadow-black/40">
              <QRCodeSVG value={uploadUrl} size={72} />
            </div>
            <p className="text-white/50 text-xs mb-1 leading-tight max-w-[120px]">
              Comparte tus momentos
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

### Step 2: TypeScript check (in cafetton-casero)

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero" && npx tsc --noEmit 2>&1 | head -20
```
Expected: zero errors.

---

## Task 4: Frontend — `tv.astro` page

**Files:**
- Create: `cafetton-casero/src/pages/e/[identifier]/tv.astro`

```astro
---
export const prerender = false

import TemplateLayout from '../../../layouts/template.astro'
import TvSlideshow from '../../../components/moments/TvSlideshow'
import { fetchEventOgData } from '../../../lib/og'

const EVENTS_URL = import.meta.env.PUBLIC_EVENTS_URL as string ?? 'http://localhost:8080/'
const { identifier } = Astro.params

let ogTitle = 'Muro en vivo'
let ogDesc  = 'Momentos del evento en tiempo real.'

if (identifier) {
  const ev = await fetchEventOgData(EVENTS_URL, identifier)
  if (ev?.name) {
    ogTitle = `En vivo — ${ev.name}`
    ogDesc  = `Slideshow en vivo de los momentos de ${ev.name}.`
  }
}
---

<TemplateLayout title={ogTitle} ogTitle={ogTitle} ogDescription={ogDesc}>
  <TvSlideshow client:only="react" EVENTS_URL={EVENTS_URL} />
</TemplateLayout>

<style is:global>
  /* TV mode: no scroll, no cursor after 3s idle */
  body { overflow: hidden; background: #000; }
</style>

<script is:inline>
  /* Auto-hide cursor after 3s idle — ideal for TV/kiosk */
  ;(function () {
    var t
    document.addEventListener('mousemove', function () {
      document.body.style.cursor = 'default'
      clearTimeout(t)
      t = setTimeout(function () { document.body.style.cursor = 'none' }, 3000)
    })
  })()
</script>
```

### Step 2: Build both projects

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero" && npm run build 2>&1 | tail -20
```
Expected: "build complete" or similar, no errors.

### Step 3: Commit frontend

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
git add src/components/moments/TvSlideshow.tsx src/pages/e/\[identifier\]/tv.astro
git commit -m "feat(tv): fullscreen live slideshow at /e/[identifier]/tv"
```

---

## Task 5: Add TV link to dashboard moments-wall toolbar

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

The MomentsWall receives `eventIdentifier` prop. Add a button in Row 2 (sharing & settings row, around line 1542) so the admin can open the TV view directly from the dashboard.

Find this block in Row 2 (after the `Muro publicado` / `Publicar muro` button section, before the existing `/* Separator */`):
```tsx
          {/* Separator */}
          <div className="hidden sm:block h-5 w-px bg-white/10" />

          {/* Vista previa admin */}
          <button
```

Add BEFORE that separator:
```tsx
          {/* TV mode link */}
          {eventIdentifier && (
            <a
              href={`${process.env.NEXT_PUBLIC_ASTRO_URL ?? 'http://localhost:4321'}/e/${eventIdentifier}/tv`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-white/10 transition-colors"
              title="Abrir modo TV en nueva pestaña"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="hidden sm:inline">Modo TV</span>
            </a>
          )}
```

### Step 2: TypeScript check

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && npx tsc --noEmit
```
Expected: zero errors.

### Step 3: Commit and push all

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts"
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments-wall): add Modo TV link to toolbar"
git push

cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
git push

wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && git push"
```

---

## Manual Test Checklist

### Drag & Drop
- [ ] Switch to "Aprobados" tab in dashboard → "Reordenar" button appears
- [ ] Click "Reordenar" → drag handles appear on cards, cursor changes to grab
- [ ] Drag a card to a new position → card moves, others shift smoothly
- [ ] Wait 1s after dropping → toast "Guardando orden…" → "Orden guardado"
- [ ] Click "Restablecer orden" → toast, cards return to chronological
- [ ] Switch to any other filter tab → drag mode auto-exits
- [ ] `PATCH /moments/reorder` visible in Network tab with correct payload

### TV Mode
- [ ] Open `/e/[identifier]/tv` in browser
- [ ] Photos advance every 6s with Ken-Burns zoom
- [ ] Progress bar fills and resets on advance
- [ ] Arrow keys navigate, Space does nothing (no text inputs to scroll)
- [ ] Press F → fullscreen
- [ ] Cursor hides after 3s of no movement
- [ ] QR code visible bottom-left, hides after 10s idle, reappears on mousemove
- [ ] Video slides auto-advance on `ended`
- [ ] Dashboard "Modo TV" button opens correct URL in new tab
- [ ] After polling (30s), new approved moments appear in queue

### Order on Public Wall
- [ ] Reorder moments in dashboard → refresh public wall → new order matches
