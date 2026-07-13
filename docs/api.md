# API Layer

## Axios Instance (`src/lib/api.ts`)

- `baseURL`: `${NEXT_PUBLIC_BACKEND_URL}/api` -> all paths below are relative to this
- **Request interceptor**: injects `Authorization: Bearer <token>`
- **Response interceptor**: unwraps backend envelopes (`{ status, message, data }`), normalizes Go/Pascal keys to dashboard `snake_case`, skips binary/blob responses, and handles HTTP 401 with `store.clearSession()` + redirect `/logout`
- Use `src/lib/api-paths.ts` for backend paths instead of hardcoded strings.

## SWR Fetcher

```typescript
// src/lib/fetcher.ts
export const fetcher = (url: string) => api.get(url).then(r => r.data)
```

Backend wraps responses in `{ status, message, data }`. The Axios response interceptor unwraps that envelope before the fetcher runs, so SWR consumers receive the data array/object directly.

## Fetching Pattern

```tsx
const { currentClient } = useStore()
const { data = [], isLoading, error, mutate } = useSWR<Model[]>(
  currentClient ? endpointPath(currentClient.id) : null,
  fetcher
)
if (error) return <div className="text-red-400 p-4">Error al cargar datos</div>
```

Always destructure `error` from `useSWR` and render an error state.

## Mutation Pattern

```tsx
import { api } from '@/lib/api'
import { resourcePath, resourcesPath } from '@/lib/api-paths'

await api.post(resourcesPath(), payload)       // JSON body
await api.post(resourcesPath(), formData)      // multipart (files)
await api.put(resourcePath(id), data)
await api.delete(resourcePath(id))
mutate()  // always revalidate SWR after write
```

## Toasts

```tsx
import { toast } from 'sonner'
toast.success('Saved')
toast.error('Failed')
```

## Internal Token Endpoint

`GET /api/auth/token` (Next.js internal) — reads `session` cookie → `{ token: string }`. Only called by `getAuthToken()` in `api.ts`.

---

## Endpoint Reference

> Source of truth: `docs/backend-agent.md` (full route list with controller mapping).
> This section documents only what the **dashboard currently uses**.

### Current User

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | Own profile (bootstrap) |
| PUT | `/users` | Update first_name, last_name |
| POST | `/users/avatar` | Upload avatar — FormData |
| DELETE | `/users/avatar` | Remove avatar |

### User Management (root only)

| Method | Path | Notes |
|---|---|---|
| GET | `/users/all` | List all users ← **not `/users`** |
| POST | `/users/invite` | Invite/create user via Cognito ← **not `/users`** |
| DELETE | `/users/:id` | Delete user |
| PUT | `/users/:id/activate` | Activate account |
| PUT | `/users/:id/deactivate` | Deactivate account |
| GET | `/users/:id/clients` | User's client list |

### Clients

| Method | Path | Notes |
|---|---|---|
| GET | `/clients` | My clients (scoped to auth user) |
| GET | `/clients/children` | Sub-clients |
| GET | `/clients/:id` | Single client |
| POST | `/clients` | Create — FormData (name, client_type_id, logo?) |
| PUT | `/clients/:id` | Update — FormData |
| DELETE | `/clients/:id` | Delete |
| GET | `/clients/members?client_id=:id` | List client members — SWR key includes query param |
| POST | `/clients/invite` | Invite a user to a client by email + role |
| PUT | `/clients/members/:userId?client_id=:id` | Update member role — `client_id` as query param |
| DELETE | `/clients/members/:userId?client_id=:id` | Remove member — `client_id` as query param |

### Events

| Method | Path | Notes |
|---|---|---|
| GET | `/events/all` | All events (public, Redis-cached) — SWR key `/events/all` |
| GET | `/events?client_id=` | Events for client (query param) |
| GET | `/events/:id/detail` | Event detail |
| POST | `/events` | Create event |
| PUT | `/events/:id` | Update event |
| DELETE | `/events/:id` | Delete event |
| POST | `/events/:id/repair` | Self-healing: detect and fix malformed event data atomically |
| POST | `/events/:id/preview-token` | Generate signed admin preview token, currently valid for 30 minutes. Response envelope data: `{ token, expires_at }` |
| GET | `/events/:id/analytics` | Event analytics — views, RSVPs, moment counts |
| GET | `/events/:id/config` | Event configuration |
| PUT | `/events/:id/config` | Update configuration. If `active_until` is sent, it must be strictly after `active_from`; open-ended ranges are valid. |
| GET | `/events/:id/sections` | Event sections |
| POST | `/events/:id/sections` | Create section |
| PUT | `/sections/:id` | Update section |
| DELETE | `/sections/:id` | Delete section |
| GET | `/events/:id/invitations` | List all invitations for an event (protected) |

