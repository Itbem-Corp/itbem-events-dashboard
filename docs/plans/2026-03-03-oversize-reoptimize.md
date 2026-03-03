# Oversize Re-optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface photos >100 KB and videos >5 MB in the MomentsWall with a bulk one-click button to send them back through Lambda for re-optimization.

**Architecture:** Add `ForceReoptimize bool` to the SQS `MediaProcessMessage` so Lambda overwrites the optimized file in place (no path derivation issue). Backend exposes `POST /moments/batch/reoptimize` that fetches, validates, resets status, and publishes to the correct queue per media type. Dashboard reads `optimized_size_bytes` from the API (field already exists in Go model), shows an amber badge per oversized card, and a toolbar button that calls the batch endpoint. Lambda change is minimal: when `force_reoptimize=true`, use the input key as the output key instead of deriving `raw→opt`.

**Tech Stack:** Go 1.24 · Echo v4 · GORM · AWS SQS SDK v2 · testify · Next.js 15 · TypeScript · SWR · Tailwind

**Deploy order (production):** Lambda → Backend → Dashboard

---

## Task 1: Fix pre-existing mock compile error + add `SummaryByEventIDs` stub

The service test mock is missing `SummaryByEventIDs` — all service tests currently fail to compile. Fix this before writing any new code.

**Files:**
- Modify: `/var/www/itbem-events-backend/services/moments/moment_service_test.go:118`

**Step 1: Run tests to confirm the break**

```bash
cd /var/www/itbem-events-backend
go test ./services/moments/... 2>&1 | head -5
```

Expected: compile error "missing method SummaryByEventIDs"

**Step 2: Add the missing method stub to `mockMomentRepo`**

In `moment_service_test.go`, after the `GetDistinctEventIDsByMomentIDs` method (line ~116) and before the compile-time check, insert:

```go
func (m *mockMomentRepo) SummaryByEventIDs(eventIDs []uuid.UUID) ([]models.MomentSummary, error) {
    return nil, nil
}
```

**Step 3: Run tests to confirm they now compile and pass**

```bash
cd /var/www/itbem-events-backend
go test ./services/moments/... -v 2>&1 | tail -20
```

Expected: all PASS

**Step 4: Commit**

```bash
cd /var/www/itbem-events-backend
git add services/moments/moment_service_test.go
git commit -m "fix(tests): add missing SummaryByEventIDs stub to mockMomentRepo"
```

---

## Task 2: Add `ForceReoptimize` to `MediaProcessMessage`

**Files:**
- Modify: `/var/www/itbem-events-backend/repositories/sqsrepository/SQSRepository.go`

**Step 1: Add the field to the struct**

Find `MediaProcessMessage` (line ~30) and add the new field:

```go
type MediaProcessMessage struct {
    MomentID        string `json:"moment_id"`
    EventID         string `json:"event_id"`
    RawS3Key        string `json:"raw_s3_key"`
    Bucket          string `json:"bucket"`
    ContentType     string `json:"content_type"`
    IsVideo         bool   `json:"is_video"`
    ForceReoptimize bool   `json:"force_reoptimize"` // ← NEW: when true, Lambda overwrites output key = input key
}
```

**Step 2: Build to verify no breakage**

```bash
cd /var/www/itbem-events-backend
go build ./...
```

Expected: no errors (the field is additive — existing callers compile as-is with `false` zero value)

**Step 3: Run all tests**

```bash
cd /var/www/itbem-events-backend
go test ./... 2>&1 | grep -E "FAIL|ok"
```

Expected: all `ok`

**Step 4: Commit**

```bash
cd /var/www/itbem-events-backend
git add repositories/sqsrepository/SQSRepository.go
git commit -m "feat(sqs): add ForceReoptimize field to MediaProcessMessage"
```

---

## Task 3: Add `GetMomentsByIDs` to repo, port interface, and mock

The batch service needs to fetch N moments in one query. No such method exists yet.

**Files:**
- Modify: `/var/www/itbem-events-backend/repositories/momentrepository/MomentRepository.go`
- Modify: `/var/www/itbem-events-backend/services/ports/ports.go`
- Modify: `/var/www/itbem-events-backend/services/moments/moment_service_test.go`

**Step 1: Add to `MomentRepository.go`** (after `GetMomentByID`)

