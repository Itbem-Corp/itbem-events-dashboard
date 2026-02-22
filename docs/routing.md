# Routing

## Route Map

| URL | File | Guard |
|---|---|---|
| `/` | `(app)/page.tsx` | session |
| `/clients` | `(app)/clients/page.tsx` | `is_root` |
| `/users` | `(app)/users/page.tsx` | `is_root` |
| `/events` | `(app)/events/page.tsx` | non-root |
| `/events/[id]` | `(app)/events/[id]/page.tsx` | non-root |
| `/events/[id]/studio` | `(app)/events/[id]/studio/page.tsx` | non-root — fullscreen event studio editor |
| `/events/[id]/checkin` | `(app)/events/[id]/checkin/page.tsx` | non-root — day-of check-in mode |
| `/orders` | `(app)/orders/page.tsx` | non-root |
| `/settings/profile` | `(app)/settings/profile/page.tsx` | session |
| `/login` | `(auth)/login/page.tsx` | → redirects to `/auth/login` |
| `/register` | `(auth)/register/page.tsx` | UI template only (no backend) |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | UI template only (no backend) |
| `/logout` | `(auth)/logout/page.tsx` | link to `/auth/logout` route |
| `/auth/login` | `(auth)/login/route.ts` | → redirects to Cognito |
| `/auth/logout` | `(auth)/logout/route.ts` | clears cookies + Cognito logout |
| `/auth/callback` | `auth/callback/route.ts` | OAuth code exchange |

> `/register` and `/forgot-password` are UI shells — they have no backend wiring yet.

## Middleware (`src/middleware.ts`)

Excludes: `/_next/*` `/_next/image/*` `/favicon.ico` `/api/*`
Public paths: `/login` `/auth` `/logout`

```
no session + private route → /login
session    + public route  → /
```

## Layout Hierarchy

```
app/layout.tsx              Root — Inter font, dark colorScheme, title template '%s - Catalyst'
  (app)/layout.tsx          Protected — SessionBootstrap + role guards → ApplicationLayout
  (auth)/layout.tsx         Auth — AuthLayout (centered card)
```

## Navigation Items (sidebar)

Defined in `src/components/application-layout.tsx`:

| Item | Visible to | Guard |
|---|---|---|
| Home `/` | Everyone | — |
| Events `/events` | Non-root only | `!isRoot` in nav + redirect in layout |
| Orders `/orders` | Non-root only | `!isRoot` in nav |
| Users `/users` | Root only | `isRoot` in nav + redirect in layout |
| Clients `/clients` | Root only | `isRoot` in nav + redirect in layout |

Route guards are applied in two layers:
1. **Nav visibility** (`application-layout.tsx`): items conditionally rendered by `isRoot`
2. **Layout redirect** (`(app)/layout.tsx`): any direct URL access is redirected to `/` if role doesn't match

## Adding a Route

1. `src/app/(app)/feature/page.tsx` with `'use client'`
2. Add nav item in `src/components/application-layout.tsx`
3. Add role guard in `src/app/(app)/layout.tsx` if restricted
4. Document endpoint in `docs/api.md`
5. Update this file

## Event Detail Page — Tabs

`/events/[id]` renders a tabbed layout. The six tabs and their content components are:

| Tab slug | Label | Main component(s) |
|---|---|---|
| `resumen` | Resumen | Event summary cards, `EventCoverUpload`, `EventSharePanel` |
| `invitados` | Invitados | Guest table, `GuestFormModal`, `GuestDeleteModal`, `GuestBatchModal` |
| `rsvp` | RSVP | `RSVPTracker` |
| `momentos` | Momentos | `MomentsWall` |
| `analiticas` | Analíticas | Analytics/KPI cards |
| `configuracion` | Configuración | `EventConfigPanel`, `EventSectionsManager` |

The active tab is tracked via local state (not URL query param). Default tab on load is `resumen`.

## URL Conventions

- Lists: `/features` (plural noun)
- Detail: `/features/[id]`
- Nested settings: `/settings/section`
- Filters as query params: `?client_id=` `?status=` `?page=`

---

## New Tabs - Event Detail `/events/[id]`

| Tab ID | Label | Component | Description |
|--------|-------|-----------|-------------|
| `invitaciones` | Invitaciones | InvitationTracker | Per-guest RSVP tracking, bulk WhatsApp, CSV export |

Tab order: Resumen → Invitados → Invitaciones → RSVP → Momentos → Analíticas → Config
