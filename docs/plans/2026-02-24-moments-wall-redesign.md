# Moments Wall Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken moment images (S3 keys → presigned URLs in backend) and redesign the dashboard moments wall to be mobile-first with full-bleed cards and overlay approve/delete actions.

**Architecture:** Backend presigns `content_url` and `thumbnail_url` before returning from `ListMoments` (same pattern as `cover_controller.go`). Frontend gets the `thumbnail_url` field added to the TypeScript model, then `MomentCard` is rebuilt as a full-bleed image with an always-visible action bar on mobile and hover-reveal on desktop.

**Tech Stack:** Go/Echo (backend), Next.js 15, TypeScript, Tailwind CSS, Framer Motion, SWR, next/image

---

## Task 1: Backend — Presign URLs in ListMoments

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/moments.go`

**Context:**
- `content_url` in DB is a raw S3 key like `moments/{eventID}/raw/photo.jpg`
- `bucketrepository.GetPresignedFileURL(filename, folder, bucket, provider, minutes)` is the presign helper
- Config is injected via Echo middleware: `cfg, ok := c.Get("config").(*models.Config)`
- Provider constant: `constants.DefaultCloudProvider` = `"aws"`
- Pattern: split path by last `/` → `folder = strings.Join(parts[:n-1], "/")`, `filename = parts[n-1]`
- Same pattern already used in `controllers/clients/clients.go:117-129`

**Step 1: Add a presignMomentURLs helper at the bottom of moments.go**

Replace the current import block (add `"strings"`, `"events-stocks/configuration/constants"`, `"events-stocks/repositories/bucketrepository"`):

```go
import (
	"events-stocks/configuration/constants"
	"events-stocks/models"
	eventsService "events-stocks/services/events"
	momentsService "events-stocks/services/moments"
	"events-stocks/repositories/bucketrepository"
	"events-stocks/utils"
	"github.com/gofrs/uuid"
	"github.com/labstack/echo/v4"
	"net/http"
	"os"
	"strings"
)
```

Then add this helper at the bottom of the file (after all existing functions):

```go
// presignMomentURL converts a raw S3 key like "moments/id/raw/file.jpg"
// into a 12-hour presigned GET URL. Returns the original key unchanged on error.
func presignMomentURL(key, bucket string) string {
	if key == "" || strings.HasPrefix(key, "http") {
		return key // already a full URL (legacy rows) or empty
	}
	parts := strings.Split(key, "/")
	if len(parts) < 2 {
		return key
	}
	filename := parts[len(parts)-1]
	folder := strings.Join(parts[:len(parts)-1], "/")
	signed, err := bucketrepository.GetPresignedFileURL(filename, folder, bucket, constants.DefaultCloudProvider, 720)
	if err != nil {
		return key
	}
	return signed
}
```

**Step 2: Update ListMoments to presign after fetching**

Find the existing block:
```go
list, err := momentSvc.ListForDashboard(eventID)
if err != nil {
    return utils.Error(c, http.StatusInternalServerError, "Error loading moments", err.Error())
}
return utils.Success(c, http.StatusOK, "Moments loaded", list)
```

Replace with:
```go
list, err := momentSvc.ListForDashboard(eventID)
if err != nil {
    return utils.Error(c, http.StatusInternalServerError, "Error loading moments", err.Error())
}
cfg, ok := c.Get("config").(*models.Config)
if ok && cfg != nil {
    for i := range list {
        list[i].ContentURL = presignMomentURL(list[i].ContentURL, cfg.AwsBucketName)
        list[i].ThumbnailURL = presignMomentURL(list[i].ThumbnailURL, cfg.AwsBucketName)
    }
}
return utils.Success(c, http.StatusOK, "Moments loaded", list)
```

**Step 3: Build the backend**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```
Expected: zero errors.

**Step 4: Test manually (local backend running)**

```bash
# With backend running on :8080, call the moments endpoint with a valid event_id and auth token
# The content_url in the response should now start with "https://" not "moments/"
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/moments?event_id=<uuid>" | jq '.[0].content_url'
# Expected: "https://bucket.s3.amazonaws.com/moments/..."  or "https://...presigned..."
```

