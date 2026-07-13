# Routing

## Route Map

| URL                    | File                                 | Guard                                     |
| ---------------------- | ------------------------------------ | ----------------------------------------- |
| `/`                    | `(app)/page.tsx`                     | session                                   |
| `/clients`             | `(app)/clients/page.tsx`             | `is_root`                                 |
| `/users`               | `(app)/users/page.tsx`               | `is_root`                                 |
| `/events`              | `(app)/events/page.tsx`              | non-root                                  |
| `/events/[id]`         | `(app)/events/[id]/page.tsx`         | non-root                                  |
| `/events/[id]/studio`  | `(app)/events/[id]/studio/page.tsx`  | non-root — fullscreen event studio editor |
| `/events/[id]/checkin` | `(app)/events/[id]/checkin/page.tsx` | non-root — day-of check-in mode           |
| `/orders`              | `(app)/orders/page.tsx`              | legacy → redirects to `/events`           |
| `/orders/[id]`         | `(app)/orders/[id]/page.tsx`         | legacy → redirects to `/events`           |
| `/settings/profile`    | `(app)/settings/profile/page.tsx`    | session                                   |
| `/login`               | `(auth)/login/page.tsx`              | → redirects to `/auth/login`              |
| `/register`            | `(auth)/register/page.tsx`           | invitation-only access notice             |
| `/forgot-password`     | `(auth)/forgot-password/page.tsx`    | → Cognito Hosted UI password recovery     |
| `/logout`              | `(auth)/logout/page.tsx`             | link to `/auth/logout` route              |
| `/auth/login`          | `(auth)/login/route.ts`              | → redirects to Cognito                    |
| `/auth/logout`         | `(auth)/logout/route.ts`             | clears cookies + Cognito logout           |
| `/auth/callback`       | `auth/callback/route.ts`             | OAuth code exchange                       |

> `/register` intentionally explains the invitation-only access model. Password
> recovery is delegated to Cognito Hosted UI instead of duplicating auth logic.

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

The protected layout also mounts `NavigationProgress`, which gives route
transitions delayed, non-blocking feedback without flashing on fast loads.

## Navigation Items (sidebar)

Defined in `src/components/application-layout.tsx`:

| Item               | Visible to    | Guard                                 |
| ------------------ | ------------- | ------------------------------------- |
| Home `/`           | Everyone      | —                                     |
| Events `/events`   | Non-root only | `!isRoot` in nav + redirect in layout |
| Users `/users`     | Root only     | `isRoot` in nav + redirect in layout  |
| Clients `/clients` | Root only     | `isRoot` in nav + redirect in layout  |

`/orders` is not a navigation item. Its legacy URLs remain only as server-side
redirects to `/events` until a real payments backend contract is defined.

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

`/events/[id]` renders a tabbed layout. The eight tabs and their content components are:

| Tab slug        | Label         | Main component(s)                                                       |
| --------------- | ------------- | ----------------------------------------------------------------------- |
| `resumen`       | Resumen       | Event summary cards, `EventCoverUpload`                                 |
| `invitados`     | Invitados     | `EventDetailGuestsPanel`; guest modals mount only when opened           |
| `invitaciones`  | Invitaciones  | `InvitationTracker`                                                     |
| `asientos`      | Mesas         | `SeatingPlanV2`                                                         |
| `rsvp`          | RSVP          | `RSVPTracker`                                                           |
| `momentos`      | Momentos      | `MomentsWall`                                                           |
| `analiticas`    | Analíticas    | `EventAnalyticsPanel`                                                   |
| `configuracion` | Configuración | `EventDetailSettingsPanel` groups sharing, sections, design, and access |

The active tab is tracked via local state (not a URL query parameter), and the
default is `resumen`. Summary stays in the entry chunk; the other seven panels
use `next/dynamic` boundaries with contextual accessible skeletons. Pointer or
keyboard focus preloads a panel before activation. `EventDetailTabs` links the
tablist and active tabpanel, implements roving `tabIndex`, and supports arrow,
Home, and End keys with reduced-motion-aware feedback.

## URL Conventions

- Lists: `/features` (plural noun)
- Detail: `/features/[id]`
- Nested settings: `/settings/section`
- Filters as query params: `?client_id=` `?status=` `?page=`

---

Tab order: Resumen → Invitados → Invitaciones → Mesas → RSVP → Momentos →
Analíticas → Configuración.
