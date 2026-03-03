# Design: Oversize Re-optimization — Dashboard Button + Backend Batch Endpoint

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Backend (Go) · Dashboard (Next.js) · Lambda (itbem-media-processor)

---

## Problem

After Lambda optimization, some photos and videos remain above acceptable size thresholds:

- **Photos** > 100 KB
- **Videos** > 5 MB

The dashboard has no way to detect these files or trigger re-optimization. The existing `PUT /moments/:id/requeue` endpoint rejects already-optimized moments (guards for `/raw/` in `content_url`), so it cannot be reused directly.

---

## Goals

1. Surface oversized moments visually in the MomentsWall (badge per card).
2. Provide a one-click bulk action to send all oversized moments back to Lambda.
3. Handle all edge cases safely without race conditions or duplicate processing.
4. Reuse existing SQS queues (no new infrastructure).

---

## Non-Goals

- Changing Lambda compression quality settings (future work).
- Storing the original raw URL permanently (out of scope — migration required).
- Per-card individual requeue buttons for oversized moments (bulk is sufficient).

---

## Architecture

```
Dashboard
  Moment.ts
    + optimized_size_bytes?: number
    + original_size_bytes?: number
    + content_type?: string

  moments-wall.tsx
    oversizedMoments = moments.filter(m =>
      m.processing_status === 'done' &&
      m.optimized_size_bytes > 0 &&
      (isVideo(m.content_url)
        ? m.optimized_size_bytes > 5_000_000
        : m.optimized_size_bytes > 100_000)
    )

    UI:
    ├─ Amber size badge on each oversized card ("450 KB", "8.2 MB")
    ├─ Toolbar button "Reoptimizar X archivos" (hidden when oversizedMoments.length === 0)
    └─ POST /moments/batch/reoptimize { ids: string[] }
         → spinner + toast: "4 de 6 reencolados"

Backend (Go)
  sqsrepository/SQSRepository.go
    MediaProcessMessage + ForceReoptimize bool

  services/moments/MomentService.go
    BatchReoptimize(ids []uuid.UUID) (succeeded, skipped, failed int, err error)

  controllers/moments/moments.go
    POST /moments/batch/reoptimize handler

  routes/routes.go
    protected.POST("/moments/batch/reoptimize", moments.BatchReoptimizeMoments)

Lambda (itbem-media-processor)
  When force_reoptimize == true:
    output_key = input_key   ← overwrite in place (same S3 key)
  When false (default):
    output_key = raw/ → opt/ substitution (existing behavior)
```

---

## Key Design Decision: ForceReoptimize Flag

The existing Lambda derives the output S3 key by replacing `/raw/` with `/opt/` in the input key. For already-optimized moments, `content_url` is `moments/{event_id}/opt/{file}`. Sending that as `RawS3Key` without a flag would produce `moments/{event_id}/opt/opt/{file}` — a broken path.

**Solution:** Add `ForceReoptimize bool` to `MediaProcessMessage`. When `true`:
- Lambda downloads from the provided key (whatever path it is)
- Processes with its normal algorithm
- Uploads result back to the **same key** (overwrite in place)
- Calls backend callback as normal — `content_url` in DB remains unchanged

> **Deploy order:** Lambda must be updated before the dashboard button is enabled in production. If an old Lambda receives `force_reoptimize: true`, it ignores the field and derives a wrong output path. Risk is low (Lambda update is fast) but must be documented in release notes.

---

## Thresholds

| Type | Threshold | Detection |
|------|-----------|-----------|
| Photo | > 100 KB (102,400 bytes) | `optimized_size_bytes > 100_000` + `!isVideo(content_url)` |
| Video | > 5 MB (5,242,880 bytes) | `optimized_size_bytes > 5_000_000` + `isVideo(content_url)` |

