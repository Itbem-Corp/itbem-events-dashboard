# Design Doc — Upload Performance Improvements

**Date:** 2026-02-27
**Status:** Approved
**Projects affected:** cafetton-casero (public frontend), itbem-events-backend (Go)

---

## Context — Current State

`SharedUploadPage.tsx` already has:
- Worker pool (8 concurrent via `runPool`)
- S3 Multipart upload for videos >10 MB (`MULTIPART_THRESHOLD`, 4 concurrent parts)
- XHR with upload progress events
- 2-minute XHR timeout
- Abort-all on connection failure
- iOS "Preparando archivos..." overlay

**Gaps identified — this doc covers only what's missing.**

---

## Improvement 1: Client-side Image Compression

**File:** `cafetton-casero/src/components/SharedUploadPage.tsx`

**Problem:** A 12 MP JPEG from a modern phone is 4–8 MB. With 10 photos that's 40–80 MB in transit. Most guests don't need lossless quality for a photo wall.

**Solution:** Before setting `status: "uploading"`, compress images with Canvas API:

```ts
async function compressImage(file: File, maxDimension = 2048, quality = 0.85): Promise<File> {
  // Skip non-compressible: videos, GIFs, HEIC (Canvas can't decode), WebP/AVIF (already compressed)
  if (file.type.startsWith("video/") || file.type === "image/gif"
      || file.type === "image/heic" || file.type === "image/heif"
      || file.type === "image/webp" || file.type === "image/avif") {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // compression didn't help — use original
          } else {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
```

**Integration point:** In `uploadOne`, before Step 1 (presigned URL request):
```ts
const fileToUpload = await compressImage(entry.file);
// use fileToUpload instead of entry.file for size + content
// update contentType to "image/jpeg" when compressed
```

**Expected gains:**
- JPEG 6 MB → ~1.2 MB (80% reduction at 2048px / 85% quality)
- PNG screenshot → ~0.6 MB
- HEIC, GIF, WebP, AVIF, videos: unchanged

**No backend changes required.**

---

## Improvement 2: Retry with Exponential Backoff

**File:** `cafetton-casero/src/components/SharedUploadPage.tsx`

**Problem:** A transient network hiccup (event WiFi congestion, momentary 4G drop) marks files as `error` permanently. The user must manually retry. This is a common failure mode at live events.

**Solution:** A small retry wrapper for non-fatal fetch/XHR failures:

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don't retry: connection-killed aborts, 403 (disabled), 4xx client errors
      if ((err as { silent?: boolean }).silent) throw err;
      if (err instanceof TypeError) throw err; // full connection loss → surface immediately
      const isClientError = err instanceof Error && /\(4\d\d\)/.test(err.message);
      if (isClientError) throw err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}
