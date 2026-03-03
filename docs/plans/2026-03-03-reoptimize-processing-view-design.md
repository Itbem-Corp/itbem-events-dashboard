# Design: Re-optimization Processing View

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Backend (Go) · Dashboard (Next.js)

---

## Problem

When the admin clicks "Reoptimizar (N)", the selected moments have their `processing_status` reset to `pending`. Because `ListForDashboard` filters out `pending` and `processing` moments, they immediately disappear from the wall with no feedback about where they went. The user has no visibility into in-flight re-optimization.

---

## Goals

1. Show re-optimizing moments in an intermediate section within the Moments Wall while Lambda processes them.
2. Remove them from the main grid while they are in-flight.
3. Automatically notify the admin (toast) when Lambda finishes and moments return to `done`.
4. No new infrastructure — reuses existing SWR polling pattern.

---

## Non-Goals

- Showing fresh uploads (raw files) in the processing section — these have no displayable image yet.
- Per-card cancel/abort functionality.
- Progress percentage per file.

---

## Architecture

```
Backend
  GET /moments/reoptimizing?event_id=X
    → moments WHERE processing_status IN ('pending','processing')
                AND content_url NOT LIKE '%/raw/%'
    → same Moment shape, no pagination

Dashboard
  useSWR('/moments/reoptimizing?event_id=X', { refreshInterval: 5000 })
    → reoptimizingMoments: Moment[]

  useEffect: prevCount ref
    when reoptimizingMoments.length < prevCount
      → toast.success(`${delta} archivos reoptimizados`)

  UI:
    <ReoptimizingSection moments={reoptimizingMoments} />   ← above main grid
    <main grid> — unchanged, only shows done/approved/failed
```

---

## Key Design Decision: 5s Poll Interval

The existing SWR hook polls at 15s (fine for general dashboard refresh). The re-optimization section uses a separate 5s interval so the admin sees the transition to `done` within seconds of Lambda finishing, without making the main grid flicker at that rate.

---

## Backend Endpoint Contract

```
GET /api/moments/reoptimizing?event_id=<uuid>
Authorization: Bearer <token>

Response 200:
{
  "data": [ ...Moment[] ]   // only pending/processing, content_url not raw
}

Response 400: missing event_id
Response 404: event not found (optional, can return empty array)
```

---

## content_url Guard

Fresh uploads start as `pending` with `content_url` pointing to a `/raw/` S3 key (not publicly displayable). Re-optimization candidates always have an `/opt/` URL (already processed once). The guard `content_url NOT LIKE '%/raw/%'` ensures only displayable moments appear in the processing section.

---

## UI Spec

### Processing section (above main grid)
```
┌─────────────────────────────────────────────────────┐
│  ↻ Procesando (3)                         [ocultar] │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  imagen  │  │  imagen  │  │  imagen  │           │
│  │ existente│  │ existente│  │ existente│           │
│  │░░ overlay│  │░░ overlay│  │░░ overlay│           │
│  │  ↻ spin  │  │  ↻ spin  │  │  ↻ spin  │           │
│  └──────────┘  └──────────┘  └──────────┘           │
└─────────────────────────────────────────────────────┘
```

- Header: indigo/amber spinner + "Procesando (N)" label + collapse toggle
- Cards: non-interactive (no approve/delete buttons), show existing `content_url` image/thumbnail
- Overlay: semi-transparent dark gradient + centered `ArrowPathIcon animate-spin`
- Section fades out (`AnimatePresence`) when empty
- Collapse state: local `useState`, starts expanded

### Completion toast
- Fires when `reoptimizingMoments.length` drops (detected via `useRef` prev count)
- Message: `"N archivo(s) reoptimizado(s)"` (success, green)
- Main SWR (15s) brings the finished moments back to the main grid automatically

---

## Files Changed

### Backend (`itbem-events-backend`)
| File | Change |
|------|--------|
| `repositories/momentrepository/MomentRepository.go` | Add `ListReoptimizing(eventID uuid.UUID)` |
| `services/ports/ports.go` | Add `ListReoptimizing` to `MomentRepository` interface |
| `services/moments/MomentService.go` | Add `GetReoptimizing(eventID)` + package-level wrapper |
| `controllers/moments/moments.go` | Add `GetReoptimizingMoments` handler |
| `routes/routes.go` | Register `GET /moments/reoptimizing` |

### Dashboard (`dashboard-ts`)
| File | Change |
|------|--------|
| `src/components/events/moments-wall.tsx` | Second SWR hook, `ReoptimizingSection` component, toast detection |
| `docs/api.md` | Document new endpoint |

---

## Polling Summary

| Hook | Interval | Purpose |
|------|----------|---------|
| `/moments?event_id=X` | 15s | Main grid refresh |
| `/moments/reoptimizing?event_id=X` | 5s | In-flight detection + completion toast |
