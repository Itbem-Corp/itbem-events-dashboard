# Re-optimization Processing View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show moments being re-optimized by Lambda in a collapsible "Procesando" section above the main grid, and toast the admin when they finish.

**Architecture:** New `GET /moments/reoptimizing?event_id=X` backend endpoint returns in-flight re-optimization moments (pending/processing with an `/opt/` content URL). Dashboard adds a second SWR hook at 5s and renders a `ReoptimizingSection` component with the existing image behind a spinner overlay. A `useRef` diff-detects when moments finish and fires a toast.

**Tech Stack:** Go + Echo + GORM · Next.js 15 · SWR · Tailwind · Motion · Heroicons

---

## Context

Backend lives at `/var/www/itbem-events-backend` (WSL Ubuntu).
Dashboard lives at `C:\Users\AndBe\Desktop\Projects\dashboard-ts`.

**Key patterns to follow:**
- Repository: package-level function + `MomentRepo` receiver method (see `ListForDashboard` pattern)
- Service: `(s *MomentService)` method + package-level wrapper (see `ListForDashboard` at line 128)
- Controller: parse `event_id` query param → call service → presign URLs → `utils.Success`
- Route: new `protected.GET` **before** `protected.GET("/moments/:id", ...)` (line 243 of `routes.go`)
- Tests: `wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./... 2>&1"`
- Dashboard tests: `npm run test:unit`

**Both test mocks** (service test + controller test) use a fixed `mockMomentRepo` struct and require every interface method. Adding `ListReoptimizing` to the interface means adding it to both mocks.

---

### Task 1 — Repository: `ListReoptimizing`

**Files:**
- Modify: `/var/www/itbem-events-backend/repositories/momentrepository/MomentRepository.go`

**Step 1: Write the failing test**

There is no separate repo test file; the repo is tested through service tests. Skip to implementation.

**Step 2: Add the package-level function and receiver method**

In `MomentRepository.go`, after the closing `}` of `ListForDashboard` (around line 116), add:

```go
// ListReoptimizing returns moments currently being re-optimized by Lambda.
// Only returns moments whose content_url is already an optimized path (not /raw/),
// ensuring the dashboard can display the existing image while Lambda works.
func ListReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	var list []models.Moment
	err := configuration.DB.
		Where("event_id = ?", eventID).
		Where("processing_status IN ?", []string{"pending", "processing"}).
		Where("content_url NOT LIKE ?", "%/raw/%").
		Order("created_at DESC").
		Find(&list).Error
	return list, err
}

func (r *MomentRepo) ListReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	return ListReoptimizing(eventID)
}
```

**Step 3: Build to verify**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```
Expected: no output (clean build). This will fail with "does not implement" until Task 2 adds the interface method.

**Step 4: Commit**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && git add repositories/momentrepository/MomentRepository.go && git commit -m 'feat(moments): add ListReoptimizing repo method'"
```

---

### Task 2 — Ports interface + both mocks

**Files:**
- Modify: `/var/www/itbem-events-backend/services/ports/ports.go`
- Modify: `/var/www/itbem-events-backend/services/moments/moment_service_test.go`
- Modify: `/var/www/itbem-events-backend/controllers/moments/moments_test.go`

**Step 1: Add method to `MomentRepository` interface**

In `ports.go`, inside the `MomentRepository` interface (after `ListForDashboard`), add:

```go
// ListReoptimizing returns pending/processing moments with an already-optimized content_url.
ListReoptimizing(eventID uuid.UUID) ([]models.Moment, error)
```

**Step 2: Add method to `mockMomentRepo` in service test**

In `moment_service_test.go`, the `mockMomentRepo` struct has a `ListReoptimizingFunc` field and a method:

```go
// In the struct (after existing Func fields):
ListReoptimizingFunc func(eventID uuid.UUID) ([]models.Moment, error)

// New receiver method (after existing receivers):
func (m *mockMomentRepo) ListReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	if m.ListReoptimizingFunc != nil {
		return m.ListReoptimizingFunc(eventID)
	}
	return nil, nil
}
```