```

**Apply to:**
1. `fetch(upload-url)` presigned URL request — wrap with `withRetry`
2. `fetch(confirm)` backend confirm — wrap with `withRetry`
3. `fetch(multipart/start)` — wrap with `withRetry`
4. Individual S3 part PUT (XHR) in `uploadMultipart` — wrap each part's XHR with `withRetry`

**Retry schedule:** attempt 1 → immediate, attempt 2 → 1s delay, attempt 3 → 2s delay.

**No backend changes required.**

---

## Improvement 3: Adaptive Pool Size Based on Network Quality

**File:** `cafetton-casero/src/components/SharedUploadPage.tsx`

**Problem:** 8 concurrent uploads on a congested event WiFi or a slow 3G connection saturates the link, making all uploads slower rather than faster.

**Solution:** Scale `runPool` concurrency at upload start:

```ts
function getAdaptivePoolSize(): number {
  // navigator.connection is not available on iOS Safari — fall back to default
  const conn = (navigator as { connection?: { effectiveType?: string } }).connection;
  if (!conn?.effectiveType) return 8; // default: fast connection assumed
  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":  return 2;
    case "3g":  return 4;
    default:    return 8; // 4g / wifi
  }
}
```

**Integration point:** In `handleUpload`, replace `await runPool(uploadTasks)` with:
```ts
await runPool(uploadTasks, getAdaptivePoolSize());
```

`runPool` already accepts a `concurrency` parameter — no change to its signature.

**No backend changes required.**

---

## Improvement 4: Batch Presigned URL Request

**Problem:** With 10 photos each awaiting a `POST /upload-url` before any S3 PUT can start, there's a serial waterfall of 10 round-trips before the first byte goes to S3. Even with a pool of 8, each worker stalls on its own presign call first.

**Solution:** Request all presigned URLs in a single `POST /moments/shared/batch-upload-urls` call before starting the pool. Workers then skip their individual presign step and immediately PUT to S3.

### Backend — new endpoint

**File:** `controllers/moments/moments.go` (new handler `RequestBatchSharedUploadURLs`)
**Route:** `POST /api/events/:identifier/moments/shared/batch-upload-urls`

Request body:
```json
{
  "files": [
    { "content_type": "image/jpeg", "filename": "photo1.jpg" },
    { "content_type": "video/mp4",  "filename": "clip.mp4" }
  ]
}
```

Response:
```json
{
  "urls": [
    { "upload_url": "https://s3.../...", "s3_key": "moments/event-x/raw/..." },
    { "upload_url": "https://s3.../...", "s3_key": "moments/event-x/raw/..." }
  ]
}
```

Implementation: loop over `files`, call existing `s3repo.GeneratePresignedPutURL(contentType, s3Key)` for each. The entire loop runs in ~5–10ms server-side (no DB calls). Return all URLs in one response.

**Rate limit / guard:** same `directUploadGroup` middleware (no auth required, same as single upload-url).

**Files to change (backend):**
- `controllers/moments/moments.go` — add handler `RequestBatchSharedUploadURLs`
- `routes/routes.go` — register `POST /moments/shared/batch-upload-urls`
- `services/moments/MomentService.go` — optional: add `BatchGenerateUploadURLs` service method (thin wrapper)

### Frontend — use batch endpoint

**File:** `cafetton-casero/src/components/SharedUploadPage.tsx`

In `handleUpload`, before building `uploadTasks`:
```ts
// Batch-fetch all presigned URLs for non-multipart files upfront
const singleFiles = pendingEntries.filter(e => !(e.isVideo && e.file.size > MULTIPART_THRESHOLD));
const presignMap = new Map<string, { uploadUrl: string; s3Key: string }>();

if (singleFiles.length > 0) {
  const batchRes = await withRetry(() =>
    fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/batch-upload-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: singleFiles.map(e => ({
          content_type: resolveContentType(e),
          filename: e.file.name,
        }))
      }),
    }).then(r => r.json())
  );
  batchRes.urls.forEach((u: { upload_url: string; s3_key: string }, i: number) => {
    presignMap.set(singleFiles[i].id, { uploadUrl: u.upload_url, s3Key: u.s3_key });
  });
}
```

Then in `uploadOne`, skip Step 1 if `presignMap.has(entry.id)` and use cached URLs directly.

**Expected gains:** 10 files → 1 network round-trip instead of 10 before S3 PUT starts.

---

## Files Changed Summary

| Project | File | Change |
|---------|------|--------|
| cafetton-casero | `src/components/SharedUploadPage.tsx` | `compressImage()`, `withRetry()`, `getAdaptivePoolSize()`, batch presign integration |
| itbem-events-backend | `controllers/moments/moments.go` | `RequestBatchSharedUploadURLs` handler |
| itbem-events-backend | `routes/routes.go` | Register batch URL route |

---

## Definition of Done

- [ ] Images ≥2049px or ≥500KB are compressed to JPEG 2048px/85% before upload
- [ ] HEIC, GIF, WebP, AVIF, videos: untouched by compression
- [ ] 3 retry attempts with 1s/2s backoff on transient fetch errors
- [ ] No retry on 403, 4xx, full connection loss (TypeError), or abort
- [ ] `getAdaptivePoolSize()` returns 2/4/8 based on effectiveType
- [ ] `navigator.connection` unavailable (iOS Safari) → defaults to 8
- [ ] `POST /moments/shared/batch-upload-urls` returns N presigned URLs in one call
- [ ] `uploadOne` uses batch-prefetched URLs when available, falls back to individual presign if missing
- [ ] `npx tsc --noEmit` zero errors in cafetton-casero
- [ ] `go build ./...` zero errors in backend
- [ ] `go test ./controllers/moments/... -v` passes
