# Event Self-Healing System — Design Document

**Date:** 2026-02-22
**Status:** Approved

## Problem

When navigating to an event detail page, missing records, malformed fields, or inconsistent data can cause UI breakage — broken URLs, NaN values, stuck moments, or blank panels. Currently, the system has no unified mechanism to detect and repair these issues transparently.

## Solution

A two-layer self-healing system:

1. **Backend repair endpoint** (`POST /events/:id/repair`) — validates and fixes event data atomically in a DB transaction
2. **Frontend health-check hook** (`useEventHealthCheck`) — detects problems in received data, triggers backend repair, and shows a subtle toast when done

The repair runs transparently behind the normal loading skeleton. The user sees no interruption.

## Validation Rules

### Tier 1 — Missing Records

| Record | Detection | Repair |
|---|---|---|
| `event_config` | config is null after fetch | Create with Go zero-value defaults |
| `event_analytics` | analytics row missing | Create with zero counters |
| `event_type` FK invalid | `event_type` null + `event_type_id` present | Assign first valid type from catalog |

### Tier 2 — Invalid Field Values

| Field | Validation | Repair |
|---|---|---|
| `identifier` | Empty string | Regenerate from `name` via `Slugify()` |
| `timezone` | Empty or invalid IANA zone | Set `"America/Mexico_City"` |
| `event_date_time` | Zero time (`0001-01-01`) | Set `now + 30 days` |
| `language` | Empty | Set `"es"` |
| `name` | Empty | **Not repairable** — return as warning |

### Tier 3 — Inconsistent Relations

| Issue | Detection | Repair |
|---|---|---|
| `event_type_id` points to nonexistent type | event_type preload is empty | Reassign to first valid catalog type |
| `config.design_template_id` points to deleted template | template preload is empty but ID is set | Clear FK to null |
| Guests with `guest_status_id` = zero UUID | Status preload is empty struct | Assign "PENDING" status from catalog |
| Invitations with `max_guests = 0` | Blocks all RSVPs | Set `max_guests = 1` |

### Tier 4 — Stuck Moments

| Issue | Detection | Repair |
|---|---|---|
| `processing_status = "processing"` for > 30 min | Compare `updated_at` with now | Set to `"failed"` |
| `processing_status = "pending"` for > 1 hour | Compare `created_at` with now | Set to `"failed"` |

### Frontend Defensive Fixes (no backend needed)

| Issue | Fix |
|---|---|
| `checkin/page.tsx` missing array unwrap | Add `Array.isArray` check like main page |
| No Error Boundaries anywhere | Add `EventErrorBoundary` component |
| `event-share-panel` uses `g.status?.code` without fallback | Use `getEffectiveStatus()` helper |
| `event-analytics-panel` divides by zero in capacity bar | Guard against NaN/Infinity |
| Filenames with unsafe characters | Sanitize with regex |
| `event-cover-upload` spreads entire Event in PUT | Send only required fields |

## Architecture

### Backend: `POST /api/events/:id/repair`

```
Auth:     Cognito JWT required
Request:  POST /api/events/:id/repair
Response: {
  "repaired": true,
  "fixes": ["created missing event_config", "set timezone to America/Mexico_City"],
  "warnings": ["event name is empty — cannot auto-repair"]
}
```

Implementation:
- New `RepairEvent` service method in `services/events/`
- Loads event with full preloads (EventType, EventConfig, EventConfig.DesignTemplate)
- Runs all Tier 1-4 validations sequentially
- Applies repairs inside a single DB transaction
- Also checks related guests, invitations, and moments for the event
- Returns structured response with list of applied fixes and warnings

### Frontend: `useEventHealthCheck` Hook

```typescript
function useEventHealthCheck(event: Event | undefined): {
  isRepairing: boolean;
  repairResult: RepairResult | null;
}
```

Behavior:
1. Runs once per event load (useRef flag prevents re-runs)
2. Analyzes received event data for detectable problems
3. If problems found → calls `POST /events/:id/repair`
4. Triggers SWR `mutate()` to refresh event data
5. Shows toast: "Datos del evento optimizados" with fix count
6. Returns `isRepairing` for the page to extend skeleton if needed

### Frontend: `sanitizeEvent()` Utility

Immediate in-memory defaults applied before render, regardless of repair status:
- `timezone` → `"America/Mexico_City"` if falsy
- `language` → `"es"` if falsy
- `identifier` → `event.id` if falsy (temporary fallback)
- `event_date_time` → null-safe handling

### Frontend: `EventErrorBoundary`

React Error Boundary wrapping the event detail page. On crash:
- Shows friendly error UI with retry button
- Logs error details to console
- Prevents white-screen-of-death

## Data Flow

```
User navigates to /events/:id
         │
         ▼
   SWR fetches event data
         │
         ▼
   sanitizeEvent() applies in-memory defaults
         │
         ▼
   Page renders with sanitized data (behind skeleton if repairing)
         │
         ▼
   useEventHealthCheck analyzes data
         │
    Problems found?
    ├── No → done
    └── Yes → POST /events/:id/repair
                  │
                  ▼
            Backend repairs in transaction
                  │
                  ▼
            SWR mutate() → fresh data
                  │
                  ▼
            Toast: "Datos del evento optimizados"
```

## Files to Create/Modify

### Backend (Go)
- `controllers/events/RepairController.go` — new handler
- `services/events/RepairService.go` — new service with validation + repair logic
- `routes/routes.go` — register new route

### Frontend (TypeScript)
- `src/hooks/useEventHealthCheck.ts` — new hook
- `src/lib/sanitize-event.ts` — new sanitizer utility
- `src/components/events/event-error-boundary.tsx` — new Error Boundary
- `src/app/(app)/events/[id]/page.tsx` — integrate hook + boundary + sanitizer
- `src/app/(app)/events/[id]/checkin/page.tsx` — fix array unwrap bug
- `src/components/events/event-share-panel.tsx` — fix status fallback
- `src/components/events/event-analytics-panel.tsx` — fix NaN guard
- `src/components/events/event-cover-upload.tsx` — fix PUT spread
- `src/components/events/invitation-tracker.tsx` — fix filename sanitization
- `src/components/events/moments-wall.tsx` — fix filename extension edge case
