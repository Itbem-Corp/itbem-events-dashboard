# Full-Stack Features Design — 2026-02-21

## Overview
Six cohesive features spanning Go backend, Next.js admin dashboard, and Astro public event frontend. Goal: make the platform feel complete and production-grade end-to-end.

---

## Block 1 — Backend: Analytics Auto-Tracking (Go)

**Problem:** `EventAnalytics` model has Views/RSVPConfirmed/RSVPDeclined/MomentUploads fields but no controller ever increments them. All show 0.

**Solution:** Add fire-and-forget goroutine calls to `EventAnalyticsService.UpsertAnalytics()` in 4 controller points:

| File | Trigger | Field |
|---|---|---|
| `controllers/invitations/invitations.go` | `GET /events/page-spec?token=` | `Views + 1` |
| `controllers/invitations/invitations.go` | `POST /invitations/rsvp` (confirmed) | `RSVPConfirmed + 1` |
| `controllers/invitations/invitations.go` | `POST /invitations/rsvp` (declined) | `RSVPDeclined + 1` |
| `controllers/moments/moments.go` | `POST /moments` | `MomentUploads + 1` |

**Pattern:**
```go
go func() {
  analytics, _ := eventanalyticsservice.GetEventAnalyticsByEventID(eventID)
  if analytics == nil {
    analytics = &models.EventAnalytics{EventID: eventID}
  }
  analytics.Views++
  _ = eventanalyticsservice.UpsertEventAnalytics(analytics)
}()
```

**Constraints:** Must not block main response. Use `context.Background()`. Failures silently dropped.

---

## Block 2 — Dashboard: Analytics Tab with Real Charts

**Replaces:** 5 static KPI cards in event detail "Analíticas" tab.

**Data sources (existing):**
- `GET /events/:id/analytics` → views, rsvp counts, moment counts
- `GET /guests/:identifier` → guest list for role breakdown

**New layout:**
```
┌─────────────────────────────────────────────────────────┐
│  4 KPI cards: Views │ Confirmed │ Declined │ Rate%       │
├──────────────────────────────┬──────────────────────────┤
│  RSVP Funnel (bar horizontal)│  Guest Role Donut chart  │
│  Invited → Responded →       │  graduate / guest / vip  │
│  Confirmed / Declined        │  speaker / staff / host   │
├──────────────────────────────┴──────────────────────────┤
│  Response Rate Ring (ProgressRing component, centered)   │
└─────────────────────────────────────────────────────────┘
```

**Library:** `recharts` (install required). All charts dark-themed (zinc-800 bg, zinc-100 text).

**Skeleton loaders:** Per section while data loads.

---

## Block 3 — Dashboard: QR Scanner in Check-in Page

**Adds to:** `/events/[id]/checkin` page.

**UX flow:**
1. New "Escanear QR" button in sticky header (next to search)
2. Click → fullscreen camera overlay with animated scan frame (CSS, no canvas)
3. `@zxing/browser` (dynamic import, ~40KB) decodes QR → extracts `pretty_token`
4. Match token against local guest list (no extra API call)
5. Found → toast success + green flash → call `PUT /guests/:id` with `rsvp_status: "confirmed"` → auto-close scanner
6. Not found → toast error, scanner stays open

**Dependencies:** `@zxing/browser` (npm install in dashboard-ts).

**Constraints:** Dynamic import so it doesn't bloat initial bundle. Works on mobile Safari + Chrome. Requests camera permission gracefully.

---

## Block 4 — Public Frontend: AgendaSection SDUI Component

**New file:** `cafetton-casero/src/components/sections/AgendaSection.tsx`

**Registered as:** `"Agenda"` in `registry.ts`

**Config schema:**
```typescript
interface AgendaConfig {
  title?: string          // "Programa del día"
  subtitle?: string       // optional
  items: AgendaItem[]
}
interface AgendaItem {
  time: string           // "14:00"
  title: string          // "Ceremonia"
  description?: string   // optional detail
  icon?: string          // "ceremony" | "reception" | "dinner" | "party" | "music" | "photo"
  location?: string      // optional venue name
}
```

