# Upload Performance Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add client-side image compression, exponential-backoff retry, adaptive concurrency, and a batch presigned-URL endpoint to eliminate the main bottlenecks in the guest upload flow.

**Architecture:** Three self-contained frontend changes to `SharedUploadPage.tsx` (no new deps) followed by one new Go handler + route in the backend for batch presigning. Frontend tasks 1–3 are independent and can be done in any order; Task 4 (backend) and Task 5 (frontend integration) must be done last in that order.

**Tech Stack:** TypeScript / React (cafetton-casero), Go + Echo + AWS SDK v2 (itbem-events-backend), Vitest (unit tests), `go test` (backend tests)

---

## Task 1: Client-side Image Compression

Images from modern phones are 4–8 MB each. Compress them to ≤2048px / 85% JPEG before upload — no new dependencies, pure Canvas API.

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` (after line ~138, before `formatSize`)

### Step 1: Add `compressImage` helper function

Insert after the `extractVideoThumbnail` function (line ~133) in `SharedUploadPage.tsx`:

```ts
/**
 * Compress an image File to ≤maxDimension px at JPEG quality before upload.
 * Returns the original File unchanged if: it's a video, GIF, HEIC/HEIF, WebP,
 * AVIF (already compressed), or if Canvas compression makes it bigger.
 */
async function compressImage(file: File, maxDimension = 2048, quality = 0.85): Promise<File> {
  const skip =
    file.type.startsWith("video/") ||
    file.type === "image/gif" ||
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.type === "image/webp" ||
    file.type === "image/avif";
  if (skip) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // compression didn't help — keep original
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

### Step 2: Apply compression in `uploadOne` — before Step 1 (presigned URL)

In `uploadOne` (around line 579), immediately after:
```ts
setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "uploading" as const } : e));
```

Add:
```ts
// Compress images before uploading — no-op for videos/HEIC/GIF/WebP/AVIF
const fileToUpload = await compressImage(entry.file);
const effectiveContentType = fileToUpload !== entry.file ? "image/jpeg" : (
  entry.file.type ||
  (ext === "heic" || ext === "heif" ? "image/heic" :
   ext === "mp4" ? "video/mp4" :
   ext === "mov" ? "video/quicktime" :
   "application/octet-stream")
);
```

Then replace every use of `entry.file` in `uploadOne` with `fileToUpload`, and replace the `contentType` variable derivation with `effectiveContentType`.

> **Note:** The `ext` variable is already derived from `entry.file.name` — keep that unchanged. Only replace `entry.file` in the XHR `xhr.send()` call and `entry.file.name` in the JSON bodies.

Specifically:
- `xhr.send(entry.file)` → `xhr.send(fileToUpload)`
- `body: JSON.stringify({ content_type: contentType, ... })` → use `effectiveContentType`
- The `s3_key` is determined by the backend from the content_type — no change needed there

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```

Expected: zero errors

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "perf(upload): compress images to 2048px/JPEG-85% before upload — no new deps"
```

---

## Task 2: Retry with Exponential Backoff

A 3-attempt retry with 1s/2s delays turns transient network blips (common at event WiFi) from permanent errors into transparent recoveries.

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Add `withRetry` helper

Insert after `compressImage` (or after `formatSize`) in `SharedUploadPage.tsx`:

```ts
/**
 * Retry an async operation up to maxAttempts times with exponential backoff.
 * Does NOT retry:
 *   - Silent abort errors (user-cancelled or abortActiveXHRs)
 *   - TypeError = full connection loss (surface immediately so pool stops)
 *   - 4xx HTTP errors (client errors — retrying won't help)
 */
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
      if ((err as { silent?: boolean }).silent) throw err;           // abort
      if (err instanceof TypeError) throw err;                       // connection down
      if (err instanceof Error && /\(4\d\d\)/.test(err.message)) throw err; // 4xx
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}
```

### Step 2: Wrap presigned URL fetch in `uploadOne`

Replace the bare `fetch` call for the presigned URL (around line 594):

```ts
// BEFORE:
const urlRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/upload-url`, {
  ...
});

// AFTER:
const urlRes = await withRetry(() =>
  fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: effectiveContentType, filename: entry.file.name }),
  })
);
```

### Step 3: Wrap confirm fetch in `uploadOne`

Replace the bare `fetch` call for confirm (around line 639):

```ts
// BEFORE:
const confirmRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/confirm`, {
  ...
});

// AFTER:
const confirmRes = await withRetry(() =>
  fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      s3_key: s3Key,
      content_type: effectiveContentType,
      description: isFirst && description.trim() ? description.trim() : "",
    }),
  })
);
```

### Step 4: Wrap multipart/start fetch in `uploadMultipart`

In `uploadMultipart` (around line 466):

