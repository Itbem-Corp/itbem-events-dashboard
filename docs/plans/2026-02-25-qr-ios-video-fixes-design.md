# Design Doc — QR Quality, iOS Upload UX, Video Fixes

**Date:** 2026-02-25
**Status:** Approved
**Projects affected:** dashboard-ts, cafetton-casero (public frontend)

---

## Problems Addressed

1. **QR download quality** — PNG too low-res for sticker printing (800px, no DPI metadata, level=M)
2. **iOS upload delay** — 30–40s freeze after selecting files from gallery, no feedback to user
3. **Video upload speed & concurrency** — batch-based 3-concurrent is too conservative; photos can go faster
4. **Video thumbnails missing** — dashboard grid tries to load video URL as `<img>`, fails silently
5. **Videos not playing in Astro public frontend** — missing `playsInline` on `<video>` (iOS Safari requirement)
6. **No creative video section** — videos lost in masonry grid with no thumbnails; need a dedicated highlight section

---

## Solution 1: QR Download — High-Resolution Sticker Quality

**File:** `src/components/ui/branded-qr.tsx`

- Change default `downloadSize` from `800` → `2400` px (QR module at 2400px = ~10×10cm at 600 DPI — optimal for 5×5cm sticker printed at laser quality)
- Change `level="M"` → `level="H"` on the hidden canvas QR (30% error correction — handles wear/tear on stickers)
- Embed proper DPI metadata in the PNG output:
  - After `canvas.toDataURL('image/png')`, decode the base64, inject a `pHYs` chunk with 11811 pixels/meter (300 DPI) into the PNG binary, re-encode to data URL
  - This makes the file print at correct physical size when opened in any print dialog
- The visible on-screen QR (`QRCodeSVG`, `size={180}`, `level="M"`) is unchanged

**No backend changes required.**

---

## Solution 2: iOS Upload UX — "Preparing files..." Overlay

**File:** `src/components/SharedUploadPage.tsx` (cafetton-casero)

iOS exports/converts HEIC→JPEG and MOV→MP4 before the JavaScript `File` object is available. This happens between the user closing the native picker and `onChange` firing — no JS API can intercept it. The fix is a UX overlay that makes the wait visible.

**Implementation:**
1. Attach a `focus` listener to `window` before opening the file input
2. When `window` regains focus after input blur → set `isPreparingFiles = true` → show overlay immediately
3. The overlay: fixed bottom banner, non-blocking, shows "Preparando archivos de tu galería..." with spinner
4. When `onChange` fires → set `isPreparingFiles = false` → overlay disappears, files are added normally

**`extractVideoThumbnail` timeout:** reduce from 5000ms → 2000ms to avoid hanging on iOS blob URLs.

**No backend changes required.**

---

## Solution 3: Upload Worker Pool (8 concurrent, queue-draining)

**File:** `src/components/SharedUploadPage.tsx` (cafetton-casero)

Replace the current batch-based concurrency loop (CONCURRENCY=3, waits for batch to complete) with a **worker pool pattern**:

```ts
const POOL_SIZE = 8

async function runPool(tasks: Array<() => Promise<void>>): Promise<void> {
  const queue = [...tasks]
  const workers = Array.from(
    { length: Math.min(POOL_SIZE, queue.length) },
    async () => {
      while (queue.length > 0) {
        const task = queue.shift()!
        await task()
      }
    }
  )
  await Promise.all(workers)
}
```

- Each worker drains the shared queue independently — when a slot frees, it immediately picks the next pending file without waiting for other workers
- Up to 8 uploads in flight simultaneously
- Works for any mix of photos and videos; photos naturally complete first and free slots for the remaining videos

**Progress UI:** each file card shows its own live progress bar (already implemented via `setFiles` update). No additional UI changes needed for the pool.

**No backend changes required.**

---

## Solution 4: Video Thumbnails in Dashboard