**Step 5: Commit backend**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add controllers/moments/moments.go
git commit -m "fix: presign content_url and thumbnail_url in ListMoments response"
```

---

## Task 2: Frontend — Add thumbnail_url to Moment model

**Files:**
- Modify: `src/models/Moment.ts`

**Step 1: Add the field**

Current file content:
```ts
export interface Moment extends BaseEntity {
  event_id: string
  invitation_id?: string | null
  content_url: string
  description?: string
  is_approved: boolean
  processing_status: ProcessingStatus
  order?: number
}
```

Add `thumbnail_url` after `content_url`:
```ts
export interface Moment extends BaseEntity {
  event_id: string
  invitation_id?: string | null
  content_url: string
  /** WebP thumbnail extracted by Lambda for videos. Empty for images. */
  thumbnail_url?: string
  description?: string
  is_approved: boolean
  processing_status: ProcessingStatus
  order?: number
}
```

**Step 2: TypeScript check**

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```
Expected: zero errors.

**Step 3: Commit**

```bash
git add src/models/Moment.ts
git commit -m "feat: add thumbnail_url to Moment model"
```

---

## Task 3: Frontend — Redesign MomentCard (full-bleed + overlay actions)

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — only the `MomentCard` component (lines ~400–559)

**Context:**
- The card currently has an image area + a footer div with description, date, and buttons
- New design: NO footer. The entire card is the image. Status badge top-left. Action bar at the absolute bottom as a glassmorphism overlay.
- Mobile: action bar always visible. Desktop: `opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all`
- For videos: use `thumbnail_url` as `<img>` poster if available; otherwise show dark placeholder with play icon
- Keep all existing state logic (`actioning`, `setActioning`) and handler props unchanged

**Step 1: Replace the MomentCard component**

Find the entire `MomentCard` function (from `function MomentCard(` to the closing `}` before `// ─── Main Wall`) and replace with:

