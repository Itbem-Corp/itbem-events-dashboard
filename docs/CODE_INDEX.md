# Code Index — Dashboard

> One-read saves 5,000+ tokens of file searching. Read this before exploring source.
> Last updated: 2026-02-23

---

## Models (`src/models/`) — 28 files

| File | Purpose |
|------|---------|
| `BaseEntity.ts` | `id`, `created_at`, `updated_at`, `deleted_at` — all models extend this |
| `Event.ts` | Core event: name, identifier, date, timezone, cover, config, type |
| `EventConfig.ts` | Event settings: public/auth flags, uploads, RSVP, section toggles |
| `EventAnalytics.ts` | Analytics record for an event |
| `EventSection.ts` | Section record (type, order, config JSON) |
| `EventType.ts` | Event type (wedding, graduation, etc.) |
| `EventMember.ts` | Staff/admin member of an event |
| `Guest.ts` | Guest: personal info, RSVP, table, status, rich profile fields |
| `GuestStatus.ts` | Status enum: PENDING / CONFIRMED / DECLINED / CANCELLED |
| `Moment.ts` | Photo/video upload: `processing_status`, `is_approved`, `content_url` |
| `Invitation.ts` | Personal invitation record linked to a guest |
| `InvitationLog.ts` | Log entry for invitation activity |
| `InvitationAccessToken.ts` | Token for RSVP access |
| `Table.ts` | Seating table (number, capacity, guests) |
| `Client.ts` | Client (event organizer account) |
| `ClientType.ts` | Client type: AGENCY / DIRECT |
| `ClientRole.ts` | Role within a client |
| `User.ts` | Admin user (dashboard login) |
| `Resource.ts` | Media resource (cover image, gallery item, etc.) |
| `ResourceType.ts` | Resource type enum |
| `MomentType.ts` | Moment type: photo / video |
| `DesignTemplate.ts` | Visual template (fonts, colors, layout) |
| `Color.ts` / `ColorPalette.ts` / `ColorPalettePattern.ts` | Design system color types |
| `Font.ts` / `FontSet.ts` / `FontSetPattern.ts` | Design system font types |

**ProcessingStatus enum** (in `Moment.ts`):
```
''           → legacy direct upload, shown immediately
'pending'    → queued for Lambda, NOT shown in dashboard
'processing' → Lambda working, NOT shown in dashboard
'done'       → Lambda completed, ready to approve
'failed'     → Lambda failed, raw file is ContentURL
```
Backend `GET /moments?event_id=X` already filters out `pending` and `processing`.

---

## Lib (`src/lib/`) — 7 files

| File | Purpose |
|------|---------|
| `api.ts` | Axios instance; auto-attaches `Authorization: Bearer`; 401→logout; 403→toast |
| `fetcher.ts` | SWR fetcher: `api.get(url).then(r => r.data?.data ?? r.data)` |
| `normalizer.ts` | Response interceptor: normalizes PascalCase keys → snake_case |
| `sanitize-event.ts` | `sanitizeEvent()` — in-memory defaults; `detectEventIssues()` — health checks |
| `guest-utils.ts` | `getEffectiveStatus()` and guest list helpers |
| `event-type-label.ts` | `eventTypeLabel(event)` → human-readable event type string |
| `utils.ts` | Generic utility functions |

---

## Hooks (`src/hooks/`) — 2 files

| File | Purpose |
|------|---------|
| `useEventHealthCheck.ts` | Runs once per event load; detects issues; logs them (repair endpoint pending) |
| `useDebounce.ts` | Generic debounce hook |

---

## Components (`src/components/`)

### UI — generic, stateless (`src/components/ui/`)

| File | Purpose |
|------|---------|
| `empty-state.tsx` | `<EmptyState icon title description action>` — animated, motion-based |
| `stat-card.tsx` | Dashboard metric card with icon and value |
| `page-transition.tsx` | Motion wrapper for page entrance animations |
| `animated-list.tsx` | Staggered list animation wrapper |
| `progress-ring.tsx` | SVG circular progress indicator |
| `command-palette.tsx` | Keyboard command palette (Cmd+K) |
| `notification-bell.tsx` | Notification indicator |
| `pagination.tsx` | Pagination controls |
| `file-upload.tsx` | File input with drag-and-drop |
| `branded-qr.tsx` | QR code with branding overlay |
| `dropdown-menu.tsx` | Dropdown menu primitives |
| `UserAvatar.tsx` | Avatar with initials fallback |

### Events — business logic (`src/components/events/`)

| File | Purpose |
|------|---------|
| `moments-wall.tsx` | **CORE** — filter tabs, lightbox, QR modal, ZIP download, SWR 15s refresh |
| `event-config-panel.tsx` | Event settings form (uploads, RSVP, visibility toggles) |
| `event-sections-manager.tsx` | Manage event page sections (add/remove/reorder) |
| `event-cover-upload.tsx` | Cover image upload with S3 presigned URL |
| `event-design-picker.tsx` | Visual template picker (lazy-loaded) |
| `event-analytics-panel.tsx` | Recharts analytics dashboard |
| `event-share-panel.tsx` | Share link + embed code |
| `invitation-tracker.tsx` | Track invitation opens and RSVPs |
| `rsvp-tracker.tsx` | RSVP funnel view (confirmed/declined/pending) |
| `event-active-toggle.tsx` | Toggle event active state |
| `event-duplicate-modal.tsx` | Duplicate an event |
| `event-error-boundary.tsx` | React Error Boundary for event pages |
| `event-section-resources.tsx` | Section resource management |
| `qr-scanner.tsx` | QR code scanner for guest check-in |
| `seating-plan.tsx` | Legacy seating plan |
| `forms/event-form-modal.tsx` | Create/edit event modal form |