**File:** `src/components/events/moments-wall.tsx`

Currently the grid renders every moment as `<img src={content_url}>` which fails silently for videos.

**Fix:**
- In the moment card grid, detect video via `isVideo(m.content_url)`
- If video + `m.thumbnail_url` exists → render `<img src={thumbnail_url}>` + play icon overlay
- If video + no `thumbnail_url` → render a styled dark placeholder (zinc-800 bg, film icon, play circle overlay) instead of broken `<img>`
- The lightbox already uses `<video>` correctly — no change needed there

**Backend investigation (parallel, not blocking):** Verify that `GET /moments?event_id=X` returns `thumbnail_url` when Lambda has processed the video. If the field is missing from the response, report to backend agent. This is a read-only check — the frontend fix works regardless (placeholder handles the no-thumbnail case gracefully).

---

## Solution 5: Videos Not Playing — `playsInline` Fix

**File:** `src/components/sections/MomentWall.tsx` (cafetton-casero)

iOS Safari **requires** `playsInline` to play video inline (without going fullscreen). Without it, `autoPlay` is silently ignored and the video shows as a static black frame.

**Fix:** Add `playsInline` and `preload="metadata"` to the `<video>` element in the lightbox (~line 370):

```tsx
// Before:
<video src={...} controls autoPlay className="..." />

// After:
<video src={...} controls autoPlay playsInline preload="metadata" className="..." />
```

`preload="metadata"` loads the first frame for thumbnail preview before the user presses play.

**CORS follow-up (if still broken after playsInline):** S3 bucket CORS policy must allow the Astro frontend's origin. This is a backend/infrastructure task if needed.

---

## Solution 6: Video Highlights Section in MomentsGallery

**File:** `src/components/moments/MomentsGallery.tsx` (cafetton-casero)

**Data split:** Before rendering, split moments into two arrays:
- `videoMoments = moments.filter(m => isVideo(m.content_url))`
- `photoMoments = moments.filter(m => !isVideo(m.content_url))`

**`VideoHighlights` component** (new, defined in same file):
- Rendered between `HeroHeader` and the photo masonry grid, only when `videoMoments.length > 0`
- Header: small label "Momentos en video" styled with theme accent color
- Layout: responsive grid — 1 column mobile, 2 columns sm+
- Each card:
  - 16:9 aspect ratio container
  - If `thumbnail_url` exists: `<img>` with `object-cover`
  - If no thumbnail: dark gradient placeholder (zinc-900 → zinc-800) with camera icon
  - Play button: centered white circle with semi-transparent background + shadow
  - Hover: `scale-105` on thumbnail + brighter play button
  - Click: opens `GalleryLightbox` at that video's index in `videoMoments`
- The `GalleryLightbox` already handles video with `playsInline` — no change needed

**Photo masonry:** unchanged, but now only receives `photoMoments` (videos removed from grid).

**Pagination:** `videoMoments` pulls from already-fetched `moments` array — no additional API calls.

---

## Files Changed Summary

| Project | File | Change |
|---------|------|--------|
| dashboard-ts | `src/components/ui/branded-qr.tsx` | downloadSize 2400, level H, DPI metadata |
| cafetton-casero | `src/components/SharedUploadPage.tsx` | iOS overlay, worker pool (8 concurrent), thumbnail timeout 2s |
| dashboard-ts | `src/components/events/moments-wall.tsx` | Video thumbnail/placeholder in grid |
| cafetton-casero | `src/components/sections/MomentWall.tsx` | Add `playsInline` + `preload="metadata"` |
| cafetton-casero | `src/components/moments/MomentsGallery.tsx` | VideoHighlights section + photo/video split |

---

## Out of Scope (follow-up tasks)

- S3 CORS headers for video playback (backend/infra)
- Backend Lambda thumbnail generation verification (backend agent)
- S3 Multipart Upload for very large videos (backend + frontend, future sprint)
