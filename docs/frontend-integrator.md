# Frontend Integrator Agent

Connects and validates both frontend projects that share the same backend.

---

## Project Registry

> **Auto-update this section** when a path or GitHub URL changes.
> The agent must check both repos at the start of any cross-project task and update this file if either has changed.

| Project | Role | Local Path | GitHub |
|---|---|---|---|
| **dashboard-ts** (this repo) | Admin dashboard (authenticated) | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | *(check with `git remote -v`)* |
| **cafetton-casero** | Public event pages (unauthenticated) | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | `https://github.com/Itbem-Corp/itbem-events-frontend.git` |
| **Backend** | Go API (shared by both frontends) | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | `git@github.com:Itbem-Corp/itbem-events-backend.git` |

### Path/Repo Verification Protocol

At the start of any cross-project session, run:
```bash
git -C "C:\Users\AndBe\Desktop\Projects\dashboard-ts" remote -v
git -C "C:\Users\AndBe\Desktop\Projects\cafetton-casero" remote -v
git -C "\\wsl.localhost\Ubuntu\var\www\itbem-events-backend" remote -v
```

If any URL differs from the table above → update this file immediately before proceeding.
If a local path no longer exists → ask the user for the new path → update this file.

---

## Project Scopes (never mix)

| Scope | dashboard-ts | cafetton-casero |
|---|---|---|
| Users | Authenticated admins / root users | Anonymous guests (token-based) |
| Purpose | Manage events, clients, users, analytics | View event details, submit RSVP |
| Auth | Cognito JWT (session cookie) | No auth — public routes only |
| Framework | Next.js 15 (App Router) | Astro 5 (SSR + React islands) |
| Backend routes used | Protected (`/api/users`, `/api/clients`, `/api/events`…) | Public (`/api/invitations/*`, `/api/resources/section/*`) |
| Styling | Tailwind v4, dark theme only (`zinc-950`) | Tailwind v3.4, light theme, custom fonts |
| Animations | Motion (Framer successor) | Framer Motion 12.7 |
| State management | Zustand (persisted) | React `useState` per component |

---

## Shared Backend Contracts

Both frontends talk to the same backend. The following backend responses are consumed by **both**:

| Endpoint | Used by dashboard | Used by cafetton |
|---|---|---|
| `GET /api/resources/section/:id` | Not yet (future) | ✅ ResourcesBySectionSingle.tsx |
| `GET /api/events/:id` (public key) | ❌ (uses protected events) | ✅ (future event pages) |
| `GET /api/invitations/ByToken/:token` | ❌ | ✅ InvitationDataLoader.tsx |
| `POST /api/invitations/rsvp` | ❌ | ✅ RSVP form |
| Protected event routes | ✅ | ❌ |

### Resource Response Shape (shared)
```typescript
// Used by cafetton-casero — validate against backend if dashboard adds resource fetching
interface Resource {
  view_url: string   // Presigned S3 URL
  title: string
  position: number   // sorted ASC
}

// GET /api/resources/section/:id response
{ data: Resource[] }   // ⚠️ envelope `{ data: [...] }` — cafetton unwraps r.data.data
```

### Invitation Response Shape (cafetton only today)
```typescript
// GET /api/invitations/byToken/:token
{
  data: {
    pretty_token: string
    invitation: { ID: uuid, EventID: uuid, max_guests: number, Event: { EventDateTime: ISO } }
    guest: { first_name: string, last_name: string, rsvp_status: "confirmed"|"declined"|"" }
  }
}
```

### RSVP Payload (cafetton only today)
```typescript
// POST /api/invitations/rsvp
{ pretty_token: string, status: "confirmed"|"declined", method: "web", guest_count: number }
```

> ⚠️ **Response envelope mismatch:** cafetton uses `r.data.data` to unwrap responses (`{ data: T }`).
> dashboard-ts `fetcher.ts` does `r.data` — may need `r.data.data` if backend always wraps.
> Validate and document in `docs/backend-agent.md` → Validated Contracts.

---

## cafetton-casero Quick Reference