```go
// GetMomentsByIDs fetches multiple moments by primary key in one query.
// Order of results is not guaranteed. Missing IDs are silently omitted.
func GetMomentsByIDs(ids []uuid.UUID) ([]models.Moment, error) {
    if len(ids) == 0 {
        return nil, nil
    }
    var moments []models.Moment
    err := configuration.DB.Where("id IN ? AND deleted_at IS NULL", ids).Find(&moments).Error
    return moments, err
}

func (r *MomentRepo) GetMomentsByIDs(ids []uuid.UUID) ([]models.Moment, error) {
    return GetMomentsByIDs(ids)
}
```

**Step 2: Add to `ports.go`** `MomentRepository` interface (after `GetMomentByID`):

```go
// GetMomentsByIDs fetches multiple moments by ID in one query.
GetMomentsByIDs(ids []uuid.UUID) ([]models.Moment, error)
```

**Step 3: Add stub to `mockMomentRepo` in `moment_service_test.go`** (after `GetMomentByIDFunc` field and method)

Add to the struct:
```go
GetMomentsByIDsFunc func(ids []uuid.UUID) ([]models.Moment, error)
```

Add the method:
```go
func (m *mockMomentRepo) GetMomentsByIDs(ids []uuid.UUID) ([]models.Moment, error) {
    if m.GetMomentsByIDsFunc != nil {
        return m.GetMomentsByIDsFunc(ids)
    }
    return nil, nil
}
```

**Step 4: Build and run tests**

```bash
cd /var/www/itbem-events-backend
go build ./... && go test ./services/moments/... -v 2>&1 | tail -10
```

Expected: build clean, all tests PASS

**Step 5: Commit**

```bash
cd /var/www/itbem-events-backend
git add repositories/momentrepository/MomentRepository.go \
        services/ports/ports.go \
        services/moments/moment_service_test.go
git commit -m "feat(moments): add GetMomentsByIDs batch fetch to repo + port + mock"
```

---

## Task 4: Add `BatchReoptimize` service method — tests first

**Files:**
- Modify: `/var/www/itbem-events-backend/services/moments/MomentService.go`
- Modify: `/var/www/itbem-events-backend/services/moments/moment_service_test.go`

**Step 1: Write the failing tests** — append to `moment_service_test.go`:

```go
// ---------------------------------------------------------------------------
// BatchReoptimize
// ---------------------------------------------------------------------------

func TestBatchReoptimize_SkipsNonDone(t *testing.T) {
    eventID := uuid.Must(uuid.NewV4())
    pending := models.Moment{ID: uuid.Must(uuid.NewV4()), EventID: &eventID, ProcessingStatus: "pending", OptimizedSizeBytes: 200_000}
    processing := models.Moment{ID: uuid.Must(uuid.NewV4()), EventID: &eventID, ProcessingStatus: "processing", OptimizedSizeBytes: 200_000}

    repo := &mockMomentRepo{
        GetMomentsByIDsFunc: func(ids []uuid.UUID) ([]models.Moment, error) {
            return []models.Moment{pending, processing}, nil
        },
    }
    svc := NewMomentService(repo, &mockCacheRepo{})
    succeeded, skipped, failed, err := svc.BatchReoptimize([]uuid.UUID{pending.ID, processing.ID})

    require.NoError(t, err)
    assert.Equal(t, 0, succeeded)
    assert.Equal(t, 2, skipped)
    assert.Equal(t, 0, failed)
}

func TestBatchReoptimize_SkipsZeroSize(t *testing.T) {
    eventID := uuid.Must(uuid.NewV4())
    m := models.Moment{ID: uuid.Must(uuid.NewV4()), EventID: &eventID, ProcessingStatus: "done", OptimizedSizeBytes: 0}

    repo := &mockMomentRepo{
        GetMomentsByIDsFunc: func(ids []uuid.UUID) ([]models.Moment, error) {
            return []models.Moment{m}, nil
        },
    }
    svc := NewMomentService(repo, &mockCacheRepo{})
    succeeded, skipped, failed, err := svc.BatchReoptimize([]uuid.UUID{m.ID})

    require.NoError(t, err)
    assert.Equal(t, 0, succeeded)
    assert.Equal(t, 1, skipped)
    assert.Equal(t, 0, failed)
}

func TestBatchReoptimize_DeduplicatesIDs(t *testing.T) {
    eventID := uuid.Must(uuid.NewV4())
    id := uuid.Must(uuid.NewV4())
    m := models.Moment{ID: id, EventID: &eventID, ProcessingStatus: "done", ContentURL: "moments/e/opt/file.jpg", OptimizedSizeBytes: 200_000}

    callCount := 0
    repo := &mockMomentRepo{
        GetMomentsByIDsFunc: func(ids []uuid.UUID) ([]models.Moment, error) {
            // IDs must be deduplicated before this call
            assert.Equal(t, 1, len(ids))
            callCount++
            return []models.Moment{m}, nil
        },
        UpdateMomentContentFunc: func(id uuid.UUID, contentURL, processingStatus, thumbnailURL, errorMessage string, durationMs, originalBytes, optimizedBytes int64) error {
            return nil
        },
    }
    svc := NewMomentService(repo, &mockCacheRepo{})
    // Pass the same ID twice
    succeeded, _, _, err := svc.BatchReoptimize([]uuid.UUID{id, id})

    require.NoError(t, err)
    assert.Equal(t, 1, callCount, "GetMomentsByIDs called once with deduplicated IDs")
    _ = succeeded // SQS publish will fail (no client in test) — that's OK, we test dedup logic
}

func TestBatchReoptimize_ResetsStatusToPending(t *testing.T) {
    eventID := uuid.Must(uuid.NewV4())
    id := uuid.Must(uuid.NewV4())
    m := models.Moment{
        ID: id, EventID: &eventID,
        ProcessingStatus: "done",
        ContentURL:       "moments/e/opt/file.jpg",
        ContentType:      "image/jpeg",
        OptimizedSizeBytes: 200_000,
    }

    var capturedStatus string
    repo := &mockMomentRepo{
        GetMomentsByIDsFunc: func(ids []uuid.UUID) ([]models.Moment, error) {
            return []models.Moment{m}, nil
        },
        UpdateMomentContentFunc: func(id uuid.UUID, contentURL, processingStatus, thumbnailURL, errorMessage string, durationMs, originalBytes, optimizedBytes int64) error {
            capturedStatus = processingStatus
            return nil
        },
    }
    svc := NewMomentService(repo, &mockCacheRepo{})
    svc.BatchReoptimize([]uuid.UUID{id})

    assert.Equal(t, "pending", capturedStatus, "processing_status must be reset to 'pending'")
}
```

**Step 2: Run to verify they fail**

```bash
cd /var/www/itbem-events-backend
go test ./services/moments/... -v -run TestBatchReoptimize 2>&1 | head -5
```

Expected: compile error — `BatchReoptimize` undefined

**Step 3: Implement `BatchReoptimize` in `MomentService.go`**

Add after `RequeueMoment` (around line 230):