**UI:** Vertical timeline (centered line, left-side times, right-side content on mobile → two-column on desktop). Stagger entrance animation on scroll. Icons mapped to emoji/SVG. Colors: gold `#C7A44C` for line + dots, coffee `#8B5D3D` for times. Font: `font-astralaga` for title, `font-aloevera` for items.

**Hydration:** Lazy (IntersectionObserver, 150px margin). Error boundary wrapped.

**Dashboard Studio config editor:** Dynamic array editor — add/remove/reorder items with time + title + description + icon fields. No drag-drop (keep it simple).

---

## Block 5 — Public Frontend: Dynamic OG Tags

**Files:** `evento.astro`, `graduacion-izapa.astro`, `AndresIvanna/Confirmacion.astro`

**Strategy:** Astro SSR — fetch event data server-side using token from URL params, inject into `<head>` before HTML is sent.

**Tags added:**
```html
<meta property="og:title" content="{event.name}" />
<meta property="og:description" content="{event.description | date + location}" />
<meta property="og:image" content="{event.cover_image_url}" />
<meta property="og:url" content="{canonical_url}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{event.name}" />
<meta name="twitter:image" content="{event.cover_image_url}" />
```

**Fallback:** Generic app name + logo if no token/cover image.

---

## Block 6 — Public Frontend: RSVP Confirmation Card with QR

**In:** `RSVPConfirmation.tsx` — shown after successful RSVP POST.

**UX flow:**
1. RSVP submitted → existing confirmation state shows
2. Below confirmation text: animated card slides up (Motion)
3. Card contains:
   - Guest name (large, `font-astralaga`)
   - Event name + formatted date
   - QR code (encodes `{FRONTEND_URL}/evento?token={pretty_token}`)
   - "Presenta este QR en la entrada"
4. Two buttons: "Compartir por WhatsApp" (wa.me link) + "Guardar imagen" (`html-to-image`)

**Dependencies:** `qrcode.react` + `html-to-image` (dynamic imports).

**Constraints:** Both libs loaded only after RSVP confirm (code splitting). Card styled with white bg + gold border for print/screenshot aesthetics. Works on mobile.

---

## Implementation Order

1. Backend analytics (Go WSL) — parallel with other work
2. Public frontend OG tags — quick win, low risk
3. Public frontend AgendaSection — new component
4. Dashboard analytics charts — install recharts, build charts
5. Public frontend RSVP confirmation card — after AgendaSection done
6. Dashboard QR scanner — last (most interactive)

## Files to Create/Modify

### Backend (WSL: `/var/www/itbem-events-backend`)
- `controllers/invitations/invitations.go` — add analytics goroutines
- `controllers/moments/moments.go` — add analytics goroutine

### Dashboard (`dashboard-ts`)
- `src/app/(app)/events/[id]/page.tsx` — replace analytics tab content
- `src/components/events/event-analytics-panel.tsx` — new charts component
- `src/app/(app)/events/[id]/checkin/page.tsx` — add QR scanner
- `src/components/events/qr-scanner.tsx` — new scanner component
- `src/components/events/event-sections-manager.tsx` — add Agenda config editor
- `package.json` — add recharts, @zxing/browser

### Public Frontend (`cafetton-casero`)
- `src/components/sections/AgendaSection.tsx` — new section
- `src/components/engine/registry.ts` — register Agenda type
- `src/components/engine/types.ts` — add AgendaConfig type
- `src/pages/evento.astro` — OG tags
- `src/pages/graduacion-izapa.astro` — OG tags
- `src/pages/AndresIvanna/Confirmacion.astro` — OG tags
- `src/components/sections/RSVPConfirmation.tsx` — add confirmation card
- `package.json` — add qrcode.react, html-to-image
