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

`POST /api/auth/token` (Next.js internal) verifies same-origin requests, reads
the HttpOnly session/refresh cookies and returns the in-memory ID token plus the
verified application session. It is called by `getAuthToken()` in `api.ts`; the
browser never reads the refresh credential.

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

### Agent operations and history

| Method | Path | Purpose and access |
|---|---|---|
| GET | `/automation/agents` | Platform-admin-only operational snapshot: profiles, recent instances, current runs, capacity, shared queue counts, and 30-day spend. It does not return prompts, credentials, local paths, private object references, or raw provider usage. |
| GET | `/automation/agents/stream` | Authenticated SSE invalidation feed for that platform-wide snapshot. Events contain only `{ revision, generated_at }`; the dashboard reconnects with its bearer token and refetches the protected snapshot/history API. |
| GET | `/automation/agents/:agentKey/history` | Cursor-paginated, allow-listed timeline for one profile: task lifecycle and assignment events, inference/tool ledger rows, plan-step events, and sanitized step activity. |

History accepts `limit` (default 50, maximum 100), opaque `cursor`, RFC3339 `from` and exclusive `to`, plus `client_id`, `project_id`, `work_item_id`, `worker_id`, `machine_id`, `agent_instance_id`, `run_id`, `operation`, `status`, and `provider` filters. Use `automationAgentHistoryPath()` from `src/lib/api-paths.ts`; do not concatenate profile keys or cursor tokens into a URL yourself. The cursor is bound to the selected agent, workspace, actor, and filters. Identity filters correlate events but do not grant access: platform workspace requires a platform administrator; organization workspace is intersected with the selected organization, and non-platform callers also need access to the exact project.

Timeline projections may contain fixed summaries, safe provider/model labels, token/cost totals, event/status transitions, and current/previous agent-instance correlation IDs. They must not expose prompts, raw model output or errors, object references, command arguments/output, file paths, credentials, or hidden reasoning. The agent directory stream is a global operations feed, not a substitute for tenant-scoped project or work-item APIs.

---

## New Endpoints Used (added)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/resources/section/:sectionId` | List resources for a section in the dashboard admin context. |
| POST | `/resources` | Upload file for section (multipart: file, event_section_id, position, title, alt_text, resource_type_id) |
| DELETE | `/resources/:id` | Delete a resource |
| GET | `/catalogs/resource-types` | Get resource type codes (IMAGE, VIDEO, etc.) |

### Delivery live stream

`GET /automation/work-items/:id/stream` is an authenticated Server-Sent Events
invalidation feed for execution graphs and other delivery views. Use the
reusable `useDeliveryWorkItemStream()` adapter, which transports SSE with
`fetch` so it can attach the same in-memory Bearer token and workspace headers
as Axios. Do not use browser `EventSource`: it cannot attach those headers.

The feed sends a small `snapshot` event after connection and `update` events
only when the authoritative backend revision changes. `onUpdate` should call
the existing SWR `mutate()` for `/automation/work-items/:id`; it should not try
to merge a second work-item representation. The stream pauses while the page is
not active, reconnects with bounded backoff, and intentionally refreshes its
authorization every 55 seconds.

### Standalone GitHub review retry

`POST /automation/tasks/:id/retry-code-review` creates a fresh, auditable
attempt for a terminal failed `code.review`. The Automation Center exposes it
only for a validated standalone review from the portfolio read model, after it
shows the repository, PR, and frozen head SHA and the operator confirms the
retry. The prior task remains immutable evidence; the API is authoritative for
authorization, terminal status, and exact-diff validation. A retry never
selects a newer commit, approves a review, or bypasses a required check.

### Delivery release environment policy

Policy revision patches may include `required_secret_references` and
`required_variable_references`. These are arrays of GitHub Environment reference
names, never secret or variable values. Release proposals send both arrays
explicitly, including `[]`, and the effective-policy projection always returns
both arrays. The dashboard accepts at most 64 unique canonical names per list,
using `^[A-Z_][A-Z0-9_]{0,127}$`, and rejects the reserved `GITHUB_` prefix.

The effective policy remains fail-closed if either field is absent or malformed.
The worker later proves only whether those names exist for the configured
repository, workflow, environment and exact commit SHA; this API never exposes
the provider values or its complete environment inventory.
### Delivery plan-step activity and inference accounting

`GET /automation/plans/:planID/steps/:stepID/activity` returns cursor-paginated,
authorized step activity. A terminal activity item with `action: "inference"`
may include a top-level `inference` projection only when the server verifies
its opaque call/receipt binding to the canonical accounting receipt. The
projection is allow-listed: `receipt_id`, `provider`, `model`, `status`, input,
output, cached-input, cache-write, reasoning and total token counts,
`total_cost_microusd`, `currency`, and `pricing_basis`. The browser may display
these accounting labels and counts; it must never display the receipt ID,
prompts, model completion, provider response bodies, or private reasoning.