**Step 3: Add method to fixed mock in controller test**

In `moments_test.go`, the `mockMomentRepo` is a fixed struct (no func fields). Add:

```go
func (m *mockMomentRepo) ListReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	return nil, nil
}
```

**Step 4: Build and test**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... && go test ./... 2>&1"
```
Expected: all existing tests pass.

**Step 5: Commit**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && git add services/ports/ports.go services/moments/moment_service_test.go controllers/moments/moments_test.go && git commit -m 'feat(moments): add ListReoptimizing to interface and mocks'"
```

---

### Task 3 — Service: `GetReoptimizing` + test

**Files:**
- Modify: `/var/www/itbem-events-backend/services/moments/MomentService.go`
- Modify: `/var/www/itbem-events-backend/services/moments/moment_service_test.go`

**Step 1: Write the failing test**

In `moment_service_test.go`, add after the `BatchReoptimize` tests:

```go
// ---------------------------------------------------------------------------
// GetReoptimizing
// ---------------------------------------------------------------------------

func TestGetReoptimizing_ReturnsFromRepo(t *testing.T) {
	eventID := uuid.Must(uuid.NewV4())
	expected := []models.Moment{
		{ID: uuid.Must(uuid.NewV4()), EventID: &eventID, ProcessingStatus: "pending", ContentURL: "moments/e/opt/file.jpg"},
		{ID: uuid.Must(uuid.NewV4()), EventID: &eventID, ProcessingStatus: "processing", ContentURL: "moments/e/opt/vid.mp4"},
	}
	repo := &mockMomentRepo{
		ListReoptimizingFunc: func(id uuid.UUID) ([]models.Moment, error) {
			assert.Equal(t, eventID, id)
			return expected, nil
		},
	}
	svc := NewMomentService(repo, &mockCacheRepo{})
	result, err := svc.GetReoptimizing(eventID)

	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestGetReoptimizing_PropagatesRepoError(t *testing.T) {
	repo := &mockMomentRepo{
		ListReoptimizingFunc: func(id uuid.UUID) ([]models.Moment, error) {
			return nil, errors.New("db error")
		},
	}
	svc := NewMomentService(repo, &mockCacheRepo{})
	_, err := svc.GetReoptimizing(uuid.Must(uuid.NewV4()))

	assert.EqualError(t, err, "db error")
}
```

**Step 2: Run tests to verify they fail**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./services/moments/... -run TestGetReoptimizing -v 2>&1"
```
Expected: FAIL with "svc.GetReoptimizing undefined"

**Step 3: Add `GetReoptimizing` to `MomentService`**

In `MomentService.go`, after `ListForDashboard` method (around line 129), add:

```go
// GetReoptimizing returns moments currently queued for re-optimization (pending/processing,
// already-optimized content_url). Used by the dashboard to show an in-flight section.
func (s *MomentService) GetReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	return s.repo.ListReoptimizing(eventID)
}

func GetReoptimizing(eventID uuid.UUID) ([]models.Moment, error) {
	return _momentSvc.GetReoptimizing(eventID)
}
```

**Step 4: Run tests to verify they pass**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./services/moments/... -run TestGetReoptimizing -v 2>&1"
```
Expected: PASS (both tests)

**Step 5: Run full suite**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./... 2>&1"
```
Expected: all pass.

**Step 6: Commit**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && git add services/moments/MomentService.go services/moments/moment_service_test.go && git commit -m 'feat(moments): add GetReoptimizing service method + tests'"
```

---

### Task 4 — Controller: `GetReoptimizingMoments` handler + test

**Files:**
- Modify: `/var/www/itbem-events-backend/controllers/moments/moments.go`
- Modify: `/var/www/itbem-events-backend/controllers/moments/moments_test.go`

**Step 1: Write the failing test**

In `moments_test.go`, add after the `BatchReoptimize` tests:

```go
func TestGetReoptimizingMoments_MissingEventID(t *testing.T) {
	c, rec := newEchoCtx("GET", "/moments/reoptimizing", "")
	err := GetReoptimizingMoments(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetReoptimizingMoments_InvalidEventID(t *testing.T) {
	c, rec := newEchoCtx("GET", "/moments/reoptimizing?event_id=not-a-uuid", "")
	err := GetReoptimizingMoments(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
```

**Step 2: Run tests to verify they fail**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./controllers/moments/... -run TestGetReoptimizing -v 2>&1"
```
Expected: FAIL with "undefined: GetReoptimizingMoments"

**Step 3: Add handler to `moments.go`**

After the `ListMoments` handler (around line 62), add:

```go
// GET /moments/reoptimizing?event_id=<uuid>
// Returns moments currently being re-optimized (pending/processing with an already-optimized content_url).
// Used by the dashboard to show an in-flight processing section.
func GetReoptimizingMoments(c echo.Context) error {
	eventIDStr := c.QueryParam("event_id")
	if eventIDStr == "" {
		return utils.Error(c, http.StatusBadRequest, "event_id required", "")
	}
	eventID, err := uuid.FromString(eventIDStr)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event_id", err.Error())
	}
	list, err := momentSvc.GetReoptimizing(eventID)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error loading reoptimizing moments", err.Error())
	}
	cfg, ok := c.Get("config").(*models.Config)
	if ok && cfg != nil {
		for i := range list {
			list[i].ContentURL = presignMomentURL(list[i].ContentURL, cfg.AwsBucketName)
			list[i].ThumbnailURL = presignMomentURL(list[i].ThumbnailURL, cfg.AwsBucketName)
		}
	}
	return utils.Success(c, http.StatusOK, "Reoptimizing moments loaded", list)
}
```

**Step 4: Run tests to verify they pass**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./controllers/moments/... -run TestGetReoptimizing -v 2>&1"
```
Expected: PASS

**Step 5: Run full suite**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./... 2>&1"
```
Expected: all pass.

**Step 6: Commit**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && git add controllers/moments/moments.go controllers/moments/moments_test.go && git commit -m 'feat(moments): add GetReoptimizingMoments controller + tests'"
```

---

### Task 5 — Route registration

**Files:**
- Modify: `/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Register the route**

In `routes.go`, add the new route **before** `protected.GET("/moments/:id", ...)` (currently line 243). It must come before any `/:id` route to avoid Echo treating "reoptimizing" as an ID param.

Find this block:
```go
protected.GET("/moments/summary", moments.SummaryMoments)              // batch pending counts — must be before /:id
protected.PATCH("/moments/reorder", moments.ReorderMoments)            // bulk order — must be before /:id
protected.POST("/moments/batch/reoptimize", moments.BatchReoptimizeMoments) // must be before /:id routes
protected.POST("/moments/bulk-approve", moments.BulkApproveRejectMoments) // must be before /:id
protected.GET("/moments/:id", moments.GetMoment)
```

Add after `BatchReoptimizeMoments`:
```go
protected.GET("/moments/reoptimizing", moments.GetReoptimizingMoments) // in-flight re-optimization — must be before /:id
```

**Step 2: Build and run full suite**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... && go test ./... 2>&1"
```
Expected: all pass.

**Step 3: Commit**

```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && git add routes/routes.go && git commit -m 'feat(moments): register GET /moments/reoptimizing route'"
```

---

### Task 6 — Dashboard: SWR hook + ReoptimizingSection + toast

**Files:**
- Modify: `src/components/events/moments-wall.tsx`

This task has three sub-parts, all in one file. Do them in order.

#### Sub-part A: Second SWR hook + toast detection

In `MomentsWall`, directly after the existing SWR hook (after line 1111):

```tsx
// ─── In-flight re-optimization (separate 5s hook) ────────────────────────
const reoptimizingSwrKey = eventId ? `/moments/reoptimizing?event_id=${eventId}` : null
const { data: reoptimizingMoments = [] } = useSWR<Moment[]>(reoptimizingSwrKey, fetcher, {
  revalidateOnFocus: false,
  refreshInterval: isTabVisible ? 5_000 : 0,
})

// Toast when Lambda finishes — fires when count drops
const prevReoptimizingCount = useRef(0)
useEffect(() => {
  const curr = reoptimizingMoments.length
  const prev = prevReoptimizingCount.current
  if (prev > 0 && curr < prev) {
    const finished = prev - curr
    toast.success(`${finished} archivo${finished !== 1 ? 's' : ''} reoptimizado${finished !== 1 ? 's' : ''}`)
  }
  prevReoptimizingCount.current = curr
}, [reoptimizingMoments.length])
```