```go
// BatchReoptimize re-queues a set of already-optimized moments for a second
// Lambda pass with ForceReoptimize=true (Lambda overwrites the file in place).
//
// Rules:
//   - Max 200 IDs (callers must enforce; service enforces as a safety net)
//   - Only "done" moments with OptimizedSizeBytes > 0 are processed
//   - Duplicate IDs are collapsed before any DB call
//   - If processing_status is already "pending" or "processing", the moment is skipped (idempotency)
//   - SQS failures are non-fatal — counted in `failed`, processing continues
//
// Returns: succeeded, skipped, failed counts plus a non-nil error only on
// catastrophic failure (DB fetch error). Partial SQS failures are reported
// via the failed count only.
func (s *MomentService) BatchReoptimize(ids []uuid.UUID) (succeeded, skipped, failed int, err error) {
    if len(ids) == 0 {
        return
    }

    // Deduplicate
    seen := make(map[uuid.UUID]struct{}, len(ids))
    unique := ids[:0]
    for _, id := range ids {
        if _, ok := seen[id]; !ok {
            seen[id] = struct{}{}
            unique = append(unique, id)
        }
    }
    if len(unique) > 200 {
        unique = unique[:200]
    }

    moments, fetchErr := s.repo.GetMomentsByIDs(unique)
    if fetchErr != nil {
        return 0, 0, 0, fetchErr
    }

    for _, m := range moments {
        // Skip if already in-flight or no size data
        if m.ProcessingStatus == "pending" || m.ProcessingStatus == "processing" || m.OptimizedSizeBytes == 0 {
            skipped++
            continue
        }
        // Only re-optimize successfully processed moments
        if m.ProcessingStatus != "done" {
            skipped++
            continue
        }
        if m.EventID == nil {
            skipped++
            continue
        }

        // Reset status — keep content_url, thumbnail_url, error_message blank
        if updateErr := s.repo.UpdateMomentContent(m.ID, m.ContentURL, "pending", "", "", 0, 0, 0); updateErr != nil {
            failed++
            slog.Error("BatchReoptimize: failed to reset status", "moment_id", m.ID, "error", updateErr)
            continue
        }

        isVid := strings.HasSuffix(m.ContentURL, ".mp4") ||
            strings.HasSuffix(m.ContentURL, ".mov") ||
            strings.HasSuffix(m.ContentURL, ".webm")

        ct := m.ContentType
        if ct == "" {
            ct = mime.TypeByExtension(filepath.Ext(m.ContentURL))
            if ct == "" {
                ct = "application/octet-stream"
            }
        }

        if _, sqsErr := sqsrepository.PublishMediaJob(sqsrepository.MediaProcessMessage{
            MomentID:        m.ID.String(),
            EventID:         m.EventID.String(),
            RawS3Key:        m.ContentURL,
            Bucket:          os.Getenv("S3_BUCKET_NAME"),
            ContentType:     ct,
            IsVideo:         isVid,
            ForceReoptimize: true,
        }); sqsErr != nil {
            failed++
            slog.Error("BatchReoptimize: SQS publish failed", "moment_id", m.ID, "error", sqsErr)
            // Roll back status to "done" so the moment isn't stuck as "pending"
            _ = s.repo.UpdateMomentContent(m.ID, m.ContentURL, "done", "", "", 0, 0, 0)
            continue
        }

        s.invalidateWallCache(*m.EventID)
        succeeded++
    }

    _ = s.cache.Invalidate("moments", "all")
    return
}

// Package-level wrapper
func BatchReoptimize(ids []uuid.UUID) (succeeded, skipped, failed int, err error) {
    return _momentSvc.BatchReoptimize(ids)
}
```

Ensure these imports are present in `MomentService.go` (add if missing):
```go
import (
    "log/slog"
    // ... existing imports
)
```

**Step 4: Run the new tests**

```bash
cd /var/www/itbem-events-backend
go test ./services/moments/... -v -run TestBatchReoptimize 2>&1
```

Expected: all PASS (SQS publish will no-op since sqsClient is nil in tests)

**Step 5: Run full test suite**

```bash
cd /var/www/itbem-events-backend
go test ./... 2>&1 | grep -E "FAIL|ok"
```

Expected: all `ok`

**Step 6: Commit**

```bash
cd /var/www/itbem-events-backend
git add services/moments/MomentService.go services/moments/moment_service_test.go
git commit -m "feat(moments): add BatchReoptimize service method with ForceReoptimize flag"
```

---

## Task 5: Add `BatchReoptimizeMoments` HTTP controller + register route

