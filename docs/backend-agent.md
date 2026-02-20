# Backend Integrator Agent

## Backend Project

| Field | Value |
|---|---|
| **Local path** | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` |
| **GitHub** | `git@github.com:Itbem-Corp/itbem-events-backend.git` |
| **Framework** | Echo v4 (Go 1.24) |
| **DB** | PostgreSQL via GORM |
| **Cache** | Redis |
| **Storage** | AWS S3 |
| **Auth** | AWS Cognito JWT (JWKS validation) |
| **Image processing** | libvips (bimg) |

The backend has its own `CLAUDE.md` and `docs/` directory (14 markdown files). Read those first when doing backend work.

---

## Project Scope Reminder

This **dashboard-ts** frontend shows **only the admin/management dashboard**:
- Client management, user management, event creation/editing, orders, analytics
- Authenticated users only (Cognito session required)

The **public event guest-facing views** (RSVP, gallery, guestbook, countdown, invitation pages) live in a **separate frontend project** — not this one.

Backend public routes (`/api/events/:key`, `/api/guests/:key`, `/api/invitations/*`) are NOT consumed by this dashboard.

---

## Backend Architecture (quick reference)

```
server.go            ← Echo setup, middleware chain, graceful shutdown
routes/routes.go     ← All route registration (public + protected groups)
controllers/         ← HTTP handlers (14 domains)
services/            ← Business logic (18+ services)
repositories/        ← Data access (28+ repos, generic GORM base)
models/              ← 27 GORM models
dtos/                ← Request/response structs (DTOs)
configuration/       ← DB, Redis, AWS, CORS, env setup
middleware/          ← Token auth, Redis cache, validator
utils/               ← response.go, redisKeys.go, helpers.go
seeds/               ← Reference/catalog data
```

**Three-layer pattern:** Controller → Service → Repository (never skip layers)

---

## Auth Middleware

Protected routes use `middleware/token/token_middleware.go`:
- Validates Cognito JWT against JWKS endpoint
- Injects into Echo context: `cognito_sub`, `user_email`, `config`
- Frontend sends: `Authorization: Bearer <id_token>`

Rate limits:
- Public routes: 20 req/s per IP, burst 40
- Protected routes: 60 req/s per IP, burst 100

---

## Response Envelope

The backend uses `utils.Success()` and `utils.Error()`:
```go
utils.Success(c, http.StatusOK, "message", dataObject)
utils.Error(c, http.StatusBadRequest, "message", errorDetails)
```

> **Action needed:** Validate actual response shape against frontend `fetcher.ts` (`r => r.data`).
> If backend wraps in `{ data: T, message: string }`, fetcher must unwrap: `r => r.data.data`.
> Document result in "Validated Contracts" section below.

---

## All Backend Endpoints

### Public (no auth required)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | DB + Redis health check |
| GET | `/api/events/:key` | Public event view — **NOT used by dashboard** |
| GET | `/api/resources/:id` | Public resource — **NOT used by dashboard** |
| GET | `/api/resources/section/:key` | Section resources — **NOT used by dashboard** |
| GET | `/api/guests/:key` | Guest list — **NOT used by dashboard** |
| GET | `/api/invitations/ByToken/:token` | Invitation by token — **NOT used by dashboard** |
| POST | `/api/invitations/rsvp` | RSVP — **NOT used by dashboard** |

### Protected (require Bearer token)

#### Users
| Method | Path | Controller |
|---|---|---|
| GET | `/api/users` | GetUser — current authenticated user |
| PUT | `/api/users` | UpdateUser — own profile |
| DELETE | `/api/users` | DeleteUser — own account |
| GET | `/api/users/all` | ListAllUsers — root only |
| GET | `/api/users/:id` | GetUserDetail |
| GET | `/api/users/:id/clients` | ListUserClients |
| PUT | `/api/users/:id/activate` | ActivateUser |
| PUT | `/api/users/:id/deactivate` | DeactivateUser |
| POST | `/api/users/invite` | InviteUser — creates via Cognito |
| POST | `/api/users/avatar` | UploadAvatar — multipart |
| DELETE | `/api/users/avatar` | DeleteAvatar |

#### Clients
| Method | Path | Notes |
|---|---|---|
| GET | `/api/clients` | ListMyClients |
| GET | `/api/clients/children` | GetMySubClients |
| GET | `/api/clients/:id` | GetClient |
| POST | `/api/clients` | CreateNewClient — FormData (logo) |
| PUT | `/api/clients/:id` | UpdateClient — FormData |
| DELETE | `/api/clients/:id` | DeleteClient |
| POST | `/api/clients/invite` | InviteUser to client |
| POST | `/api/clients/members` | AddMember |
| GET | `/api/clients/members` | ListClientMembers |
| PUT | `/api/clients/members/:user_id` | UpdateMemberRole |
| DELETE | `/api/clients/members/:user_id` | RemoveMember |

#### Events (dashboard)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/events` | CreateEvent |
| PUT | `/api/events/:id` | UpdateEvent |
| DELETE | `/api/events/:id` | DeleteEvent |
| GET | `/api/events/:id/config` | GetEventConfig |
| PUT | `/api/events/:id/config` | UpdateEventConfig |
| GET | `/api/events/:id/sections` | ListSections |
| POST | `/api/events/:id/sections` | CreateSection |
| PUT | `/api/sections/:id` | UpdateSection |
| DELETE | `/api/sections/:id` | DeleteSection |

#### Guests (dashboard management)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/guests` | CreateGuest |
| POST | `/api/guests/batch` | CreateGuests (atomic) |
| PUT | `/api/guests/:id` | UpdateGuest |
| DELETE | `/api/guests/:id` | DeleteGuest |

#### Resources
| Method | Path | Notes |
|---|---|---|
| POST | `/api/resources` | Upload single — multipart |
| POST | `/api/resources/multiple` | Upload multiple — multipart |
| PUT | `/api/resources/:id/content` | UpdateContent |
| PUT | `/api/resources/:id/replace` | ReplaceFile |
| DELETE | `/api/resources/:id` | DeleteResource |

#### Moments
| Method | Path | Notes |
|---|---|---|
| GET | `/api/moments` | ListMoments |
| GET | `/api/moments/:id` | GetMoment |
| POST | `/api/moments` | CreateMoment |
| PUT | `/api/moments/:id` | UpdateMoment |
| DELETE | `/api/moments/:id` | DeleteMoment |

#### Fonts
| Method | Path |
|---|---|
| POST | `/api/fonts/upload` |

#### Catalogs
| Method | Path |
|---|---|
| GET | `/api/catalogs/client-types` |
| GET | `/api/catalogs/roles` |

#### Cache (admin)
| Method | Path |
|---|---|
| GET | `/api/cache/flush/:key` |
| GET | `/api/cache/flush-all` |

---

## Frontend vs Backend Mismatches (found during audit)

These were wrong in `docs/api.md` before this audit:

| Frontend was calling | Actual backend endpoint | Status |
|---|---|---|
| `GET /users` (admin list) | `GET /users/all` | ⚠️ Fixed in api.md |
| `POST /users` (create) | `POST /users/invite` | ⚠️ Fixed in api.md |
| No docs on clients/members | `POST/GET/PUT/DELETE /clients/members` | ➕ Added |
| No docs on event sections | `GET/POST/PUT/DELETE /events/:id/sections` | ➕ Added |
| No docs on guests API | `POST/PUT/DELETE /guests` | ➕ Added |
| No docs on resources API | `POST/PUT/DELETE /resources` | ➕ Added |
| No docs on catalogs | `GET /catalogs/client-types`, `/catalogs/roles` | ➕ Added |

---

## How to Use This Agent

Tell Claude:
> "Use the backend agent to validate [endpoint or model]. Backend is at `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend`."

The agent will:
1. Read `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\CLAUDE.md`
2. Read the relevant backend `docs/` file (ROUTES.md, MODELS.md, etc.)
3. Read the specific controller/service/dto file
4. Compare against this frontend's `docs/api.md` and `docs/models.md`
5. Report mismatches and update both docs

### What to validate per file:
- **Route exists?** → `routes/routes.go`
- **Request payload shape?** → `dtos/` + `controllers/<domain>/`
- **Response shape?** → `utils/response.go` + controller return
- **Auth required?** → which route group (public vs protected)
- **Field names match TypeScript?** → `models/<domain>.go` GORM tags + `dtos/`

---

## Validated Contracts

> Fill in as validated. This prevents re-validating the same endpoints.

| Endpoint | Validated | Result |
|---|---|---|
| `GET /api/users` | — | *pending* |
| `GET /api/clients` | — | *pending* |
| `GET /api/events?client_id=` | — | *pending* |
| Response envelope shape | — | *pending* |
