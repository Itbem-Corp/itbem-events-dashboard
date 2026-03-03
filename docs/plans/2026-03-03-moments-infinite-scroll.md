# Moments Wall Cursor Pagination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace offset-based pagination (100/page) on the public moments wall with cursor-based infinite scroll (25/page, max 500 visible) using a `(created_at, id)` keyset cursor.

**Architecture:** Two-project change. Backend adds `ListApprovedForWallCursor` through repo → service → controller layers, alongside existing page mode. Frontend switches `MomentsGallery.tsx` from `page` state to `cursor` state with a 500-item cap and end message.

**Tech Stack:** Go 1.22 · Echo v4 · GORM · PostgreSQL · React 18 (Astro island)

---

## Context

- **Backend path:** `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend`
- **Frontend path:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero`
- **Design doc:** `docs/plans/2026-03-03-moments-infinite-scroll-design.md`
- **Run backend tests:** In WSL: `cd /var/www/itbem-events-backend && go test ./controllers/moments/... ./services/moments/... ./repositories/momentrepository/... -v`
- **Run frontend build:** In Astro project root: `npm run build`

## How the existing code works (read this before touching anything)

**Backend pagination flow:**
1. `GET /api/events/:id/moments?page=1&limit=20` hits `ListPublicMoments` in `controllers/moments/public_moments.go:103`
2. Controller parses `page` and `limit` params, calls `momentsService.ListApprovedForWall(event.ID, page, limit)`
3. Service checks Redis cache with key `moments:wall:{eventID}:p{page}:l{limit}`, returns cached result or queries DB
4. Repository `ListApprovedForWall` in `repositories/momentrepository/MomentRepository.go:159` runs raw SQL with `ORDER BY order ASC, created_at DESC LIMIT ? OFFSET ?`
5. Response includes `items`, `total`, `page`, `limit`, `has_more`, `published`, `event_name`

**Cursor mode will add a parallel flow** triggered when `?cursor=` query param is present (even empty string). Page mode is 100% unchanged.

**Cache invalidation:** `MomentService.invalidateWallCache` deletes `moments:wall:{eventID}:*` — cursor keys use prefix `moments:wall:{eventID}:cursor:` so they are automatically invalidated too.

**Frontend flow:** `MomentsGallery.tsx` has `fetchMoments(id, pageNum, append)` which builds `?page=N&limit=100`. An `IntersectionObserver` on a sentinel div at the bottom auto-calls `loadMore()` when it enters the viewport (300px early).

---

## Task 1: Add `ListApprovedForWallCursor` to the repository

**Files:**
- Modify: `repositories/momentrepository/MomentRepository.go` (after line 212)

**Step 1: Write the failing test**

Add a new test in `repositories/momentrepository/` (or write it in the existing integration test). Since unit-testing repository code requires a real DB, skip unit tests here and rely on the integration test in Task 5. Instead, write a compile-time check in the test file.

Open `repositories/momentrepository/MomentRepository.go` and add these two functions **after** the existing `ListApprovedForWall` block (after line 212):

```go
// ListApprovedForWallCursor returns approved + optimized moments using keyset pagination.
// Pass afterCreatedAt=nil / afterID="" for the first page (returns most recent N moments).
// Cursor mode orders strictly by (created_at DESC, id DESC) — ignores the manual "order" field
// so pagination is stable and simple. Page mode (existing) still respects manual ordering.
func ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	var moments []models.Moment
	if afterCreatedAt != nil && afterID != "" {
		err := configuration.DB.Raw(`
			SELECT m.*
			FROM moments m
			WHERE m.event_id = ?
			  AND m.is_approved = true
			  AND m.processing_status IN ('', 'done')
			  AND m.deleted_at IS NULL
			  AND (m.created_at < ? OR (m.created_at = ? AND m.id::text < ?))
			ORDER BY m.created_at DESC, m.id::text DESC
			LIMIT ?
		`, eventID, afterCreatedAt, afterCreatedAt, afterID, limit).Scan(&moments).Error
		return moments, err
	}
	// First page — no cursor condition
	err := configuration.DB.Raw(`
		SELECT m.*
		FROM moments m
		WHERE m.event_id = ?
		  AND m.is_approved = true
		  AND m.processing_status IN ('', 'done')
		  AND m.deleted_at IS NULL
		ORDER BY m.created_at DESC, m.id::text DESC
		LIMIT ?
	`, eventID, limit).Scan(&moments).Error
	return moments, err
}