**Files:**
- Modify: `/var/www/itbem-events-backend/controllers/moments/moments.go`
- Modify: `/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Add the handler to `moments.go`**

Add after `BulkApproveRejectMoments`:

```go
// POST /moments/batch/reoptimize — admin action to re-queue oversized optimized moments.
// Accepts up to 200 moment IDs. Only "done" moments with known size are processed.
// Returns {succeeded, skipped, failed} counts.
func BatchReoptimizeMoments(c echo.Context) error {
    var body struct {
        IDs []string `json:"ids"`
    }
    if err := c.Bind(&body); err != nil {
        return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
    }
    if len(body.IDs) == 0 {
        return utils.Error(c, http.StatusBadRequest, "No IDs provided", "")
    }
    if len(body.IDs) > 200 {
        return utils.Error(c, http.StatusBadRequest, "Too many IDs (max 200)", "")
    }

    uuids := make([]uuid.UUID, 0, len(body.IDs))
    for _, idStr := range body.IDs {
        id, err := uuid.FromString(idStr)
        if err != nil {
            return utils.Error(c, http.StatusBadRequest, "Invalid UUID: "+idStr, err.Error())
        }
        uuids = append(uuids, id)
    }

    succeeded, skipped, failed, err := momentSvc.BatchReoptimize(uuids)
    if err != nil {
        return utils.Error(c, http.StatusInternalServerError, "Batch reoptimize failed", err.Error())
    }

    return utils.Success(c, http.StatusOK, "Batch reoptimize complete", map[string]int{
        "succeeded": succeeded,
        "skipped":   skipped,
        "failed":    failed,
    })
}
```

**Step 2: Register the route in `routes.go`**

Find the protected moments routes section (around line 232) and add:

```go
protected.POST("/moments/batch/reoptimize", moments.BatchReoptimizeMoments) // must be before /:id routes
```

Place it **before** the existing `POST("/moments/bulk-approve", ...)` line so specific paths resolve before the generic `:id` wildcard.

**Step 3: Build**

```bash
cd /var/www/itbem-events-backend
go build ./...
```

Expected: clean

**Step 4: Run all tests**

```bash
cd /var/www/itbem-events-backend
go test ./... 2>&1 | grep -E "FAIL|ok"
```

Expected: all `ok`

**Step 5: Commit**

```bash
cd /var/www/itbem-events-backend
git add controllers/moments/moments.go routes/routes.go
git commit -m "feat(moments): POST /moments/batch/reoptimize endpoint — admin bulk re-optimization"
```

---

## Task 6: Lambda — handle `force_reoptimize` flag

The Lambda is in a separate project (`itbem-media-processor`). This task documents the required change.

**What the Lambda must do when `force_reoptimize == true`:**

1. Read `force_reoptimize` from the SQS message JSON (it will be `false` or absent for all existing messages — backward compatible)
2. When `true`: set `outputKey = inputKey` (same S3 key — overwrite in place)
3. When `false` (default): use existing behavior (`raw/ → opt/` substitution)

**Pseudo-code sketch** (adapt to whatever language/framework the Lambda uses):

```js
const forceReoptimize = event.force_reoptimize ?? false

// Existing path derivation
let outputKey = forceReoptimize
  ? event.raw_s3_key                                   // overwrite in place
  : event.raw_s3_key.replace('/raw/', '/opt/')          // existing behavior

// Download from S3 using event.raw_s3_key
// Process (compress image / transcode video)
// Upload to outputKey
// Call back PUT /api/moments/{moment_id}/content
```

**Step 1:** Implement in the Lambda project, deploy to staging, verify callback fires correctly.

**Step 2:** Only after Lambda is deployed — proceed with Task 7 (dashboard).

---

## Task 7: Dashboard — update `Moment.ts` model

**Files:**
- Modify: `src/models/Moment.ts`

**Step 1: Add the new fields**

```typescript
export interface Moment extends BaseEntity {
  event_id: string
  invitation_id?: string | null
  content_url: string
  thumbnail_url?: string
  description?: string
  is_approved: boolean
  processing_status: ProcessingStatus
  order?: number
  // Lambda processing metrics — populated when processing_status = 'done'
  original_size_bytes?: number
  optimized_size_bytes?: number
  content_type?: string
}
```

**Step 2: Build to verify types**

```bash
npx tsc --noEmit
```

Expected: zero errors

**Step 3: Commit**

```bash
git add src/models/Moment.ts
git commit -m "feat(models): expose optimized_size_bytes, original_size_bytes, content_type on Moment"
```

---

## Task 8: Dashboard — oversized detection helper + size badge on cards

**Files:**
- Modify: `src/components/events/moments-wall.tsx`

**Step 1: Add helper constants and formatter after the `VISIBLE_PAGE` const (around line 41)**

```typescript
const OVERSIZED_PHOTO_BYTES = 100_000   // 100 KB
const OVERSIZED_VIDEO_BYTES = 5_000_000 // 5 MB

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1_000)} KB`
}

function isOversized(m: Moment): boolean {
  if (!m.optimized_size_bytes || m.optimized_size_bytes === 0) return false
  if (m.processing_status !== 'done') return false
  return isVideo(m.content_url)
    ? m.optimized_size_bytes > OVERSIZED_VIDEO_BYTES
    : m.optimized_size_bytes > OVERSIZED_PHOTO_BYTES
}
```

**Step 2: Add the amber size badge to the moment card**

Find the card rendering section in the `MomentCard` component (or wherever the status badges are rendered — search for `processingLabel` or `ExclamationTriangleIcon` usage). Add the badge alongside the existing status indicators:

```tsx
{isOversized(moment) && (
  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400">
    <ExclamationTriangleIcon className="h-3 w-3" />
    {formatBytes(moment.optimized_size_bytes!)}
  </span>
)}
```

**Step 3: Build to verify no TS errors**