### Stack
- Astro 5.7 + React 19 + TypeScript (strict)
- Tailwind CSS **v3.4** + `tailwind.config.cjs` (custom `gold: #C7A44C`, `coffee: #8B5D3D`)
- Framer Motion 12.7 (not Motion — different package from dashboard)
- `cn()` at `src/lib/utils.ts` (same pattern)
- No global state manager — React `useState` per island

### Architecture Pattern (island)
```
Astro page (SSR, static shell)
  └── React island (client:only or client:visible)
        ├── ResourcesBySectionSingle  → GET backend → sessionStorage cache
        ├── InvitationDataLoader      → GET backend by token
        └── SectionNWrapper (AnimatePresence skeleton → data)
              └── SelectionNImages (pure display)
```

### Active Pages (2 today)
| Route | File | Type |
|---|---|---|
| `/graduacion-izapa` | `src/pages/graduacion-izapa.astro` | Graduation (5 sections, music, countdown) |
| `/AndresIvanna/Confirmacion?token=` | `src/pages/AndresIvanna/Confirmacion.astro` | Wedding RSVP |

### Key Env Vars
```
PUBLIC_EVENTS_URL=https://api.eventiapp.com.mx/   # trailing slash required
PORT=4321
```

### Template Pattern (3 files per section)
```
src/components/templates/{type}/template_N/section_N/
  SectionNWrapper.tsx    ← state + ResourcesBySectionSingle + AnimatePresence
  SelectionNImages.tsx   ← pure display, receives Section prop
  SkeletonSectionN.tsx   ← animate-pulse placeholder
```

### Section UUIDs (hardcoded — must match backend)
| Event | Section | UUID |
|---|---|---|
| Andres & Ivanna (wedding) | RSVP | `8c1600fd-f6d3-494c-9542-2dc4a0897954` |
| Izapa Graduation | Hero | `76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5` |
| Izapa Graduation | Misa map | `78acb1bb-bbc8-44de-afc9-a79eb22de2db` |
| Izapa Graduation | Reception map | `dc87ac12-7ca1-4aca-9e07-02b687c4ecb1` |
| Izapa Graduation | Graduates list | `af03cf82-72d3-4d8c-8838-4cfcc6bf287b` |
| Izapa Graduation | Gallery | `61202ab3-adaf-405f-8ff4-7bc75d1afc52` |

### Known Tech Debt
- Section UUIDs hardcoded in component files (should come from API/config)
- Graduates list hardcoded (14 names in Section4Wrapper — should be API-driven)
- `Authorization: "1"` sent to public endpoints (backend ignores it)
- `byToken` vs `ByToken` case — frontend lowercase, validate against backend

---

## When to Use This Agent

### Cross-project tasks
- **New event type** (e.g., quinceañera): backend adds model → cafetton adds template → dashboard adds event type option
- **New API endpoint** used by both: validate contract once, document in both `docs/api.md` files
- **Shared model change**: backend updates Guest or Invitation model → update TypeScript interfaces in both frontends
- **Design consistency**: UX patterns that should feel consistent between admin and guest views

### Validation tasks
- "Does the RSVP endpoint the guest page calls match what the backend actually exposes?"
- "If I change the Event model in dashboard, what breaks in cafetton?"
- "The resource response shape — does cafetton unwrap it correctly?"

### Path/repo drift detection
- Run at session start to detect if paths moved or repos changed
- Updates this file automatically if drift detected

---

## Cross-Project Validation Protocol

When asked to validate a shared concern:

```
1. Run git remote -v on both repos — update Project Registry if changed
2. Read cafetton-casero/CLAUDE.md and cafetton-casero/docs/ (relevant file)
3. Read dashboard-ts/docs/ (relevant file)
4. Read backend docs if needed (\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\docs\)
5. Compare contracts
6. Report mismatches
7. Update docs in BOTH projects
```

### Doc update parity rule

If a shared backend contract changes, update docs in **all three projects**:
- `dashboard-ts/docs/api.md` or `backend-agent.md`
- `cafetton-casero/docs/api.md`
- `itbem-events-backend/docs/ROUTES.md` (if backend route changed)