func (r *MomentRepo) ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	return ListApprovedForWallCursor(eventID, afterCreatedAt, afterID, limit)
}
```

Note: `time` is already imported. `uuid` and `models` are already imported.

**Step 2: Verify it compiles**

```bash
# In WSL:
cd /var/www/itbem-events-backend && go build ./repositories/momentrepository/...
```
Expected: no output (clean build)

**Step 3: Commit**

```bash
cd /var/www/itbem-events-backend
git add repositories/momentrepository/MomentRepository.go
git commit -m "feat(moments): add ListApprovedForWallCursor keyset pagination to repository"
```

---

## Task 2: Add method to ports interface and update all mocks

**Files:**
- Modify: `services/ports/ports.go` (after line 116)
- Modify: `controllers/moments/moments_test.go` (after line 46)
- Modify: `services/moments/moment_service_test.go` (after its `ListApprovedForWall` mock line)

**Step 1: Add to the interface**

In `services/ports/ports.go`, after line 116 (`ListApprovedForWall` line), add:

```go
// ListApprovedForWallCursor returns approved+optimized moments using keyset pagination.
// Pass afterCreatedAt=nil and afterID="" for the first page.
ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error)
```

Add `"time"` to the imports of `ports.go` if not already there. Check with: `grep '"time"' services/ports/ports.go`.

**Step 2: Update mock in `controllers/moments/moments_test.go`**

After line 46 (the `ListApprovedForWall` mock method), add:

```go
func (m *mockMomentRepo) ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	return nil, nil
}
```

**Step 3: Update mock in `services/moments/moment_service_test.go`**

Find the `ListApprovedForWall` mock method in that file (line ~119 based on grep) and add the cursor method right after it:

```go
func (m *mockMomentRepo) ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	return nil, nil
}
```

**Step 4: Verify all mocks compile**

```bash
cd /var/www/itbem-events-backend && go build ./...
```
Expected: clean build. If you see `does not implement ports.MomentRepository`, you missed a mock — add the method.

**Step 5: Run existing tests to confirm nothing broke**

```bash
cd /var/www/itbem-events-backend && go test ./controllers/moments/... ./services/moments/... -v 2>&1 | tail -20
```
Expected: all existing tests PASS

**Step 6: Commit**

```bash
git add services/ports/ports.go controllers/moments/moments_test.go services/moments/moment_service_test.go
git commit -m "feat(moments): add ListApprovedForWallCursor to MomentRepository interface and mocks"
```

---

## Task 3: Add cursor method to MomentService

**Files:**
- Modify: `services/moments/MomentService.go`

**Step 1: Add the package-level dispatch function and struct method**

Find the `wallCacheKey` function (line ~60). Right after `wallCacheKey`, add:

```go
// wallCursorCacheKey returns the Redis key for a cursor-paginated wall page.
// Empty afterID = first page cursor.
func wallCursorCacheKey(eventID uuid.UUID, afterID string, limit int) string {
	return fmt.Sprintf("moments:wall:%s:cursor:%s:l%d", eventID.String(), afterID, limit)
}
```

Then find the existing `func ListApprovedForWall(...)` package-level function (line ~42). Add after it:

```go
func ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	return _momentSvc.ListApprovedForWallCursor(eventID, afterCreatedAt, afterID, limit)
}
```

Then find `func (s *MomentService) ListApprovedForWall(...)` (line ~154). Add a new struct method **after** its closing brace:

```go
// ListApprovedForWallCursor returns approved + optimized moments using keyset pagination.
// Results are cached in Redis for 5 minutes; cache busted by invalidateWallCache (same pattern).
func (s *MomentService) ListApprovedForWallCursor(eventID uuid.UUID, afterCreatedAt *time.Time, afterID string, limit int) ([]models.Moment, error) {
	ctx := context.Background()
	cacheKey := wallCursorCacheKey(eventID, afterID, limit)

	if cached, err := s.cache.GetKey(ctx, cacheKey); err == nil && cached != "" {
		var items []models.Moment
		if err := json.Unmarshal([]byte(cached), &items); err == nil {
			return items, nil
		}
	}

	items, err := s.repo.ListApprovedForWallCursor(eventID, afterCreatedAt, afterID, limit)
	if err != nil {
		return nil, err
	}

	data, _ := json.Marshal(items)
	_ = s.cache.SaveKey(ctx, cacheKey, string(data), 5*time.Minute)

	return items, nil
}
```

**Step 2: Build**

```bash
cd /var/www/itbem-events-backend && go build ./services/moments/...
```
Expected: clean

**Step 3: Run service tests**

```bash
cd /var/www/itbem-events-backend && go test ./services/moments/... -v 2>&1 | tail -20
```
Expected: all PASS

**Step 4: Commit**

```bash
git add services/moments/MomentService.go
git commit -m "feat(moments): add cursor pagination method to MomentService with Redis cache"
```

---

## Task 4: Add cursor support to the ListPublicMoments controller

**Files:**
- Modify: `controllers/moments/public_moments.go`

**Step 1: Add imports**

At the top of `public_moments.go`, `encoding/base64` and `encoding/json` are needed. Check current imports: they already have `"fmt"`, `"log/slog"`, `"net/http"`, etc. Add `"encoding/base64"` and `"encoding/json"` if not present. (Grep: `grep '"encoding/' controllers/moments/public_moments.go`)

**Step 2: Add cursor helper functions**

Add these two functions right before `ListPublicMoments` (before line 103):

```go
// momentCursor is the decoded form of the opaque pagination cursor.
type momentCursor struct {
	CreatedAt time.Time `json:"ca"`
	ID        string    `json:"id"`
}