### Seating (`src/components/events/seating/`)

| File | Purpose |
|------|---------|
| `seating-plan-v2.tsx` | V2 seating plan (lazy-loaded via dynamic import) |
| `table-card.tsx` | Individual table visual card |
| `table-form-modal.tsx` | Add/edit table modal |
| `guest-chip.tsx` | Draggable guest chip for seating |
| `assign-bottom-sheet.tsx` | Mobile-friendly guest assignment panel |
| `seating-toolbar.tsx` | Seating plan toolbar controls |
| `unassigned-panel.tsx` | Unassigned guests sidebar |
| `capacity-ring.tsx` | Table capacity visual indicator |

### Studio (`src/components/studio/`)

| File | Purpose |
|------|---------|
| `draggable-section-list.tsx` | Drag-and-drop section reordering |
| `draggable-section-row.tsx` | Single draggable row |
| `section-config-editor.tsx` | Edit section config JSON |
| `studio-preview.tsx` | Live preview panel |
| `quick-config-panel.tsx` | Quick section settings sidebar |

### Guests (`src/components/guests/`)

| File | Purpose |
|------|---------|
| `guest-status-badge.tsx` | Status chip (CONFIRMED / PENDING / etc.) |
| `guest-status-select.tsx` | Inline status dropdown |
| `guest-delete-modal.tsx` | Delete confirmation modal |
| `forms/guest-form-modal.tsx` | Create/edit guest modal |
| `forms/guest-batch-modal.tsx` | Bulk guest import modal |

### Clients (`src/components/clients/`)
- `forms/client-form-modal.tsx`, `forms/delete-client-modal.tsx`, `client-members-modal.tsx`

### Users (`src/components/users/`)
- `index.tsx`, `forms/user-form-modal.tsx`, `delete-user-modal.tsx`, `UserActiveToggle.tsx`

### Session
- `session/SessionBootstrap.tsx` — runs once at app boot; loads user profile into Zustand store

### Root-level Catalyst components (design system primitives)
`button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, `switch.tsx`, `radio.tsx`, `dialog.tsx`, `dropdown.tsx`, `table.tsx`, `pagination.tsx`, `avatar.tsx`, `heading.tsx`, `text.tsx`, `link.tsx`, `divider.tsx`, `fieldset.tsx`, `description-list.tsx`, `navbar.tsx`, `sidebar.tsx`, `combobox.tsx`, `listbox.tsx`, `alert.tsx`, `stacked-layout.tsx`, `sidebar-layout.tsx`, `auth-layout.tsx`, `application-layout.tsx`, `error-boundary.tsx`, `UserHeader.tsx`

---

## Pages (`src/app/`)

### Protected — `src/app/(app)/`  (all auto-protected by middleware)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `(app)/page.tsx` | Home dashboard: active events, stats, next event guests |
| `/events` | `(app)/events/page.tsx` | Event list with search and filters |
| `/events/[id]` | `(app)/events/[id]/page.tsx` | Event detail tabs: guests, moments, analytics, config, seating |
| `/events/[id]/studio` | `(app)/events/[id]/studio/page.tsx` | Section builder / studio |
| `/events/[id]/checkin` | `(app)/events/[id]/checkin/page.tsx` | QR check-in scanner |
| `/orders` | `(app)/orders/page.tsx` | Orders list |
| `/orders/[id]` | `(app)/orders/[id]/page.tsx` | Order detail |
| `/clients` | `(app)/clients/page.tsx` | Client management (root only) |
| `/users` | `(app)/users/page.tsx` | User management (root only) |
| `/users/[id]/clients` | `(app)/users/[id]/clients/page.tsx` | User's client assignments |
| `/settings/profile` | `(app)/settings/profile/page.tsx` | Profile settings |

### Auth — `src/app/(auth)/` (public)
- `(auth)/register/page.tsx` — Register
- `(auth)/forgot-password/page.tsx` — Password reset

### Layouts
| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout: Toaster, Vercel Analytics, Inter font, dark mode |
| `src/app/(app)/layout.tsx` | App layout: SessionBootstrap, SWRConfig, route guards, ApplicationLayout |
| `src/app/(auth)/layout.tsx` | Auth layout: centered card wrapper |

---

## Store

| File | Purpose |
|------|---------|
| `src/store/useStore.ts` | Zustand store: `token`, `user`, `currentClient`, `profileLoaded`, `setToken`, `clearSession` |

---

## Tests (`tests/unit/components/`)

Mirror the component structure under `src/components/`. Vitest + React Testing Library.

---

## Config Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration |
| `middleware.ts` | Next.js middleware — Cognito auth guard on `(app)` routes |
| `.env.example` | `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_ASTRO_URL` |
| `tailwind.config.ts` | Tailwind v4 config |
| `next.config.ts` | Next.js config |