`isVideo()` already exists in `moments-wall.tsx` — no changes needed to detection logic.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Moment already `pending` or `processing` | Backend skips it — idempotency. Counted as `skipped`. |
| `optimized_size_bytes === 0` (legacy, no size recorded) | Dashboard excludes from oversized list. Backend also skips if size is 0. |
| Moment status is `failed` | Not `done` → not detected as oversized. Use existing per-card requeue. |
| Batch > 200 IDs | Backend returns 400 Bad Request. Dashboard pre-filters so this shouldn't happen. |
| Duplicate IDs in request | Backend deduplicates with a map before processing. |
| Two admins click simultaneously | First call resets status to `pending` → second call sees `pending` and skips. |
| SQS publish fails for one moment | Loop continues with remaining IDs. Failed count returned in response. |
| Re-optimization doesn't reduce size | Admin sees badge again after 15s SWR refresh. No infinite loop — button only acts on `done` + over threshold. |
| Old Lambda (no `force_reoptimize` support) | Documents in release notes: deploy Lambda first. |

---

## Backend Endpoint Contract

```
POST /api/moments/batch/reoptimize
Authorization: Bearer <token>

Request:
{
  "ids": ["uuid1", "uuid2", ...]   // max 200
}

Response 200:
{
  "data": {
    "succeeded": 4,
    "skipped": 1,    // already pending/processing, or optimized_size_bytes == 0
    "failed": 1      // SQS publish error
  }
}

Response 400: ids empty or > 200
Response 500: catastrophic failure before any processing
```

---

## SQS Queues

No new queues. Uses existing:
- **Image queue** (BatchSize=5, low memory Lambda) for photos
- **Video queue** (BatchSize=1, high memory Lambda) for videos

Re-optimization volume is small and intermittent — does not warrant dedicated infrastructure. Mixed with new uploads is acceptable; priority inversion is negligible.

---

## Dashboard UI Spec

### Per-card size badge
```
┌─────────────────────────────┐
│  [photo/video thumbnail]    │
│                             │
│ [✓ Aprobada]  [450 KB] ←amber badge
└─────────────────────────────┘
```
- Badge only appears when `optimized_size_bytes > 0` AND exceeds threshold
- Format: KB for < 1 MB, MB for ≥ 1 MB (1 decimal)
- Color: `text-amber-400 bg-amber-500/20` (matches existing warning patterns)

### Toolbar button
```
[↻ Reoptimizar (6 archivos grandes)]
```
- Hidden when `oversizedMoments.length === 0`
- Disabled while `requeuingOversized === true`
- Shows spinner during processing
- Toast on complete: `"4 de 6 archivos reencolados"` (success) or `"Error al reencolar"` (failure)

---

## Files Changed

### Backend (`itbem-events-backend`)
| File | Change |
|------|--------|
| `repositories/sqsrepository/SQSRepository.go` | Add `ForceReoptimize bool` to `MediaProcessMessage` |
| `services/moments/MomentService.go` | Add `BatchReoptimize()` method + package-level wrapper |
| `controllers/moments/moments.go` | Add `BatchReoptimizeMoments` handler |
| `routes/routes.go` | Register `POST /moments/batch/reoptimize` |
| `services/moments/moment_service_test.go` | Tests for `BatchReoptimize` |

### Dashboard (`dashboard-ts`)
| File | Change |
|------|--------|
| `src/models/Moment.ts` | Add `optimized_size_bytes?`, `original_size_bytes?`, `content_type?` |
| `src/components/events/moments-wall.tsx` | Oversized detection, size badge, toolbar button, handler |
| `docs/api.md` | Document new endpoint |
| `docs/models.md` | Document new fields |

### Lambda (`itbem-media-processor`)
| File | Change |
|------|--------|
| Handler entry point | Read `force_reoptimize` field; when true, set output key = input key |

---

## Release Order

1. Deploy Lambda (handles `force_reoptimize`)
2. Deploy Backend (registers new endpoint, publishes with `ForceReoptimize: true`)
3. Deploy Dashboard (shows UI)

Dashboard deploy can happen before steps 1-2 — the button will show but calls a 404 endpoint. Acceptable for staging; coordinate for production.