```tsx
function MomentCard({ moment, onApprove, onDelete, onOpenLightbox, resolveUrl }: MomentCardProps) {
  const [actioning, setActioning] = useState<'approve' | 'delete' | null>(null)
  const url = resolveUrl(moment)
  const hasMedia = !!url
  const video = hasMedia && isVideo(url)
  const isProcessing = moment.processing_status === 'pending' || moment.processing_status === 'processing'
  const isFailed = moment.processing_status === 'failed'
  const approved = moment.is_approved

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-xl overflow-hidden bg-zinc-900 group aspect-square"
    >
      {/* ── Media area ─────────────────────────────────────── */}
      {isProcessing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 gap-3">
          <ArrowPathIcon className="size-8 text-indigo-400 animate-spin opacity-60" />
          <p className="text-xs text-zinc-500 text-center px-4">{processingLabel(moment.processing_status)}</p>
        </div>
      ) : isFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/40 gap-2 p-4">
          <ExclamationTriangleIcon className="size-8 text-rose-500 opacity-70" />
          <p className="text-xs text-rose-400 text-center">Error al procesar</p>
          <button
            onClick={async () => {
              try {
                await api.put(`/moments/${moment.id}/requeue`, {})
                toast.success('Reintentando…')
              } catch {
                toast.error('No se pudo reintentar.')
              }
            }}
            className="flex items-center gap-1 text-xs text-rose-300 hover:text-rose-100 underline underline-offset-2"
          >
            <ArrowPathIcon className="size-3" /> Reintentar
          </button>
        </div>
      ) : video ? (
        /* Video: show thumbnail if available, else dark bg with play icon */
        <div
          className="absolute inset-0 cursor-pointer"
          onClick={() => onOpenLightbox(moment)}
        >
          {moment.thumbnail_url ? (
            <img
              src={moment.thumbnail_url}
              alt="Video momento"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
              <div className="flex items-center justify-center size-14 rounded-full bg-black/50 ring-1 ring-white/20">
                <svg className="size-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </div>
            </div>
          )}
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="flex items-center justify-center size-12 rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/20 opacity-80 group-hover:opacity-100 transition-opacity">
              <svg className="size-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : hasMedia ? (
        <div
          className="absolute inset-0 cursor-pointer"
          onClick={() => onOpenLightbox(moment)}
        >
          <Image
            src={url}
            alt="Momento del evento"
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        </div>
      ) : moment.description ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800/80 to-zinc-900 p-5">
          <p className="text-sm text-zinc-300 text-center leading-relaxed italic line-clamp-6">
            &ldquo;{moment.description}&rdquo;
          </p>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50">
          <PhotoIcon className="size-10 text-zinc-600" />
        </div>
      )}

      {/* ── Status badge (top-left) ─────────────────────────── */}
      {!isProcessing && !isFailed && (
        <div className="absolute top-2 left-2 z-10">
          {approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/25 px-2 py-0.5 text-[10px] font-semibold text-lime-300 ring-1 ring-lime-500/30 backdrop-blur-sm">
              <CheckIcon className="size-2.5" /> Aprobado
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30 backdrop-blur-sm">
              Pendiente
            </span>
          )}
        </div>
      )}

      {/* ── Action bar (bottom overlay) ────────────────────────
           Always visible on mobile. Fade+slide in on desktop hover. */}
      {!isProcessing && (
        <div className={[
          'absolute bottom-0 left-0 right-0 z-10',
          'flex items-stretch',
          'bg-gradient-to-t from-black/80 via-black/50 to-transparent backdrop-blur-[2px]',
          'transition-all duration-200',
          // desktop: hidden until hover
          'sm:opacity-0 sm:translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0',
        ].join(' ')}>
          {!approved && !isFailed && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setActioning('approve')
                await onApprove(moment)
                setActioning(null)
              }}
              disabled={actioning !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-lime-300 hover:bg-lime-500/20 transition-colors disabled:opacity-40"
            >
              <CheckIcon className="size-3.5 shrink-0" />
              <span>{actioning === 'approve' ? '…' : 'Aprobar'}</span>
            </button>
          )}
          <button
            onClick={async (e) => {
              e.stopPropagation()
              setActioning('delete')
              await onDelete(moment)
              setActioning(null)
            }}
            disabled={actioning !== null}
            className={[
              'flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40',
              approved || isFailed ? 'flex-1' : 'px-4',
            ].join(' ')}
          >
            <XMarkIcon className="size-3.5 shrink-0" />
            {(approved || isFailed) && <span>{actioning === 'delete' ? '…' : 'Eliminar'}</span>}
          </button>
        </div>
      )}
    </motion.div>
  )
}
```

**Step 2: Tighten the grid gap** (find and update in the JSX grid div, around line 950)

Find:
```tsx
<motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4" layout>
```

Replace with:
```tsx
<motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
```

**Step 3: TypeScript check**

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```
Expected: zero errors.

**Step 4: Visual check in dev**

```bash
npm run dev
# Open http://localhost:3000, navigate to an event → Momentos tab
# Verify: images load (no broken img icon), cards fill full height, action bar visible on mobile, hover on desktop
```

**Step 5: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat: redesign MomentCard — full-bleed image, overlay actions, mobile-first"
```

---

## Task 4: Final build check + push

**Step 1: Full build**

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npm run build
```
Expected: no TypeScript errors, build succeeds.

**Step 2: Push dashboard**

```bash
git push
```

**Step 3: Push backend**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git push
```

---

## Verification Checklist

- [ ] `GET /api/moments?event_id=X` returns `content_url` starting with `https://` (presigned)
- [ ] Images load in the dashboard moments grid (no broken icons)
- [ ] Videos show thumbnail if Lambda has processed them, play icon overlay otherwise
- [ ] Status badge visible top-left (Pendiente / Aprobado)
- [ ] Action bar: on mobile always visible at bottom of card; on desktop appears on hover
- [ ] Approve button works (moment moves to Aprobado)
- [ ] Delete button works
- [ ] Tighter grid: cards fill the width cleanly on mobile (2 cols) and desktop (3-4 cols)
- [ ] `npm run build` passes with zero errors