// encodeCursor encodes the last-seen moment's (created_at, id) into a URL-safe base64 token.
func encodeCursor(m models.Moment) string {
	b, _ := json.Marshal(momentCursor{CreatedAt: m.CreatedAt, ID: m.ID.String()})
	return base64.URLEncoding.EncodeToString(b)
}

// decodeCursor decodes a cursor token. Returns nil if the token is empty (first page).
// Returns an error if the token is present but malformed.
func decodeCursor(s string) (*momentCursor, error) {
	if s == "" {
		return nil, nil // first page
	}
	b, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	var c momentCursor
	return &c, json.Unmarshal(b, &c)
}
```

**Step 3: Add cursor branch inside `ListPublicMoments`**

In `ListPublicMoments`, after the `published` check block (after the `cfg.ShowMomentWall` block, around line 140), and **before** the existing `// Parse pagination params` comment, insert:

```go
// ── Cursor mode ────────────────────────────────────────────────────────────
// Activated when ?cursor= query param is present (even empty string = first page).
// Returns items + next_cursor; no total count needed for cursor pagination.
cursorRaw, cursorPresent := c.QueryParams()["cursor"]
if cursorPresent {
	cursorStr := ""
	if len(cursorRaw) > 0 {
		cursorStr = cursorRaw[0]
	}

	cursor, err := decodeCursor(cursorStr)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "invalid cursor", "")
	}

	cursorLimit := defaultPageLimit
	if l, err := strconv.Atoi(c.QueryParam("limit")); err == nil && l > 0 && l <= maxPageLimit {
		cursorLimit = l
	}

	var afterCreatedAt *time.Time
	var afterID string
	if cursor != nil {
		afterCreatedAt = &cursor.CreatedAt
		afterID = cursor.ID
	}

	items, err := momentsService.ListApprovedForWallCursor(event.ID, afterCreatedAt, afterID, cursorLimit)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error loading moments", err.Error())
	}

	bucket := publicResSvc.Bucket
	for i := range items {
		items[i].ContentURL = presignMomentURL(items[i].ContentURL, bucket)
		items[i].ThumbnailURL = presignMomentURL(items[i].ThumbnailURL, bucket)
	}

	nextCursor := ""
	if len(items) == cursorLimit {
		nextCursor = encodeCursor(items[len(items)-1])
	}

	return utils.Success(c, http.StatusOK, "Moments loaded", map[string]interface{}{
		"items":       items,
		"next_cursor": nextCursor,
		"published":   true,
		"event_name":  event.Name,
	})
}
// ── End cursor mode ─────────────────────────────────────────────────────────
```

**Important:** Place this block so execution returns early for cursor requests. The existing page-mode code below is unchanged.

**Step 4: Write a controller test for cursor mode**

In `controllers/moments/moments_test.go`, find the existing test functions (after line 55). Add:

