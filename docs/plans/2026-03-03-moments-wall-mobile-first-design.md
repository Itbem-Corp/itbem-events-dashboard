# MomentsWall Mobile-First Redesign — Design Doc

**Goal:** Make the MomentsWall section fully usable on phone, tablet, and desktop with a progressive-disclosure toolbar pattern.

**Component:** `src/components/events/moments-wall.tsx`

---

## Problem Summary

| Issue | Impact |
|---|---|
| Toolbar is 4 stacked rows on all devices | Phone: ~200px chrome before first photo |
| 7 filter tabs at equal `flex-1` width | ~55px each on 390px, text truncated |
| `max-w-sm` (384px) on modals | 3px margin on iPhone 14 (390px) |
| Grid misses `md` and `xl` breakpoints | Tablet shows 3 cols (same as 640px), desktop maxes at 4 |
| Lightbox actions top bar has 5+ icons | Too tight on narrow screens |
| Card action bar always visible on mobile | Occupies permanent space over photos |

---

## Design Decisions

### 1. Toolbar — Progressive Disclosure

**Phone (< 768px): 2 rows**
- Row 1: Count text (flex-1) + [⬚ Sel] [↓ZIP] [✓ Aprobar] [⋯ Más]
- Row 2: Filter tabs with horizontal scroll
- `⋯ Más` opens a bottom sheet with secondary actions:
  - Rechazar todos pendientes
  - QR código (toggle)
  - Publicar muro (toggle)
  - Preview
  - Ver muro (link)
  - Agrupar por hora (toggle)
  - Compartir muro
  - Reoptimizar legacy (when applicable)

**Tablet (md–lg, 768px–1023px): 3 rows**
- Row 1: Count + all action buttons (Selec, ZIP, Aprobar, Rechazar)
- Row 2: Settings buttons (QR, Publicar, Preview, Ver muro, Agrupar, Share)
- Row 3: Filter tabs with horizontal scroll (+ time range inline when active)

**Desktop (lg+, ≥ 1024px): 4 rows — current structure, refined**
- Same 4-row layout, filter tabs get horizontal scroll too

### 2. Filter Tabs — Horizontal Scroll

All breakpoints:
- Container: `overflow-x-auto scrollbar-hide`
- Each tab: `flex-shrink-0` — natural width, no `flex-1` stretching
- Right-edge fade gradient when more tabs overflow to the right
- Active tab indicator: bottom border (keep existing style)

### 3. Grid Density

| Breakpoint | Min-width | Columns |
|---|---|---|
| default | 0 | 2 |
| `sm` | 640px | 3 |
| `md` | 768px | 4 |
| `lg` | 1024px | 4 |
| `xl` | 1280px | 5 |

Gap: `gap-1` mobile → `gap-1.5` sm+ (keep existing)

### 4. Card Action Bar

- **Mobile**: Always visible, icon-only, thinner (`py-1.5` vs current `py-2`)
- **Desktop**: Keep hover-only with icon + text labels
- Status ring on card border thickened (`ring-2` → `ring-[3px]`) so state visible at a glance without reading the bar

### 5. Modals (QR + WallShare)

Change `max-w-sm` containers to `mx-4 w-full max-w-sm` so there's always at least 16px margin on each side on any device.

### 6. Lightbox — Mobile Reorganization

**Mobile (< md):**
- Top bar: only close button (✕) + position counter (1/24), no action buttons
- Bottom bar (below media): [✓ Aprobar / ✗ Desaprobar] [🗑 Eliminar] [⬇ Descargar] — large touch targets (`h-12 min-w-[4rem]`)

**Desktop (md+):**
- Keep current top bar with all controls

---

## Implementation Scope

1. Toolbar restructure with bottom sheet component
2. Filter tabs to scrollable
3. Grid breakpoints (`md:grid-cols-4 xl:grid-cols-5`)
4. Card action bar thinning
5. Modal padding fix
6. Lightbox mobile reorganization

---

## Out of Scope

- New filter types
- Drag-to-reorder in grid
- Any backend changes
