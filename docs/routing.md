# Routing

## Route Map

| URL | File | Guard |
|---|---|---|
| `/` | `(app)/page.tsx` | session |
| `/clients` | `(app)/clients/page.tsx` | `is_root` |
| `/users` | `(app)/users/page.tsx` | `is_root` |
| `/events` | `(app)/events/page.tsx` | non-root |
| `/events/[id]` | `(app)/events/[id]/page.tsx` | non-root |
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

| Item | Visible to |
|---|---|
| Home `/` | Everyone |
| Events `/events` | Non-root |
| Orders `/orders` | Non-root |
| Clients `/clients` | Root |
| Users `/users` | Root |
| Sub Clients `/sub-clients` | AGENCY client type only |

## Adding a Route

1. `src/app/(app)/feature/page.tsx` with `'use client'`
2. Add nav item in `src/components/application-layout.tsx`
3. Add role guard in `src/app/(app)/layout.tsx` if restricted
4. Document endpoint in `docs/api.md`
5. Update this file

## URL Conventions

- Lists: `/features` (plural noun)
- Detail: `/features/[id]`
- Nested settings: `/settings/section`
- Filters as query params: `?client_id=` `?status=` `?page=`
