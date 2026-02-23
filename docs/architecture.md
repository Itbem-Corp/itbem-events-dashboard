# Architecture

## Project Scope

This repo (`dashboard-ts`) is the **admin dashboard frontend only**.

| Frontend | Purpose | Local path | GitHub |
|---|---|---|---|
| **dashboard-ts** (this repo) | Admin dashboard — management, analytics | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | *(check `git remote -v`)* |
| **cafetton-casero** | Public event pages — RSVP, gallery, countdown | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | `https://github.com/Itbem-Corp/itbem-events-frontend.git` |

The backend serves **both** frontends. Dashboard uses only the **protected routes** (Cognito JWT required). Public event routes (`/api/invitations/*`, `/api/resources/section/*`) are for cafetton-casero.

Cross-project tasks → `docs/frontend-integrator.md`

## Backend Reference

- **GitHub**: `git@github.com:Itbem-Corp/itbem-events-backend.git`
- **Local (WSL)**: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend`
- **Stack**: Go 1.24 + Echo v4 + GORM + PostgreSQL + Redis + AWS S3 + Cognito
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
│   │   ├── orders/         Orders listing
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
├── data.ts                 Mock data (getOrders, getEvents, getCountries)
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

- `currentClient` (Zustand) = active organization
- API calls scoped by client context (backend enforces ownership)
- Root users (`is_root`) can see/manage all clients; non-root see their client(s)
- `isRootClient(client)` → true when `client_type.code === 'PLATFORM'`

## Role Access Matrix

| Role | Can access | Blocked from |
|---|---|---|
| `is_root=true` | `/clients` `/users` | `/events` `/team` |
| `is_root=false` | `/events` `/orders` `/team` | `/clients` `/users` |
| AGENCY client | `/sub-clients` | — |
| non-AGENCY | — | `/sub-clients` |

Enforced in `src/app/(app)/layout.tsx` after `profileLoaded = true`.

## Component Library Notes

Two dropdown implementations — use the right one:
- `src/components/dropdown.tsx` (Headless UI) → table row action menus
- `src/components/ui/dropdown-menu.tsx` (Radix UI) → shadcn-style components only

## Key Data Flows

**Login:** `/auth/login` → Cognito → `/auth/callback` → exchange code → set cookies → redirect `/`

**Bootstrap:** `SessionBootstrap` → `GET /api/auth/token` → `decodeJWT()` (local) → `GET /api/users` → `store.setProfile()` → `profileLoaded = true`

**Org switch:** `setCurrentClient(client)` → SWR keys change → re-fetch → route guard re-evaluates

**Profile update:** PUT → `store.invalidateProfile()` → SessionBootstrap re-runs → fresh `/users` fetch