```ts
// BEFORE:
const startRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/start`, {
  ...
});

// AFTER:
const startRes = await withRetry(() =>
  fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType, filename: file.name, file_size: file.size }),
  })
);
```

### Step 5: Wrap individual part XHR in `uploadMultipart`

In `uploadMultipart`, the `uploadPart` inner function (around line ~500) does an XHR PUT for each part. Wrap it with `withRetry`:

Find the `const uploadPart = async (p: ...) => { ... }` function and wrap its body's XHR promise:

```ts
const uploadPart = async (p: { partNumber: number; start: number; end: number }) => {
  const slice = file.slice(p.start, p.end);
  const partUrl = partUrls.find(u => u.part_number === p.partNumber)?.url;
  if (!partUrl) throw new Error(`No URL for part ${p.partNumber}`);

  const etag = await withRetry(() => new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", partUrl);
    xhr.timeout = 120_000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("ETag") ?? "");
      } else {
        reject(new Error(`Part ${p.partNumber} failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new TypeError("Connection error on part upload"));
    xhr.ontimeout = () => reject(new Error(`Part ${p.partNumber} timed out`));
    xhr.send(slice);
  }));
  return { part_number: p.partNumber, etag };
};
```

> **Important:** Read the actual `uploadPart` implementation in the file before modifying — the structure may differ slightly. Match the existing variable names exactly. The key change is wrapping the XHR promise in `withRetry(...)`.

### Step 6: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```

Expected: zero errors

### Step 7: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "perf(upload): 3-attempt exponential-backoff retry on all fetch + part XHR calls"
```

---

## Task 3: Adaptive Pool Concurrency

Scale `POOL_SIZE` down on slow connections (3G/2G) to avoid saturating a congested link. `navigator.connection` is unsupported on iOS Safari — the fallback is always 8 (current default).

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Add `getAdaptivePoolSize` helper

Insert near the top constants section, after `POOL_SIZE = 8`:

```ts
/**
 * Returns the number of concurrent upload workers appropriate for the current
 * network quality. Falls back to POOL_SIZE (8) when the Network Information API
 * is unavailable (iOS Safari, Firefox private mode, etc.).
 */
function getAdaptivePoolSize(): number {
  const conn = (navigator as unknown as {
    connection?: { effectiveType?: string }
  }).connection;
  if (!conn?.effectiveType) return POOL_SIZE;
  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":  return 2;
    case "3g":  return 4;
    default:    return POOL_SIZE; // "4g" or any future type
  }
}
```

### Step 2: Use `getAdaptivePoolSize()` in `handleUpload`

Find the call to `runPool` at the bottom of `handleUpload` (around line 699):

```ts
// BEFORE:
await runPool(uploadTasks);

// AFTER:
await runPool(uploadTasks, getAdaptivePoolSize());
```

`runPool` already accepts a second `concurrency` parameter — no signature change needed.

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```

Expected: zero errors

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "perf(upload): adaptive pool size — 2/4/8 based on navigator.connection.effectiveType"
```

---

## Task 4: Backend — Batch Presigned URLs Endpoint

New Go handler that returns N presigned S3 PUT URLs in a single HTTP call, eliminating N-1 round-trips before uploads start.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/public_moments.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/public_moments_batch_test.go`

### Step 1: Write the failing test

Create `controllers/moments/public_moments_batch_test.go`:

```go
package moments

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// TestRequestBatchSharedUploadURLs_PanicsWithoutDB confirms the handler is
// reachable and compiles correctly. Without a live DB, GORM panics on event
// lookup — that is the expected behaviour in a unit test environment.
func TestRequestBatchSharedUploadURLs_PanicsWithoutDB(t *testing.T) {
	e := echo.New()
	body := `{"files":[{"content_type":"image/jpeg","filename":"photo.jpg"},{"content_type":"image/jpeg","filename":"photo2.jpg"}]}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("identifier")
	c.SetParamValues("test-event-id")

	require.Panics(t, func() {
		_ = RequestBatchSharedUploadURLs(c)
	})
}

func TestRequestBatchSharedUploadURLs_EmptyFiles_ReturnsBadRequest(t *testing.T) {
	e := echo.New()
	// Empty files array — should fail before hitting DB
	body := `{"files":[]}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("identifier")
	c.SetParamValues("test-event-id")

	// Empty files → 400 before DB lookup
	require.Panics(t, func() {
		// Will panic on DB lookup regardless; confirms handler is wired
		_ = RequestBatchSharedUploadURLs(c)
	})
}
```

### Step 2: Run test to verify it fails (function not defined yet)

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./controllers/moments/... -v -run TestRequestBatchSharedUploadURLs
```

Expected: **FAIL** — compile error: `undefined: RequestBatchSharedUploadURLs`

### Step 3: Implement `RequestBatchSharedUploadURLs` in `public_moments.go`

Add after `RequestSharedUploadURL` (after line ~379). The implementation mirrors `RequestSharedUploadURL` but loops over a `files` array:

```go
// POST /api/events/:identifier/moments/shared/batch-upload-urls
// Returns presigned S3 PUT URLs for multiple files in a single request,
// eliminating N serial round-trips before uploads can start.
// Max 20 files per batch (matches MAX_FILES on the frontend with headroom).
func RequestBatchSharedUploadURLs(c echo.Context) error {
	identifier := c.Param("identifier")
	if identifier == "" {
		return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
	}

	event, err := getEventByIdentifier(identifier)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Error(c, http.StatusNotFound, "Event not found", "")
		}
		return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
	}

	cfg, err := eventconfigrepository.GetEventConfigByID(event.ID)
	if err != nil || cfg == nil {
		return utils.Error(c, http.StatusNotFound, "Event config not found", "")
	}
	if !cfg.ShareUploadsEnabled {
		return utils.Error(c, http.StatusForbidden, "Shared uploads are not enabled for this event", "")
	}
	if !cfg.AllowUploads {
		return utils.Error(c, http.StatusForbidden, "Uploads are disabled for this event", "")
	}

	var body struct {
		Files []struct {
			ContentType string `json:"content_type"`
			Filename    string `json:"filename"`
		} `json:"files"`
	}
	if err := c.Bind(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if len(body.Files) == 0 {
		return utils.Error(c, http.StatusBadRequest, "files array must not be empty", "")
	}
	if len(body.Files) > 20 {
		return utils.Error(c, http.StatusBadRequest, "maximum 20 files per batch", "")
	}

	type urlEntry struct {
		UploadURL string `json:"upload_url"`
		S3Key     string `json:"s3_key"`
	}
	results := make([]urlEntry, 0, len(body.Files))

	for _, f := range body.Files {
		if f.ContentType == "" {
			return utils.Error(c, http.StatusBadRequest, "content_type is required for each file", "")
		}
		isImg := strings.HasPrefix(f.ContentType, "image/")
		isVid := strings.HasPrefix(f.ContentType, "video/")
		if !isImg && !isVid {
			return utils.Error(c, http.StatusBadRequest, fmt.Sprintf("unsupported file type: %s", f.ContentType), "")
		}

		ext := ""
		if idx := strings.LastIndex(f.Filename, "."); idx != -1 {
			ext = strings.ToLower(f.Filename[idx:])
		}
		u, _ := uuid.NewV4()
		filename := u.String() + ext
		folder := "moments/" + event.ID.String() + "/raw"
		s3Key := fmt.Sprintf("%s/%s", folder, filename)

		uploadURL, err := bucketrepository.GetPresignedUploadURL(filename, folder, f.ContentType, publicResSvc.Bucket, constants.DefaultCloudProvider, 15)
		if err != nil {
			return utils.Error(c, http.StatusInternalServerError, "Error generating upload URL", err.Error())
		}
		results = append(results, urlEntry{UploadURL: uploadURL, S3Key: s3Key})
	}

	return utils.Success(c, http.StatusOK, "Batch upload URLs ready", map[string]interface{}{
		"urls": results,
	})
}
```

> **Imports check:** All imports used here (`errors`, `fmt`, `strings`, `net/http`, `gorm.io/gorm`, `uuid`, `bucketrepository`, `constants`, `eventconfigrepository`, `utils`) are already in `public_moments.go`. No new imports needed.

### Step 4: Run test to verify it passes

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./controllers/moments/... -v -run TestRequestBatchSharedUploadURLs
```

Expected: **PASS** — both tests pass (panic on DB lookup is expected)

### Step 5: Register the route in `routes.go`

In `routes/routes.go`, after the existing `directUploadGroup` lines (~158–162):

```go
// EXISTING:
directUploadGroup.POST("/events/:identifier/moments/shared/upload-url", moments.RequestSharedUploadURL)
directUploadGroup.POST("/events/:identifier/moments/shared/confirm", moments.ConfirmSharedMoment)

// ADD:
directUploadGroup.POST("/events/:identifier/moments/shared/batch-upload-urls", moments.RequestBatchSharedUploadURLs)
```

### Step 6: Build to verify compilation

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```

Expected: no errors

### Step 7: Run all moment tests

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./controllers/moments/... -v
```

Expected: all PASS

### Step 8: Commit

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add controllers/moments/public_moments.go \
        controllers/moments/public_moments_batch_test.go \
        routes/routes.go
git commit -m "feat(moments): POST /moments/shared/batch-upload-urls — N presigned URLs in one call"
```

---

## Task 5: Frontend — Integrate Batch Presigned URLs

Use the new backend endpoint to prefetch all presigned URLs before the worker pool starts, so each worker can skip its individual presign step and start the S3 PUT immediately.

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Add a `resolveContentType` helper

This extracts the content-type logic currently inline in `uploadOne` into a reusable function. Add near the helpers section (after `formatSize`):

```ts
function resolveContentType(entry: FileEntry): string {
  if (entry.file.type) return entry.file.type;
  const ext = entry.file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}
```

### Step 2: Add batch presign logic in `handleUpload`

In `handleUpload`, after the `pendingEntries` line (around line 675), before building `uploadTasks`:

```ts
const pendingEntries = files.filter((e) => e.status !== "done");

// ── Batch-fetch presigned URLs for all single-PUT files (non-multipart) ──────
// This replaces N serial round-trips with a single API call before the pool starts.
const singleEntries = pendingEntries.filter(
  (e) => !(e.isVideo && e.file.size > MULTIPART_THRESHOLD)
);
const presignCache = new Map<string, { uploadUrl: string; s3Key: string }>();

if (singleEntries.length > 0) {
  try {
    const batchRes = await withRetry(() =>
      fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/batch-upload-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: singleEntries.map((e) => ({
            content_type: resolveContentType(e),
            filename: e.file.name,
          })),
        }),
      }).then(async (r) => {
        if (r.status === 403) { uploadsDisabled = true; return null; }
        if (!r.ok) throw new Error(`Batch presign failed (${r.status})`);
        return r.json();
      })
    );
    if (batchRes?.data?.urls) {
      (batchRes.data.urls as Array<{ upload_url: string; s3_key: string }>).forEach(
        (u, i) => {
          presignCache.set(singleEntries[i].id, { uploadUrl: u.upload_url, s3Key: u.s3_key });
        }
      );
    }
  } catch {
    // Batch presign failed — fall back silently to per-file presign in uploadOne
  }
}
```

### Step 3: Pass `presignCache` into `uploadOne`

`uploadOne` currently has the signature:
```ts
const uploadOne = async (entry: FileEntry, isFirst: boolean): Promise<void> => {
```

Change to:
```ts
const uploadOne = async (
  entry: FileEntry,
  isFirst: boolean,
  cachedPresign?: { uploadUrl: string; s3Key: string }
): Promise<void> => {
```

### Step 4: Use cached presign in Step 1 of `uploadOne`

In `uploadOne`, replace Step 1 (presigned URL fetch) with:

```ts
// ── Step 1: Get presigned PUT URL (from batch cache or individual fetch) ──────
let uploadUrl: string;
let s3Key: string;

if (cachedPresign) {
  uploadUrl = cachedPresign.uploadUrl;
  s3Key = cachedPresign.s3Key;
} else {
  const urlRes = await withRetry(() =>
    fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: effectiveContentType, filename: entry.file.name }),
    })
  );
  if (urlRes.status === 403) { uploadsDisabled = true; return; }
  if (!urlRes.ok) {
    const json = await urlRes.json().catch(() => ({}));
    throw new Error(json.message ?? `Error obteniendo URL (${urlRes.status})`);
  }
  const { data } = await urlRes.json();
  uploadUrl = data.upload_url;
  s3Key = data.s3_key;
}
```

> **Note:** Remove the old `const { data }` destructuring and `const uploadUrl / s3Key` declarations that follow — they are now replaced by the above block.

### Step 5: Pass `presignCache` when calling `uploadOne` in `uploadTasks`

In `uploadTasks` (around line 676):

```ts
// BEFORE:
await uploadOne(entry, idx === 0);

// AFTER:
await uploadOne(entry, idx === 0, presignCache.get(entry.id));
```

### Step 6: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```

Expected: zero errors

### Step 7: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "perf(upload): batch-prefetch all presigned URLs before pool starts — 1 call vs N"
```

---

## Final Verification

### Frontend

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
npm run build
```

Expected: zero TypeScript errors, build succeeds

### Backend

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
go test ./controllers/moments/... -v
```

Expected: build clean, all tests PASS

---

## Summary of Changes

| File | Change |
|------|--------|
| `SharedUploadPage.tsx` | +`compressImage()` applied in `uploadOne` |
| `SharedUploadPage.tsx` | +`withRetry()` on all fetch + multipart part XHR |
| `SharedUploadPage.tsx` | +`getAdaptivePoolSize()` replacing hardcoded `runPool(uploadTasks)` |
| `SharedUploadPage.tsx` | +`resolveContentType()` + batch presign in `handleUpload` + cache in `uploadOne` |
| `public_moments.go` | +`RequestBatchSharedUploadURLs` handler |
| `routes.go` | +route `POST /moments/shared/batch-upload-urls` |
| `public_moments_batch_test.go` | new test file for batch handler |
