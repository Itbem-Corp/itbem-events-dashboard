# In-Flight Uploads Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dashboard section that shows newly-uploaded moments currently being processed by Lambda (pending/processing with raw S3 key), so admins can see uploads in progress and know when they fail.

**Architecture:** New backend endpoint `GET /moments/in-flight` returns moments with `processing_status IN ('pending','processing')` and `content_url LIKE '%/raw/%'` (first-time uploads, distinct from re-optimization). Dashboard polls every 5s, shows a collapsible card strip with spinners, toasts when count drops (upload finished), and re-uses the same visual pattern as the existing `ReoptimizingSection`.

**Tech Stack:** Go + Echo + GORM (backend) · Next.js 15 + SWR + Framer Motion + Tailwind (dashboard)

---

## Key distinctions

| Section | Query | Meaning |
|---------|-------|---------|
| `ReoptimizingSection` | `pending/processing` + `content_url NOT LIKE '%/raw/%'` | Already optimized once, being re-run |
| **New `InFlightSection`** | `pending/processing` + `content_url LIKE '%/raw/%'` | Brand-new upload, never processed |

There is no overlap — every pending moment falls into exactly one bucket.

---

## Task 1: Backend — `ListInFlight` repository method

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/repositories/momentrepository/MomentRepository.go` (after `ListReoptimizing`, ~line 136)

**Step 1: Add the function**

Add immediately after `ListReoptimizing` / its method wrapper:

```go
// ListInFlight returns newly-uploaded moments currently queued for first-time Lambda
// processing (processing_status IN ('pending','processing') with a raw S3 key).
// Distinct from ListReoptimizing which covers already-optimized files being re-run.
func ListInFlight(eventID uuid.UUID) ([]models.Moment, error) {
	var list []models.Moment
	err := configuration.DB.
		Where("event_id = ?", eventID).
		Where("processing_status IN ?", []string{"pending", "processing"}).
		Where("content_url LIKE ?", "%/raw/%").
		Order("created_at DESC").
		Find(&list).Error
	return list, err
}

func (r *MomentRepo) ListInFlight(eventID uuid.UUID) ([]models.Moment, error) {
	return ListInFlight(eventID)
}
```

**Step 2: Add to ports interface**

File: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/ports/ports.go`

After the `ListReoptimizing` entry (~line 112):

```go
// ListInFlight returns pending/processing moments that are brand-new uploads (raw S3 key).
ListInFlight(eventID uuid.UUID) ([]models.Moment, error)
```

**Step 3: Verify it compiles**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Expected: no output (success).

**Step 4: Commit**

```bash
git add repositories/momentrepository/MomentRepository.go services/ports/ports.go
git commit -m "feat(moments): add ListInFlight repo method — new uploads pending processing"
```

---

## Task 2: Backend — service method + controller handler + route

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/moments/MomentService.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/moments.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Service method**

In `MomentService.go`, add after `GetReoptimizing` (~line 140):

```go
// GetInFlight returns newly-uploaded moments currently queued for first-time Lambda processing.
func (s *MomentService) GetInFlight(eventID uuid.UUID) ([]models.Moment, error) {
	return s.repo.ListInFlight(eventID)
}

func GetInFlight(eventID uuid.UUID) ([]models.Moment, error) {
	return _momentSvc.GetInFlight(eventID)
}
```

**Step 2: Controller handler**

In `moments.go`, add after `GetReoptimizingMoments` (~line 395):

```go
// GET /moments/in-flight?event_id=<uuid>
// Returns newly-uploaded moments currently being processed by Lambda for the first time.
// These have a raw S3 key (content_url contains /raw/) and processing_status pending/processing.
func GetInFlightMoments(c echo.Context) error {
	eventIDStr := c.QueryParam("event_id")
	if eventIDStr == "" {
		return utils.Error(c, http.StatusBadRequest, "event_id required", "")
	}
	eventID, err := uuid.FromString(eventIDStr)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event_id", err.Error())
	}
	list, err := momentSvc.GetInFlight(eventID)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error loading in-flight moments", err.Error())
	}
	cfg, ok := c.Get("config").(*models.Config)
	if ok && cfg != nil {
		for i := range list {
			list[i].ContentURL = presignMomentURL(list[i].ContentURL, cfg.AwsBucketName)
			list[i].ThumbnailURL = presignMomentURL(list[i].ThumbnailURL, cfg.AwsBucketName)
		}
	}
	return utils.Success(c, http.StatusOK, "In-flight moments loaded", list)
}
```

**Step 3: Register route**

In `routes/routes.go`, add after the `reoptimizing` route (~line 242):

```go
protected.GET("/moments/in-flight", moments.GetInFlightMoments)    // new uploads being processed
```

**Step 4: Build check**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Expected: no output.

**Step 5: Smoke test with curl**

```bash
# Replace TOKEN and EVENT_ID with real values
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:8080/api/moments/in-flight?event_id=EVENT_ID"
# Expected: { "data": [...] }
```

**Step 6: Commit**

```bash
git add services/moments/MomentService.go controllers/moments/moments.go routes/routes.go
git commit -m "feat(moments): GET /moments/in-flight endpoint — new uploads in progress"
```

---

