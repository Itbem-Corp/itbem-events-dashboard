# TV Mode + Drag & Drop Reorder — Design Doc

**Date:** 2026-03-03

---

## Feature 1: TV / Slideshow Mode

### Goal
A fullscreen, auto-advancing slideshow of approved moments at `/e/[identifier]/tv`.
Designed to be displayed on a TV or projector at a live event while guests upload in real time.

### Architecture
- **New Astro page:** `cafetton-casero/src/pages/e/[identifier]/tv.astro` — `prerender = false`, no auth
- **New React island:** `cafetton-casero/src/components/moments/TvSlideshow.tsx` — `client:only="react"`
- **Data source:** existing public endpoint `GET /api/events/:identifier/moments?page=1&limit=500`
- **No backend changes required** (public endpoint already exists and returns order field)

### Visual Layout
```
┌────────────────────────────────────────┐
│ [Event name]              [Space=Pause]│  ← top bar, subtle
│                                        │
│         ┌─────────────────┐            │
│         │                 │            │
│         │   Media (fill)  │            │
│         │  Ken-Burns/video│            │
│         └─────────────────┘            │
│  "Caption from guest..."               │  ← bottom center, blur bg
│                                        │
│ [QR code]              [4 / 47]        │  ← corners
│ [████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░] │  ← progress bar, full width
└────────────────────────────────────────┘
```

### Behavior

**Slides:**
- Photos: Ken-Burns effect (subtle random zoom + pan over 6s) + crossfade 800ms
- Videos: auto-play muted, advance on video `ended` event (max 30s cap)
- Progress bar: CSS transition from 0→100% over slide duration, resets on advance

**Navigation:**
- `←` / `→` arrow keys — skip backward/forward
- `Space` — pause/resume
- `F` — toggle browser Fullscreen API
- Click right half → next, click left half → previous (Stories-style)
- Hover → pause timer

**Polling:**
- Fetch every 30s; merge new moment IDs at end of queue without resetting current slide
- Badge "X nuevos momentos" pulses when new media arrives
- Respects `order` field: moments with `order > 0` sorted by order, then `created_at DESC`

**QR overlay:**
- Bottom-left corner
- Semi-transparent pill (white/10 bg, backdrop-blur)
- Links to `/e/[identifier]` (guest upload page)
- Auto-hides after 10s idle, reappears on mouse move (for kiosk/TV mode)

**Empty state:** If no approved moments yet, shows a full-screen "Esperando momentos…" with animated dots and the QR code.

### Files to create/modify
- **Create:** `cafetton-casero/src/pages/e/[identifier]/tv.astro`
- **Create:** `cafetton-casero/src/components/moments/TvSlideshow.tsx`

---

## Feature 2: Drag & Drop Reorder (Dashboard)

### Goal
Admin can drag moments in the approved grid to set a custom display order on the public wall.
The `order` field already exists on the `Moment` model but is never written or read.

### Architecture
- **Dashboard:** `moments-wall.tsx` — uses `@dnd-kit/sortable` (already installed: v10.0.0)
- **New backend endpoint:** `PATCH /moments/reorder` — bulk order update
- **Backend query change:** `ListApprovedForWall` ORDER BY `order ASC` (nulls last) then `created_at DESC`

### UX Flow
1. "Reordenar" button appears in toolbar only when `filter === 'approved'` and `!groupByTime`
2. Click → drag mode activates: drag handles appear on cards, cursor changes to `grab`
3. User drags card to new position → optimistic reorder in local state
4. On drop: debounced 800ms PATCH to `/moments/reorder` with `[{ id, order }]`
5. Toast feedback: `toast.loading("Guardando orden…")` → `toast.success("Orden guardado")`
6. "Restablecer" button resets all orders to 0 (reverts to chronological)
7. Drag mode auto-deactivates if user switches filter tab

### Backend Changes

**1. New endpoint: `PATCH /moments/reorder`**
```json
// Request body
[{ "id": "uuid", "order": 1 }, { "id": "uuid", "order": 2 }]
// Response: 200 OK, { "message": "Order updated" }
```
Implementation: single SQL `UPDATE moments SET order = CASE id WHEN ? THEN ? ... END WHERE id IN (?)`
Or simpler: loop of individual updates in a transaction (max ~500 moments, acceptable).

**2. `ListApprovedForWall` query change:**
```sql
ORDER BY
  CASE WHEN "order" > 0 THEN "order" ELSE 2147483647 END ASC,
  created_at DESC
```
Moments with no custom order fall to the end in their original chronological order.

### Files to create/modify
- **Modify:** `dashboard-ts/src/components/events/moments-wall.tsx`
- **Modify:** `dashboard-ts/src/models/Moment.ts` — add `order?: number`
- **Create:** backend `controllers/moments/reorder.go` (or add to `moments.go`)
- **Modify:** backend `repositories/momentrepository/MomentRepository.go` — add `BulkReorder`
- **Modify:** backend `services/ports/ports.go` — add to interface
- **Modify:** backend `services/moments/MomentService.go` — add wrapper
- **Modify:** backend `routes/routes.go` — register `PATCH /moments/reorder`
- **Modify:** backend `repositories/momentrepository/MomentRepository.go` — update ORDER BY in `ListApprovedForWall`

---

## Order of Implementation
1. Backend: `PATCH /moments/reorder` + ORDER BY change (unblocks both features)
2. Dashboard: Drag & Drop in `moments-wall.tsx`
3. Frontend: `TvSlideshow.tsx` component
4. Frontend: `tv.astro` page

## Tech Stack
- Dashboard: Next.js 15, React 19, `@dnd-kit/sortable` (already installed), `motion`, Tailwind, SWR
- Frontend: Astro 5, React 19, `framer-motion`, Tailwind CSS
- Backend: Go, Echo v4, GORM, PostgreSQL