### Guests

| Method | Path | Notes |
|---|---|---|
| GET | `/guests/all:<eventID>` | List guests for an event by UUID — used by the dashboard to load the invitados/RSVP tabs |
| POST | `/guests` | Create single guest |
| POST | `/guests/batch` | Bulk-create guests (atomic) — also creates RSVP invitations and access tokens; rate-limited ~10 req/min |
| PUT | `/guests/:id` | Update guest |
| DELETE | `/guests/:id` | Delete guest |

> SWR key for the guest list: `/guests/all:${event.id}` via `eventGuestsPath(event.id)`.
> Guest responses include all fields including rich profile (`bio`, `headline`, `signature`, image URLs) and RSVP tracking (`rsvp_status`, `rsvp_at`, `rsvp_method`, `rsvp_guest_count`).

### Section Attendees

Public route documented here only because it shares section data with Cafetton. Dashboard does not call it.

| Method | Path | Notes |
|---|---|---|
| GET | `/events/section/:sectionId/attendees` | Public attendee list for a specific section (e.g. GraduatesList). Password-protected events require `X-Event-Access-Token` unless `preview_token` is valid. |

### Invitations (protected)

| Method | Path | Notes |
|---|---|---|
| POST | `/invitations/:id/resend` | Log a manual resend of an invitation (creates `InvitationLog` entry, sets `InvitationSent = true`) |

### Moments (dashboard — protected)

| Method | Path | Notes |
|---|---|---|
| GET | `/moments?event_id=:id` | List all moments for an event |
| PUT | `/moments/:id` | Update moment — used to approve (`is_approved: true`) |
| DELETE | `/moments/:id` | Delete moment |
| POST | `/moments/batch/reoptimize` | Re-queue oversized optimized moments for a second Lambda pass. Body: `{ ids: string[] }` (max 200). Response: `{ succeeded, skipped, failed }` |

### GET /moments/reoptimizing

Returns moments currently queued for re-optimization (`processing_status` is `pending` or `processing`) whose `content_url` is already an optimized path (not `/raw/`). Used by the dashboard to show an in-flight processing section while Lambda works.

**Query params:** `event_id` (UUID, required)

**Response 200:**
```json
{ "data": [ ...Moment[] ] }
```

**Response 400:** `event_id` missing or invalid UUID

**Notes:** Only returns moments whose `content_url` does not contain `/raw/` — i.e., already-processed files being re-optimized, not fresh uploads. Dashboard polls this endpoint every 5 seconds and fires a completion toast when the count drops.

### `GET /moments/in-flight?event_id=<uuid>`
Returns moments with `processing_status IN ('pending','processing')` and a raw S3 key — brand-new uploads being processed by Lambda for the first time. Used by `InFlightSection` in `moments-wall.tsx` (polls every 5s and fires a completion toast when the count drops — "listo para aprobar").
Response: `Moment[]` (unwrapped by fetcher).

### Moments (public — no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/events/:identifier/moments` | List approved moments for an event — used by cafetton MomentWall |
| POST | `/events/:identifier/moments` | Submit guest photo — multipart: `file`, `pretty_token` (required), `description` (optional); rate-limited ~10/min; `IsApproved: false` until moderated |

### Resources (files/media)

| Method | Path | Notes |
|---|---|---|
| POST | `/resources` | Upload — multipart |
| POST | `/resources/multiple` | Upload multiple — multipart |
| PUT | `/resources/:id/content` | Update content |
| PUT | `/resources/:id/replace` | Replace file |
| DELETE | `/resources/:id` | Delete |

### Catalogs

| Method | Path |
|---|---|
| GET | `/catalogs/client-types` |
| GET | `/catalogs/roles` |

---

> **Not used by this dashboard** (public event guest-facing routes):
> `GET /events/:key` · `GET /resources/section/:sectionId` · `GET /events/section/:sectionId/attendees` · `GET /invitations/ByToken?token=...` · `POST /invitations/rsvp`
>
> Note: dashboard guest lists use protected `GET /guests/all:<eventID>` through `eventGuestsPath(event.id)`.

---

## New Endpoints Used (added)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/resources/section/:sectionId` | List resources for a section in the dashboard admin context. |
| POST | `/resources` | Upload file for section (multipart: file, event_section_id, position, title, alt_text, resource_type_id) |
| DELETE | `/resources/:id` | Delete a resource |
| GET | `/catalogs/resource-types` | Get resource type codes (IMAGE, VIDEO, etc.) |

## EventSection - SDUI fields
When creating/updating sections, always send:
- `component_type`: SDUI type string (CountdownHeader, GraduationHero, EventVenue, etc.)
- `type`: same as component_type (backward compat)  
- `config`: Record<string, unknown> — JSON config for that section type