When `inference` is absent, display accounting as “No disponible”; do not infer
zero usage or cost. `pricing_basis: "unpriced"` also means cost is unavailable,
even if the ledger's numeric amount is zero. Only a supported priced basis and
USD currency permit rendering the recorded micro-USD total. No `call_id` is
returned to the browser.

### Delivery project configuration

`PATCH /automation/projects/:projectId/context/:sourceId` updates an existing
project context source without replacing its reference or changing any task's
frozen snapshot. The dashboard uses it for repository architecture, environment
branch/deployment/URL/promotion metadata, and project-specific runbook rules
(technologies, Issues, branches, PR review, and release promotion). The backend
merges only allowlisted fields, validates them, preserves untouched settings,
and advances the runbook revision for future tasks.

### Delivery project and portfolio costs

`GET /automation/projects/:projectId/costs` is project-authorized and combines
the agent and AI-tool execution ledgers. `summary`, `by_step`, and `by_work_item`
include `unpriced_executions`; monetary fields are verified USD subtotals only
and exclude rows with an unsupported currency or missing/legacy/unpriced basis.
Work-item rows are cursor-paginated within the selected project.

`GET /automation/portfolio` aggregates those same ledgers for projects visible
to the caller. Its `totals` and each project expose lifetime
`unpriced_executions` and `unpriced_executions_last_30_days`; `total_cost_microusd`
and `cost_last_30_days_microusd` remain verified USD subtotals. A nonzero
unpriced count means the subtotal is incomplete. During a rolling deployment,
if an older response lacks the count, treat coverage as unknown even when the
reported subtotal is zero; never present that as a confirmed zero total.

### Automation cost explorer

`GET /automation/costs` accepts `days` (1–365), `project_id`, active-membership
`epic_id`, `work_item_id`, `step_key`, `agent_key`, `agent_instance_id`,
`provider`, `model`, `page` (1–10,000), `page_size` (1–100), and an optional
opaque `cursor`. These filters apply server-side to the summary, breakdowns,
and recent execution ledger. Epic membership is matched with an existence
check, so it cannot multiply cost totals. Cursor scope includes every selected
filter and the authenticated workspace and actor. The recent rows include
project, work-item, and agent attribution when the ledger has it; agent
attribution is the value recorded with each execution, not the task's current
mutable value.

The first request can use offset pagination. Use its `recent_execution_page.next_cursor`
for subsequent ledger pages; the response reports `mode`, `has_more`, and the
next opaque cursor. Retain earlier cursor values client-side to navigate back.
`budget_watch` and `task_budget_watch` are current portfolio guardrails and do
not change with the date or dimension filters.

### Recurrence schedule history

The dashboard loads history on demand from the project- and schedule-scoped
endpoints `GET /automation/projects/:projectId/schedules/:scheduleId/occurrences`
and `GET /automation/projects/:projectId/schedules/:scheduleId/events`. Both
endpoints require the normal authenticated project-view authorization; the
server binds each response to the requested project and schedule. Pages use
`limit` (1–100) and `offset` (0–10,000), with `next_offset` supplied by the
server. The dashboard follows that offset and stops when the next page would
exceed the supported window.

Occurrence rows include schedule revision, scheduled/local time and timezone,
status, optional `failure_code`, timestamps, and an optional work-item ID.
Event rows include an allow-listed event type, timestamp, and optional related
work-item ID. Although the event transport may contain `actor_subject`, the
dashboard parser deliberately drops it and never displays the raw identity
claim. A materialized occurrence means only that a work item was created in
Planeación; it does not mean an agent executed or completed the work, and it
does not bypass human review or workflow gates.

### Project provider account usage

`GET /automation/ai/projects/:projectId/provider-usage` returns the latest
sanitized provider balance/quota capture for that project, or an empty
`accounts` array before the first capture. `POST /automation/ai/projects/:projectId/provider-usage/refresh`
requests a new capture and requires project-management permission. The backend resolves only that
project's credentials; the response contains provider-reported units, never
keys or raw provider bodies. DeepSeek and MiniMax are supported. OpenRouter
credit queries remain unavailable until a separate management credential is
implemented; its inference key is not reused. Refresh is the only UI action
that contacts providers, so it is not triggered just by opening Settings.

## EventSection - SDUI fields
When creating/updating sections, always send:
- `component_type`: SDUI type string (CountdownHeader, GraduationHero, EventVenue, etc.)
- `type`: same as component_type (backward compat)  
- `config`: Record<string, unknown> — JSON config for that section type