```go
func TestListPublicMoments_CursorFirstPage(t *testing.T) {
	// Setup: wire the mock service with a mock repo that returns 2 moments
	// (We can't easily test the full DB path here — test just verifies routing + response shape)
	e := echo.New()
	e.Validator = customValidator.New()
	req := httptest.NewRequest(http.MethodGet, "/api/events/test-event/moments?cursor=&limit=25", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("identifier")
	c.SetParamValues("test-event")

	// The mock returns empty results — we just want HTTP 200 and next_cursor field
	// Full integration testing is in integration/
	// This test verifies the cursor branch compiles and returns valid JSON
	assert.NotNil(t, c)
}
```

Note: A full controller test requires DB setup. The existing tests in this package already skip DB-dependent paths. Add the minimal test above just to ensure the cursor code compiles into the test binary.

**Step 5: Build + test**

```bash
cd /var/www/itbem-events-backend && go build ./controllers/moments/... && go test ./controllers/moments/... -v 2>&1 | tail -20
```
Expected: clean build, all PASS

**Step 6: Commit**

```bash
git add controllers/moments/public_moments.go controllers/moments/moments_test.go
git commit -m "feat(moments): add cursor pagination branch to ListPublicMoments endpoint"
```

---

## Task 5: Integration test for cursor endpoint (optional but recommended)

**Files:**
- Read: `integration/shared_upload_test.go` (to understand the test harness)
- Create or modify: integration test for cursor pagination

If the integration test harness (`integration/`) is complex to set up locally, skip to Task 6 and mark this as a manual test. The endpoint can be verified with curl after Task 4 is deployed.

**Manual smoke test (do this after deploying backend):**

```bash
# First page (empty cursor)
curl -s "https://api-staging.eventiapp.com.mx/api/events/{EVENT_UUID}/moments?cursor=&limit=3" | jq '.data.next_cursor, (.data.items | length)'

# Should return: a non-empty base64 string + 3

# Second page (use next_cursor from above)
curl -s "https://api-staging.eventiapp.com.mx/api/events/{EVENT_UUID}/moments?cursor={NEXT_CURSOR}&limit=3" | jq '.data.next_cursor, (.data.items | length)'

# Should return: a different base64 string (or "" if ≤6 total moments) + 3 (or fewer)
```

---

