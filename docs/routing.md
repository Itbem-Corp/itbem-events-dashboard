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

## Navigation and route policy

There is one policy, in `src/lib/application-navigation.ts`:

- `createApplicationNavigation({ accessProfile, hasApplicationSession, isRoot, modules, product })`
  decides what the shell shows: `hasEvents`, `canViewMetrics`, `canManageMembers`,
  `canViewAudit`, `canViewUsers`, `canViewOrganizations`, `canUseAutomation`,
  `canManageAutomationConfiguration`, `canSwitchOrganizations`, plus
  `showHome`, `eventsLabel`, `showWorkspaceBlock` and `landingPath`.
- `resolveApplicationRouteRedirect({ pathname, navigation, product, organizationContextPending })`
  returns where a route must go, or `null` when it is allowed. The target is
  always allowed itself, so a redirect never chains or loops.
- `isGuardedPath(pathname)` lists the routes that may not render before the
  policy decides: `/audit`, `/metrics`, `/team`, `/users`, `/clients`,
  `/automation` (whole segments).

`AppLayoutClient` builds the access profile (`useAccessProfile()`), the
navigation and the redirect once and passes the profile and navigation to
`ApplicationLayout`. The sidebar, bottom navigation, command palette and brand
links all read the same navigation object.

| Item | Visible when | Direct URL without access |
| --- | --- | --- |
| Inicio `/` | `showHome` | `/events` when Inicio is hidden and the user can open events |
| Eventos / Mis eventos `/events` | `hasEvents` (organization or caller-access workspace with `events:view`) | `landingPath` |
| Métricas `/metrics` | `canViewMetrics` (never in the caller-access workspace) | `landingPath` |
| Equipo `/team` | `canManageMembers` (never in the caller-access workspace) | `landingPath` |
| Auditoría `/audit` | `canViewAudit` (platform context) | `landingPath` |
| Usuarios `/users`, Clientes `/clients` | Platform context with the capability | `landingPath` |
| Automatización `/automation` | ITBEM platform context with an automation capability | `landingPath`; `/automation/settings` without Root 1 goes to `/automation` |

`landingPath` is `/` when `showHome`, otherwise `/events` (or `/` when the user
cannot open events either, so nothing loops). `/events` and `/team` wait while
an organization member's workspace is still being chosen
(`organizationContextPending`), as before.

On EventiApp (`manifest.shell.memberWorkspace === 'caller-access'`) Inicio,
Métricas and the workspace block are for roots and Owner/Admin only; every
other role, and event clients ("Mis eventos"), work from the event list. An
Owner of one organization who is an editor in another sees Inicio and
Métricas only while working in the organization they own.

**Guard before data.** When the product sets `shell.guardBeforeRender`
(EventiApp), a guarded path or `/` renders `RouteGuardSkeleton` ("Verificando
acceso") instead of the page until the profile is loaded, the session is
present and the policy allows the route. A denied page therefore never mounts
and never requests its data. Products without the flag render as before and
redirect from the effect. The UI guard is not a control: the backend denies the
same APIs.

`/orders` is not a navigation item. Its legacy URLs remain only as redirects to
`/events` until a real payments backend contract is defined.

## Adding a Route

1. `src/app/(app)/feature/page.tsx` with `'use client'`
2. Declare the route in the product's `routes.ts` and add the flag to `createApplicationNavigation`
3. Add the rule to `resolveApplicationRouteRedirect` (and to `isGuardedPath` if the page must not mount before the decision)
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
