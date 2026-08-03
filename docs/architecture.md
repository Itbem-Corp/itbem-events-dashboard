# Architecture

## Frontend and backend contract boundary

Language-neutral integration contracts live in `itbem-product-contract`. The dashboard keeps a checked-in runtime projection under `src/contracts` and verifies it against the pinned `.contracts` revision in CI. Pages and product modules consume typed exports from that projection; they must not redefine transport header names or backend workspace semantics.

Keep page-specific composition in `app`, reusable workflow UI in `components/<feature>`, product availability in `products`, and cross-page transport/cache primitives in `lib` or `contracts`. A product package may select a feature, but core transport code must never import a concrete product.

Feature-owned server state belongs under `src/features/<domain>`. Route pages consume feature hooks and should not assemble endpoint paths for composed workspaces such as check-in or Studio. Feature data modules may depend on shared `lib`, models, and hooks, but never on `app` route composition or another concrete product.

`src/products/core` is the only product-neutral package. It may depend on
contracts and shared primitives, but it must not import a concrete product.
Concrete product manifests may select features and route exposure, but they do
not own transport code. Architecture tests enforce both directions in CI.

Paginated list features own both their query hook and their path builder. Rendering and URL filter state remain in the route, while request parameters, response normalization, SWR policy, and tenant-scoped keys remain together in the feature. This keeps visible page behavior editable without duplicating backend integration details.

## Project Scope

This repo (`dashboard-ts`) is the **admin dashboard frontend only**.

| Frontend                     | Purpose                                       | Local path                                                  | GitHub                                                    |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| **dashboard-ts** (this repo) | Admin dashboard — management, analytics       | `C:\Users\AndBe\Desktop\Projects\EventiApp\dashboard-ts`    | _(check `git remote -v`)_                                 |
| **cafetton-casero**          | Public event pages — RSVP, gallery, countdown | `C:\Users\AndBe\Desktop\Projects\EventiApp\cafetton-casero` | `https://github.com/Itbem-Corp/itbem-events-frontend.git` |

The backend serves **both** frontends. Dashboard uses only the **protected routes** (Cognito JWT required), including admin-only section media under `/api/admin/resources/section/*`. Public event routes (`/api/invitations/*`, `/api/resources/section/*`, `/api/events/section/*/attendees`) are for cafetton-casero.

Cross-project tasks → `docs/frontend-integrator.md`

## Backend Reference

- **GitHub**: `git@github.com:Itbem-Corp/itbem-events-backend.git`
- **Local**: `C:\Users\AndBe\Desktop\Projects\EventiApp\itbem-events-backend`
- **Stack**: Go 1.25 + Echo v4 + GORM + PostgreSQL + Redis + AWS S3 + Cognito
- **Pattern**: Controller → Service → Repository (3-layer clean architecture)
- Full route list and contracts → `docs/backend-agent.md`

## Frontend Source Layout

