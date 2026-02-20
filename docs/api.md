# API Layer

## Axios Instance (`src/lib/api.ts`)

- `baseURL`: `${NEXT_PUBLIC_BACKEND_URL}/api` → all paths below are relative to this
- **Request interceptor**: injects `Authorization: Bearer <token>`
- **Response interceptor**: HTTP 401 → `store.clearSession()` + redirect `/logout`

## SWR Fetcher

```typescript
// src/lib/fetcher.ts
export const fetcher = (url: string) => api.get(url).then(r => r.data?.data ?? r.data)
```

Backend wraps responses in `{ data: T }`. The fetcher unwraps automatically — SWR consumers receive the data array/object directly, no manual `.data` unwrapping needed in pages.

## Fetching Pattern

```tsx
const { currentClient } = useStore()
const { data = [], isLoading, error, mutate } = useSWR<Model[]>(
  currentClient ? `/endpoint?client_id=${currentClient.id}` : null,
  fetcher
)
if (error) return <div className="text-red-400 p-4">Error al cargar datos</div>
```

Always destructure `error` from `useSWR` and render an error state.

## Mutation Pattern

```tsx
import api from '@/lib/api'

await api.post('/resource', payload)           // JSON body
await api.post('/resource', formData)          // multipart (files)
await api.put(`/resource/${id}`, data)
await api.delete(`/resource/${id}`)
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
| GET | `/clients/members` | Client members |
| POST | `/clients/members` | Add member |
| PUT | `/clients/members/:user_id` | Update member role |
| DELETE | `/clients/members/:user_id` | Remove member |

### Events

| Method | Path | Notes |
|---|---|---|
| GET | `/events?client_id=` | Events for client (query param) |
| GET | `/events/:id` | Event detail |
| POST | `/events` | Create event |
| PUT | `/events/:id` | Update event |
| DELETE | `/events/:id` | Delete event |
| GET | `/events/:id/config` | Event configuration |
| PUT | `/events/:id/config` | Update configuration |
| GET | `/events/:id/sections` | Event sections |
| POST | `/events/:id/sections` | Create section |
| PUT | `/sections/:id` | Update section |
| DELETE | `/sections/:id` | Delete section |

### Guests

| Method | Path | Notes |
|---|---|---|
| POST | `/guests` | Create single guest |
| POST | `/guests/batch` | Create multiple (atomic) |
| PUT | `/guests/:id` | Update guest |
| DELETE | `/guests/:id` | Delete guest |

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
> `GET /events/:key` · `GET /guests/:key` · `GET /invitations/ByToken/:token` · `POST /invitations/rsvp`
