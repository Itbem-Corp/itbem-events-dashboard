# Authentication & Authorization

Provider: AWS Cognito — OAuth 2.0 Authorization Code Flow.

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
COGNITO_CLIENT_ID=
COGNITO_DOMAIN=
COGNITO_REDIRECT_URI=
COGNITO_LOGOUT_REDIRECT_URI=     ← used in /auth/logout route
```

## Auth Flow

```
/auth/login route
  → redirect to Cognito (scopes: openid profile email phone)
  → Cognito authenticates → GET /auth/callback?code=...
  → exchange code for tokens (POST Cognito /token)
  → set cookies: session=id_token (1h httpOnly) · refresh_token (30d httpOnly)
  → redirect /
  → SessionBootstrap mounts:
      GET /api/auth/token   → raw JWT from session cookie
      decodeJWT(token)      → extract sub, email, given_name, family_name
      GET /api/users        → full user profile
      store.setProfile(user)
```

## Middleware (`src/middleware.ts`)

Excludes: `/_next/*` `/api/*` static files
Public paths: `/login` `/auth` `/logout`

```
no session cookie + private route → redirect /login
session cookie    + public route  → redirect /
```

## Token Flow

```
getAuthToken()               (in src/lib/api.ts)
  → fetch /api/auth/token   (Next.js internal route, reads session cookie)
  → returns JWT string
  → Axios injects: Authorization: Bearer <token>
```

HTTP 401 → `store.clearSession()` + `window.location = '/logout'`

## Session Cookies

| Cookie | Value | TTL |
|---|---|---|
| `session` | Cognito id_token (JWT) | 1 hour |
| `refresh_token` | Cognito refresh token | 30 days |

## Route Authorization

Enforced in `(app)/layout.tsx` after `profileLoaded = true`:

| Role | Allowed | Blocked |
|---|---|---|
| `is_root=true` | `/clients` `/users` | `/events` `/team` |
| `is_root=false` | `/events` `/orders` `/team` | `/clients` `/users` |
| AGENCY client | `/sub-clients` | — |
| non-AGENCY | — | `/sub-clients` |

## SessionBootstrap (`src/components/session/SessionBootstrap.tsx`)

Invisible client component inside `(app)/layout.tsx`.
- Runs when: `token !== null && profileLoaded === false`
- Decodes JWT locally (via `decodeJWT`) to extract user data before API call completes
- On error: `store.clearSession()` → logout redirect
- On success: `store.setProfile(user)` → `profileLoaded = true`

## JWT Decoder (`src/utils/jwt.ts`)

`decodeJWT(token)` — base64url decode of payload, no signature verification.
Claims extracted: `sub` `email` `given_name` `family_name`

## Logout (`src/app/(auth)/logout/route.ts`)

Clears cookies: `session` `access_token` `refresh_token`
Redirects to Cognito logout URL using `COGNITO_LOGOUT_REDIRECT_URI`.

## Auth UI Pages (templates only — no backend)

- `/register` — email, name, password, country fields. Currently UI only.
- `/forgot-password` — email field. Currently UI only.