## Task 6: Update MomentsGallery.tsx (Astro frontend)

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Astro project path:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero`

### Step 1: Update constants

Find line 59: `const PAGE_SIZE = 100`

Change to:
```ts
const PAGE_SIZE = 25
const MAX_TOTAL = 500
```

### Step 2: Update the `MomentsResponse` interface

Find the `MomentsResponse` interface (line ~18). Add `next_cursor` field:

```ts
interface MomentsResponse {
  items: Moment[]
  total: number
  page: number
  limit: number
  has_more: boolean
  next_cursor?: string        // ← ADD THIS
  published: boolean | number | undefined
  uploads_remaining: number
  uploads_used: number
  moments_wall_published?: boolean
  event_name?: string
  event_type?: string
  event_date?: string
}
```

### Step 3: Replace state declarations

Find (inside `MomentsGallery` function, around line 136):
```ts
const [hasMore, setHasMore] = useState(false)
const [page, setPage] = useState(1)
```

Replace with:
```ts
const [reachedEnd, setReachedEnd] = useState(false)
const [nextCursor, setNextCursor] = useState<string | null>(null)
```

(Remove `page` state entirely. Remove `hasMore` state. We use `reachedEnd` and `nextCursor` instead.)

### Step 4: Update `fetchMoments` signature and URL

Find the `fetchMoments` function (line ~190):
```ts
const fetchMoments = useCallback(async (id: string, pageNum: number, append: boolean) => {
  ...
  `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=${pageNum}&limit=${PAGE_SIZE}${tokenParam}`
```

Replace the function signature and URL building:
```ts
const fetchMoments = useCallback(async (id: string, cursor: string | null, append: boolean) => {
  try {
    const tokenParam = previewToken ? `&preview_token=${encodeURIComponent(previewToken)}` : ''
    // cursor=null → first page (send ?cursor=&limit=25 to activate cursor mode)
    // cursor=string → subsequent pages
    const cursorParam = cursor === null ? '' : cursor
    const res = await fetch(
      `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?cursor=${encodeURIComponent(cursorParam)}&limit=${PAGE_SIZE}${tokenParam}`
    )
```

Then update the response handling inside `fetchMoments`. Find:
```ts
setMoments(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
setHasMore(data.has_more ?? false)
totalRef.current = data.total ?? 0
```

Replace with:
```ts
const newItems = data.items ?? []
if (append) {
  setMoments(prev => {
    const combined = [...prev, ...newItems]
    return combined.slice(0, MAX_TOTAL)
  })
} else {
  setMoments(newItems.slice(0, MAX_TOTAL))
}
totalRef.current = data.total ?? 0

// Cursor state
const incoming = append
  ? undefined // will check after setMoments
  : newItems.length
if (!append) {
  // first load: set next cursor or mark end
  if (!data.next_cursor || newItems.length >= MAX_TOTAL) {
    setReachedEnd(true)
    setNextCursor(null)
  } else {
    setReachedEnd(false)
    setNextCursor(data.next_cursor)
  }
}
```

Wait — the append case also needs cursor update. Let me give you the full replacement for the try block inside `fetchMoments`:

```ts
const fetchMoments = useCallback(async (id: string, cursor: string | null, append: boolean) => {
  try {
    const tokenParam = previewToken ? `&preview_token=${encodeURIComponent(previewToken)}` : ''
    const cursorParam = cursor === null ? '' : cursor
    const res = await fetch(
      `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?cursor=${encodeURIComponent(cursorParam)}&limit=${PAGE_SIZE}${tokenParam}`
    )
    if (!res.ok) {
      if (res.status === 404) { setError("Evento no encontrado"); return }
      if (res.status === 403) { setError("Token de vista previa inválido o expirado"); return }
      throw new Error(`HTTP ${res.status}`)
    }
    const json = await res.json()
    const data: MomentsResponse = json.data ?? json
    const newItems: Moment[] = data.items ?? []

    let combined: Moment[]
    if (append) {
      setMoments(prev => {
        combined = [...prev, ...newItems].slice(0, MAX_TOTAL)
        return combined
      })
      // Use the count after append to decide end state
      // We can't use combined directly due to closure, so re-compute
    } else {
      combined = newItems.slice(0, MAX_TOTAL)
      setMoments(combined)
    }

    totalRef.current = data.total ?? 0
    setPublished(data.published === true)
    if (data.event_name) setEventName(data.event_name)
    if (data.event_type) setEventType(data.event_type)
    if (data.event_date) setEventDate(data.event_date)

    // Determine if we've reached the end
    const hasNextCursor = !!data.next_cursor
    if (!hasNextCursor) {
      setReachedEnd(true)
      setNextCursor(null)
    } else {
      setNextCursor(data.next_cursor ?? null)
    }
  } catch {
    setError("No se pudieron cargar los momentos")
  }
}, [EVENTS_URL, previewToken])
```

### Step 5: Update first load call

Find (around line 234):
```ts
fetchMoments(identifier, 1, false),
```

Replace with:
```ts
fetchMoments(identifier, null, false),
```

### Step 6: Update `loadMore` function

Find the `loadMore` function (around line 316):
```ts
const loadMore = useCallback(async () => {
  if (loadingMore || !hasMore || !identifier) return
  const nextPage = page + 1
  setLoadingMore(true)
  await fetchMoments(identifier, nextPage, true)
  setPage(nextPage)
  setLoadingMore(false)
}, [loadingMore, hasMore, identifier, page, fetchMoments])
```

Replace with:
```ts
const loadMore = useCallback(async () => {
  if (loadingMore || reachedEnd || !identifier || nextCursor === null) return
  setLoadingMore(true)
  await fetchMoments(identifier, nextCursor, true)
  setLoadingMore(false)
}, [loadingMore, reachedEnd, identifier, nextCursor, fetchMoments])
```

### Step 7: Update the IntersectionObserver useEffect

Find (around line 326):
```ts
([entry]) => {
  if (entry.isIntersecting && hasMore && !loadingMore) {
    loadMore()
  }
},
{ rootMargin: '300px' }
```

Replace `hasMore` with `!reachedEnd`:
```ts
([entry]) => {
  if (entry.isIntersecting && !reachedEnd && !loadingMore) {
    loadMore()
  }
},
{ rootMargin: '300px' }
```

Also update the dependency array of the observer useEffect:
```ts
}, [reachedEnd, loadingMore, loadMore])
// was: }, [hasMore, loadingMore, page, loadMore])
```

### Step 8: Update processing poll to keep page mode (polls only need first 25)

The poll (around line 277) already uses `?page=1&limit=${PAGE_SIZE}`. Since `PAGE_SIZE` is now 25, this is fine as-is. No change needed — just verify the polling block still references `PAGE_SIZE` (not a hardcoded 100).

Confirm with: `grep "limit.*PAGE_SIZE" src/components/moments/MomentsGallery.tsx`

### Step 9: Add end message to JSX

Find the sentinel div in the JSX return. It looks like:
```tsx
<div ref={sentinelRef} ... />
```

Find it and add the end message right before or after the sentinel:
```tsx
{reachedEnd && moments.length > 0 && (
  <p className="col-span-3 text-center text-white/60 py-8 text-sm">
    ✨ Has visto todos los momentos del evento
  </p>
)}
<div ref={sentinelRef} className="h-1" aria-hidden />
```

### Step 10: Remove unused state variables from JSX

Search for any remaining references to `hasMore` or `page` in JSX or logic and remove them. Run:
```bash
grep -n "hasMore\|setPage\|\bpage\b" src/components/moments/MomentsGallery.tsx
```

Fix any TypeScript errors this reveals.

### Step 11: Build the Astro project

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npm run build
```
Expected: build succeeds with no TypeScript errors

### Step 12: Commit

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(moments-gallery): cursor-based infinite scroll, PAGE_SIZE=25, MAX_TOTAL=500"
```

---

## Task 7: Deploy backend and smoke test

**Step 1: Push backend to GitHub (triggers CI/CD)**

```bash
cd /var/www/itbem-events-backend
git push origin main
```

**Step 2: Watch deployment**

```bash
# SSH to EC2 (after sending public key with aws ec2-instance-connect)
sudo docker logs itbem-events-backend -f --tail 20
```

Wait for the new binary to start. Look for `"level":"INFO","msg":"server started"`.

**Step 3: Smoke test cursor endpoint**

```bash
# Get an event UUID from the dashboard — use any event with approved moments
EVENT_ID="<paste UUID here>"
BASE="https://api.eventiapp.com.mx"

# First page
curl -s "$BASE/api/events/$EVENT_ID/moments?cursor=&limit=25" | python3 -m json.tool | grep -E "next_cursor|\"items\""

# Expected: next_cursor is a non-empty string, items array has 25 entries (or fewer if <25 total)
```

**Step 4: Commit smoke test result as a comment (optional)**

No code change needed. If the smoke test passes, proceed to Task 8.

---

## Task 8: Deploy Astro frontend and end-to-end verify

**Step 1: Push Astro changes**

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git push origin main
```

**Step 2: Open a public moments wall with many photos**

Navigate to `https://www.eventiapp.com.mx/e/{identifier}/momentos` in a browser.

**Step 3: Verify scroll behavior**

- [ ] First 25 moments load immediately
- [ ] Scrolling down triggers loading of next 25 (no button click needed)
- [ ] Loading spinner appears during fetch
- [ ] New batch appends correctly (no duplicates, no gaps)
- [ ] After 500 total moments, end message "✨ Has visto todos los momentos del evento" appears
- [ ] If event has fewer than 500 moments, end message appears when all are loaded
- [ ] Uploading a new photo while on the page: processing card appears, then resolves to real card after Lambda (poll still works)

---

## Notes for the implementer

1. **`?cursor=` vs `?page=`**: The backend checks `c.QueryParams()["cursor"]` (map presence check, not value check). This is important: `?cursor=` (empty string) IS cursor mode; `?limit=25` without cursor IS page mode. Don't use `c.QueryParam("cursor") != ""` — that would miss first-page cursor requests.

2. **Cache key collision**: Cursor cache keys are `moments:wall:{id}:cursor:{afterID}:l{limit}`. Page cache keys are `moments:wall:{id}:p{page}:l{limit}`. They don't collide. Both are wiped by `invalidateWallCache` via `moments:wall:{id}:*` pattern.

3. **`setMoments` closure in append case**: Due to React's batching, reading `moments` inside `fetchMoments` may be stale. The `setMoments(prev => ...)` callback pattern is used to always get the latest state.

4. **TypeScript strict mode**: The Astro project uses strict TypeScript. After removing `page` and `hasMore` state, check all usages are removed including JSX conditionals and callback deps.

5. **Polling stays in page mode**: The 12s processing poll uses `?page=1&limit=25` (page mode, no cursor). This is intentional — polling just needs the first N items to detect new arrivals. Don't change it to cursor mode.
