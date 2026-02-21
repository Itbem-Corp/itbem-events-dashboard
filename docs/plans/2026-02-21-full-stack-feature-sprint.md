# Full-Stack Feature Sprint — 2026-02-21

## Scope

Three-project sprint: Go backend, Astro.js public frontend (cafetton-casero), Next.js dashboard.
Goal: expose existing backend infrastructure, improve guest UX on public frontend, add real analytics to dashboard.

---

## 1. Backend (Go) — `itbem-events-backend`

### 1a. EventAnalytics HTTP Endpoint
- Add `GET /api/events/:id/analytics` as a **protected** route (Cognito JWT required)
- Expose existing `EventAnalyticsService` (already implemented, zero routes today)
- Response: `{ views, unique_visitors, rsvp_yes, rsvp_no, updated_at }`
- Register in `routes/routes.go` under the protected group
- Create controller `controllers/events/event_analytics_controller.go`

### 1b. Organizer Contact Fields on EventConfig
- Add 4 nullable string fields to `EventConfig` model:
  - `organizer_name string`
  - `organizer_whatsapp string`
  - `organizer_email string`
  - `organizer_instagram string`
- GORM AutoMigrate picks these up automatically on next start
- Update DTO `dtos/event_config_dto.go` with new fields
- Update `GET /api/events/page-spec?token=` response — include these fields in `meta.contact`
- This allows cafetton to render a dynamic footer with real organizer contact

---

## 2. cafetton-casero (Astro) — Public Guest Frontend

### 2a. Dynamic Footer
- `Footer.tsx` currently has hardcoded WhatsApp/email/Instagram
- Read from `PageSpec.meta.contact` (new fields from backend)
- Graceful fallback: if fields missing, hide that contact item
- Keep the same visual design, just make the data dynamic

### 2b. WhatsApp Share Button
- New `ShareWidget.tsx` component (floating or inline)
- "Compartir por WhatsApp" — deep link with event URL + invite message
- Position: bottom-right corner, visible after scrolling past hero
- Uses `IntersectionObserver` to appear after first section

### 2c. Dietary Restrictions in RSVP
- `RSVPConfirmation.tsx` — add optional field: dietary restrictions / allergias
- Radio or free-text input: Ninguna / Vegetariano / Vegano / Sin gluten / Especificar
- Send in RSVP payload (backend `POST /api/invitations/rsvp` already accepts `notes`)
- Map dietary selection to the `notes` field of the RSVP (no backend change needed)

### 2d. Toast Notification System
- Build lightweight toast via Framer Motion `AnimatePresence` (no new dependency)
- Used in: RSVP success/error, copy-to-clipboard
- `components/common/Toast.tsx` + `useToast.ts` hook
- Replaces any `alert()` or silent failures in the current flow

### 2e. Guest Count Display on RSVP Confirmation
- After successful RSVP confirm, show animated counter: "X personas ya confirmaron"
- Fetch from `GET /api/guests/:key` (public endpoint — already exists)
- Show only `CONFIRMED` count to create social proof

---

## 3. Dashboard (Next.js) — `dashboard-ts`

### 3a. Analytics Tab with Real Data
- Event detail page `events/[id]/page.tsx` — "Analíticas" tab
- Currently empty or mock data
- Call `GET /events/:id/analytics` via SWR
- Four KPI cards: Vistas · Visitantes únicos · RSVP Sí · RSVP No
- Animated progress bars (Confirmed vs Declined)
- `src/components/events/event-analytics-panel.tsx` (new component)

---

## Execution Order

1. Backend: add analytics controller + EventConfig contact fields (Go)
2. cafetton: update types.ts + Footer dynamic + Toast system
3. cafetton: RSVP dietary + share widget + guest count
4. Dashboard: analytics panel component + wire to SWR
5. Docs update: api.md, models.md, frontend-integrator.md, cafetton docs

---

## Non-Goals (out of scope this sprint)

- DesignTemplate CRUD endpoints (Phase 2)
- EventMember staff assignments
- New event type (Quinceañera template)
- EventSchedule section type
- Color palette customization from backend
