# Moments Wall Redesign — Design Doc

**Date:** 2026-02-24

## Problem

1. **Images broken**: `content_url` stored in DB is a raw S3 key (`moments/{id}/raw/photo.jpg`), not a URL. `ListForDashboard` returns it as-is. Dashboard's `<Image src={key}>` fails — bucket is private.
2. **`thumbnail_url` missing from frontend model**: Backend `Moment` Go model has `thumbnail_url` (WebP from Lambda for videos) but `Moment.ts` doesn't include it.
3. **Poor UX**: Current card has a footer that wastes vertical space, actions are small, not mobile-first.

## Root Causes

- `controllers/moments/moments.go` `ListMoments` calls `momentSvc.ListForDashboard` which returns raw DB models with S3 keys in `ContentURL`/`ThumbnailURL` — no presigning, unlike `cover_controller.go` and `resources.go` which do presign.
- `src/models/Moment.ts` lacks `thumbnail_url` field.

## Design

### Backend: Presign URLs in ListMoments controller

After `ListForDashboard(eventID)` returns the list, iterate and replace `ContentURL` and `ThumbnailURL` with 720-minute presigned URLs using the existing `bucketrepository.GetPresignedFileURL`. No model or DB changes. Pattern matches `cover_controller.go:69`.

### Frontend: Moment.ts

Add `thumbnail_url?: string` to the interface.

### Frontend: MomentCard redesign (Option A — overlay actions)

- Full-bleed image fills entire card (no footer)
- `aspect-square`, `object-cover`
- Status badge top-left (always visible)
- Action bar: `absolute bottom-0` with backdrop-blur — always visible on mobile, `opacity-0 group-hover:opacity-100` on desktop
- Approve button: left half, green tint
- Delete button: right portion, red tint
- Videos: show `thumbnail_url` as poster if available, else dark fallback with play icon
- Processing/failed states: unchanged logic, restyled to fit full-bleed

### Frontend: Grid

`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-2` — tighter gap for immersive feel

### Frontend: Wall header controls

Two rows:
- Row 1: filter tabs (scrollable on mobile) + auto-refresh indicator
- Row 2: action buttons (ZIP, approve-all, QR, wall share, publish toggle)

Both rows wrap naturally on mobile.

## Files Changed

| File | Change |
|------|--------|
| `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/moments.go` | Presign content_url + thumbnail_url after ListForDashboard |
| `src/models/Moment.ts` | Add `thumbnail_url?: string` |
| `src/components/events/moments-wall.tsx` | Full redesign of MomentCard + grid + header |