## Task 3: Dashboard — `InFlightSection` component + SWR + toast

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\moments-wall.tsx`

**Context — existing pattern to mirror:**
- `ReoptimizingSection` lives around line 652–720
- Its SWR hook is at line 1355–1372 (polls every 5s, toasts on count drop)
- It's rendered at line 2507–2515 inside `<AnimatePresence>`

**Step 1: Add `InFlightSection` component**

Add the component right after `ReoptimizingSection` ends (~line 720), before `// ─── FailedSection`:

```tsx
// ─── InFlightSection ────────────────────────────────────────────────────────
// Shows brand-new uploads currently being processed by Lambda for the first time.
// Distinct from ReoptimizingSection (which covers already-optimized files being re-run).

interface InFlightSectionProps {
  moments: Moment[]
}

function InFlightSection({ moments }: InFlightSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (moments.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <ArrowUpTrayIcon className="size-3.5 text-sky-400 shrink-0" />
        <span className="text-xs font-medium text-sky-300 flex-1">
          Optimizando nuevos archivos ({moments.length})
        </span>
        <ArrowPathIcon className="size-3 text-sky-400/60 animate-spin shrink-0" />
        <span className="text-[10px] text-sky-400/60 ml-1">
          {collapsed ? 'mostrar' : 'ocultar'}
        </span>
      </button>

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
                const isVid = m.content_type?.startsWith('video/')
                return (
                  <div key={m.id} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800">
                    {/* File type indicator */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isVid
                        ? <VideoCameraIcon className="size-6 text-zinc-600" />
                        : <PhotoIcon className="size-6 text-zinc-600" />
                      }
                    </div>
                    {/* Spinner overlay */}
                    <div className="absolute inset-0 bg-zinc-900/40 flex items-center justify-center">
                      <ArrowPathIcon className="size-5 text-sky-400 animate-spin" />
                    </div>
                    {/* Status badge */}
                    <div className="absolute bottom-1 inset-x-1">
                      <span className="block w-full text-center text-[9px] text-sky-300/80 bg-zinc-900/70 rounded px-1 py-0.5 truncate">
                        {m.processing_status === 'processing' ? 'Procesando…' : 'En cola'}
                      </span>
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

**Step 2: Import `ArrowUpTrayIcon` and `PhotoIcon` and `VideoCameraIcon`**

Find the heroicons import block near the top of the file (search for `ArrowPathIcon`) and add the missing icons to the same import:

```tsx
import {
  // ... existing icons ...
  ArrowUpTrayIcon,
  PhotoIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
```

(They may already be imported — check first. If so, skip.)

**Step 3: Add SWR hook + toast effect**

Find the existing `reoptimizingSwrKey` block (~line 1355) and add immediately after it:

```tsx
// ─── In-flight new uploads (separate 5s hook) ─────────────────────────────
const inFlightSwrKey = eventId ? `/moments/in-flight?event_id=${eventId}` : null
const { data: inFlightMoments = [] } = useSWR<Moment[]>(inFlightSwrKey, fetcher, {
  revalidateOnFocus: false,
  refreshInterval: isTabVisible ? 5_000 : 0,
})

// Toast when Lambda finishes a new upload
const prevInFlightCount = useRef(0)
useEffect(() => {
  const curr = inFlightMoments.length
  const prev = prevInFlightCount.current
  if (prev > 0 && curr < prev) {
    const finished = prev - curr
    toast.success(`${finished} archivo${finished !== 1 ? 's' : ''} optimizado${finished !== 1 ? 's' : ''} — listo para aprobar`)
  }
  prevInFlightCount.current = curr
}, [inFlightMoments.length])
```

**Step 4: Render the section**

Find the `{/* ── Re-optimization in-flight section */}` block (~line 2507) and add `InFlightSection` just before it:

```tsx
{/* ── New uploads being optimized ───────────────────────────────── */}
<AnimatePresence>
  {inFlightMoments.length > 0 && (
    <InFlightSection moments={inFlightMoments} />
  )}
</AnimatePresence>

{/* ── Re-optimization in-flight section ────────────────────────── */}
<AnimatePresence>
  {reoptimizingMoments.length > 0 && (
    <ReoptimizingSection ... />
  )}
</AnimatePresence>
```

**Step 5: TypeScript check**

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npx tsc --noEmit
```
Expected: 0 errors.

**Step 6: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(dashboard): InFlightSection — show new uploads being processed by Lambda"
```

---

## Task 4: Update docs

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\api.md`

**Step 1: Add the new endpoint to the Moments section**

Find the moments endpoint block and add:

```markdown
### `GET /moments/in-flight?event_id=<uuid>`
Returns moments with `processing_status IN ('pending','processing')` and a raw S3 key — brand-new uploads being processed by Lambda for the first time. Used by `InFlightSection` in `moments-wall.tsx` (polls every 5s).
Response: `Moment[]` (unwrapped by fetcher).
```

**Step 2: Commit**

```bash
git add docs/api.md
git commit -m "docs: document GET /moments/in-flight endpoint"
```

---

## Deployment checklist

1. Deploy backend first (new route must exist before dashboard polls it)
2. Deploy dashboard (Vercel auto-deploys on push to main)
3. Verify in browser: upload a photo → InFlightSection appears immediately → spinner → toast when done → card appears in main grid