```
src/
├── app/
│   ├── (app)/              Protected routes (session cookie required)
│   │   ├── page.tsx        Dashboard — KPIs + active events
│   │   ├── clients/        Client management (root only)
│   │   ├── events/         Event listing + [id] detail
│   │   ├── orders/         Legacy server redirects → /events (no payment contract yet)
│   │   ├── users/          User management (root only)
│   │   └── settings/profile/ Profile editor
│   ├── (auth)/             Public auth routes
│   │   ├── login/          → redirects to /auth/login
│   │   ├── logout/         → link to /auth/logout route
│   │   ├── register/       UI template (no backend yet)
│   │   └── forgot-password/ UI template (no backend yet)
│   ├── api/auth/token/     Internal: reads session cookie → JWT
│   └── auth/callback/      OAuth code exchange
├── components/
│   ├── ui/                 UserAvatar · FileUpload · DropdownMenu (Radix)
│   ├── session/            SessionBootstrap
│   ├── clients/forms/      ClientFormModal · DeleteClientModal
│   ├── users/              UserFormModal · DeleteUserModal · UserActiveToggle
│   ├── sidebar.tsx         Sidebar primitives
│   ├── sidebar-layout.tsx  Two-column layout (sidebar + content)
│   ├── stacked-layout.tsx  Vertical layout variant
│   ├── navbar.tsx          Navbar primitives
│   ├── application-layout.tsx  Full app shell
│   ├── auth-layout.tsx     Auth centered card
│   └── [40+ UI primitives] Button · Input · Dialog · Alert · Table · Badge…
├── hooks/
│   └── useEventHealthCheck.ts  Self-healing hook (detect issues → repair → revalidate)
├── lib/
│   ├── api.ts              Axios instance (auth interceptors)
│   ├── fetcher.ts          SWR fetcher
│   ├── sanitize-event.ts   In-memory event sanitizer + issue detector
│   └── utils.ts            cn() = clsx + tailwind-merge
├── models/                 40+ TypeScript interfaces (mirror backend GORM models)
├── store/useStore.ts       Zustand global state
├── styles/tailwind.css     Tailwind v4 CSS entry point
└── utils/
    ├── jwt.ts              decodeJWT() — client-side, no sig verification
    └── client-context.ts   isRootClient() helper
```

## Request Lifecycle

```
Browser → middleware.ts (session cookie check)
  → (app)/layout.tsx (role guard after profileLoaded = true)
    → ApplicationLayout (sidebar + navbar shell)
      → Page Component → SWR + Axios → Go backend → PostgreSQL/Redis/S3
```

## Multi-Tenant

- Product boundaries and the extension checklist: `docs/multi-tenant.md`
- The protected server layout resolves the host before hydration and passes the product manifest into the client shell.
- Navigation visibility and intent preloads are pure contracts in `src/lib/application-navigation.ts`; the shell only renders their result.
- Desktop navigation, workspace identity, and account controls are isolated memoized components, so transient shell state does not re-render them.
- Command palette and notification state live in isolated controllers; opening either tool does not update the application shell.
- Product manifests own route exposure and preload policy; product core cannot depend on a concrete product.
- Tenant-sensitive SWR keys include application, workspace mode, and organization. The same context is forwarded to the API as auditable headers, while backend authorization remains authoritative.
- `npm run build:budget` enforces route-level first-load limits for the heaviest dashboard surfaces.
- `currentClient` (Zustand) = active organization
- API calls scoped by client context (backend enforces ownership)
- Root users (`is_root`) can see/manage all clients; non-root see their client(s)
- `isRootClient(client)` → true when `client_type.code === 'PLATFORM'`

## Role Access Matrix

| Role            | Can access          | Blocked from        |
| --------------- | ------------------- | ------------------- |
| `is_root=true`  | `/clients` `/users` | `/events` `/team`   |
| `is_root=false` | `/events` `/team`   | `/clients` `/users` |
| AGENCY client   | `/sub-clients`      | —                   |
| non-AGENCY      | —                   | `/sub-clients`      |

Enforced in `src/app/(app)/layout.tsx` after `profileLoaded = true`.

## Component Library Notes

Two dropdown implementations — use the right one:

- `src/components/dropdown.tsx` (Headless UI) → table row action menus
- `src/components/ui/dropdown-menu.tsx` (Radix UI) → shadcn-style components only

## Key Data Flows

**Login:** `/auth/login` → Cognito → `/auth/callback` → exchange code → set cookies → redirect `/`

**Bootstrap:** `SessionBootstrap` → `POST /api/auth/token` → verified user,
capabilities and organizations → `store.setApplicationSession()` →
`profileLoaded = true`

**Org switch:** `setCurrentClient(client)` → SWR keys change → re-fetch → route guard re-evaluates

**Profile update:** PUT → `store.invalidateProfile()` → SessionBootstrap re-runs → fresh `/users` fetch