#### Sub-part B: `ReoptimizingSection` component

Add this **outside** `MomentsWall`, before it (around line 640 — near `ProcessingBadge`):

```tsx
// ─── Reoptimizing section ─────────────────────────────────────────────────

interface ReoptimizingSectionProps {
  moments: Moment[]
  resolveUrl: (m: Moment) => string
}

function ReoptimizingSection({ moments, resolveUrl }: ReoptimizingSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (moments.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <ArrowPathIcon className="size-3.5 text-indigo-400 animate-spin shrink-0" />
        <span className="text-xs font-medium text-indigo-300 flex-1">
          Procesando ({moments.length})
        </span>
        <span className="text-[10px] text-indigo-400/60">
          {collapsed ? 'mostrar' : 'ocultar'}
        </span>
      </button>

      {/* Cards */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 px-4 pb-4">
              {moments.map((m) => {
                const url = resolveUrl(m)
                const video = url && isVideo(url)
                const thumb = video ? m.thumbnail_url : url
                return (
                  <div key={m.id} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800">
                    {thumb && (
                      <Image
                        src={thumb}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                        unoptimized
                      />
                    )}
                    {/* Spinner overlay */}
                    <div className="absolute inset-0 bg-zinc-900/60 flex items-center justify-center">
                      <ArrowPathIcon className="size-5 text-indigo-400 animate-spin" />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

#### Sub-part C: Place the section in JSX

In the `MomentsWall` return JSX, find the grid comment (around line 2247):
```tsx
{/* ── Grid ───────────────────────────────────────────────────────── */}
<div role="tabpanel" id={`tab-panel-${filter}`}>
```

**Before** that comment, add:
```tsx
{/* ── Re-optimization in-flight section ────────────────────────── */}
<AnimatePresence>
  {reoptimizingMoments.length > 0 && (
    <ReoptimizingSection
      moments={reoptimizingMoments}
      resolveUrl={resolveUrl}
    />
  )}
</AnimatePresence>
```

#### Verify TypeScript

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && npx tsc --noEmit 2>&1
```
Expected: no errors.

#### Run unit tests

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && npm run test:unit 2>&1
```
Expected: all pass.

**Commit:**

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && git add src/components/events/moments-wall.tsx && git commit -m "feat(moments-wall): reoptimizing section + completion toast"
```

---

### Task 7 — Update docs/api.md

**Files:**
- Modify: `docs/api.md`

Find the `POST /moments/batch/reoptimize` entry and add directly after it:

```markdown
### GET /moments/reoptimizing

Returns moments currently queued for re-optimization (processing_status `pending` or `processing`, content_url already an optimized path). Used by the dashboard to show an in-flight section.

**Query params:** `event_id` (UUID, required)

**Response 200:**
```json
{ "data": [ ...Moment[] ] }
```

**Notes:** Only returns moments whose `content_url` does not contain `/raw/` — i.e., already-processed files being re-optimized, not fresh uploads.
```

**Commit:**

```bash
cd "C:\Users\AndBe\Desktop\Projects\dashboard-ts" && git add docs/api.md && git commit -m "docs: document GET /moments/reoptimizing endpoint"
```

---

## Verification Checklist

- [ ] `wsl -e bash -c "cd /var/www/itbem-events-backend && go test ./... 2>&1"` — all pass
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run test:unit` — all pass
- [ ] `npm run build` — succeeds
- [ ] In the browser: click "Reoptimizar (N)" → moments vanish from main grid → "Procesando (N)" section appears above grid with spinner cards
- [ ] After Lambda processes → section disappears → toast fires → moments appear back in main grid