```bash
npx tsc --noEmit
```

Expected: zero errors

**Step 4: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments-wall): amber size badge on oversized photo/video cards"
```

---

## Task 9: Dashboard — toolbar button + batch reoptimize handler

**Files:**
- Modify: `src/components/events/moments-wall.tsx`

**Step 1: Add state and derived data**

In the `MomentsWall` component, alongside the existing `requeuingLegacy` state (around line 1092), add:

```typescript
const [requeuingOversized, setRequeuingOversized] = useState(false)

const oversizedMoments = useMemo(
  () => (moments ?? []).filter(isOversized),
  [moments]
)
```

**Step 2: Add the handler**

After `handleRequeueLegacy`, add:

```typescript
const handleReoptimizeOversized = async () => {
  if (oversizedMoments.length === 0 || requeuingOversized) return
  setRequeuingOversized(true)
  try {
    const ids = oversizedMoments.map((m) => m.id)
    const res = await api.post('/moments/batch/reoptimize', { ids })
    const { succeeded, skipped, failed } = res.data?.data ?? { succeeded: 0, skipped: 0, failed: 0 }
    if (failed > 0) {
      toast.error(`${succeeded} reencolados, ${failed} con error`)
    } else {
      toast.success(`${succeeded} archivos reencolados para reoptimización${skipped > 0 ? ` (${skipped} omitidos)` : ''}`)
    }
    await mutate()
  } catch {
    toast.error('Error al reoptimizar archivos')
  } finally {
    setRequeuingOversized(false)
  }
}
```

**Step 3: Add the toolbar button**

Find the section where `{/* Bulk requeue legacy moments */}` is rendered (around line 1428). Add the new button right after it:

```tsx
{/* Reoptimize oversized moments */}
{oversizedMoments.length > 0 && (
  <button
    onClick={handleReoptimizeOversized}
    disabled={requeuingOversized}
    className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
    title={`${oversizedMoments.length} archivo${oversizedMoments.length !== 1 ? 's' : ''} por encima del umbral de tamaño`}
  >
    {requeuingOversized ? (
      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
    ) : (
      <SparklesIcon className="h-3.5 w-3.5" />
    )}
    Reoptimizar ({oversizedMoments.length})
  </button>
)}
```

**Step 4: Build and type-check**

```bash
npx tsc --noEmit && npm run build
```

Expected: zero errors, successful build

**Step 5: Run unit tests**

```bash
npm run test:unit
```

Expected: all pass

**Step 6: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments-wall): bulk reoptimize button for oversized photos/videos"
```

---

## Task 10: Update docs

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/models.md`

**Step 1: Add to `docs/api.md`** in the Moments (dashboard) table:

```markdown
| POST | `/moments/batch/reoptimize` | Re-queue oversized optimized moments for a second Lambda pass. Body: `{ ids: string[] }` (max 200). Response: `{ succeeded, skipped, failed }` |
```

**Step 2: Update `docs/models.md`** Moment section:

```markdown
**Moment** — `event_id` `invitation_id?` `content_url` `thumbnail_url?` `description?` `is_approved` `processing_status` (`ProcessingStatus`) `order?` `original_size_bytes?` `optimized_size_bytes?` `content_type?`
```

And add below `ProcessingStatus`:

```markdown
**Oversized thresholds** — photo: `optimized_size_bytes > 100_000` (100 KB) · video: `optimized_size_bytes > 5_000_000` (5 MB) · only applies when `processing_status === 'done'` and `optimized_size_bytes > 0`
```

**Step 3: Commit**

```bash
git add docs/api.md docs/models.md
git commit -m "docs: document batch/reoptimize endpoint and Moment size fields"
```

---

## Final Verification

```bash
# Backend
cd /var/www/itbem-events-backend
go build ./...
go test ./... 2>&1 | grep -E "FAIL|ok"

# Dashboard
cd /path/to/dashboard-ts
npx tsc --noEmit
npm run test:unit
npm run build
```

All lines: `ok` / zero errors / successful build.

## Release Checklist

- [ ] Lambda deployed with `force_reoptimize` support (Task 6)
- [ ] Backend deployed (`POST /moments/batch/reoptimize` live)
- [ ] Dashboard deployed (button visible)
- [ ] Verified end-to-end: click button → moments go to `pending` → Lambda callback → status `done` → `optimized_size_bytes` updated → badge disappears if now under threshold
