# Video Thumbnails + General Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real first-frame video previews instead of grey placeholders, plus a batch of UX, performance, and accessibility improvements across both the dashboard and the public frontend.

**Architecture:** All 15 tasks are independent — no task depends on another. Tasks 1–5 create a `useVideoThumbnail` hook and wire it into three components. Tasks 6–11 improve the dashboard `moments-wall.tsx`. Tasks 12–15 improve the public frontend. Each task commits independently.

**Tech Stack:** React 18, TypeScript, Next.js 15 (dashboard), Astro 5 (public), Vitest + RTL (dashboard tests), Tailwind CSS, SWR, canvas Web API, clsx

---

## Task 1: `useVideoThumbnail` hook — dashboard

Creates the hook that extracts a video's first frame as a blob URL via canvas.

**Files:**
- Create: `dashboard-ts/src/hooks/useVideoThumbnail.ts`
- Create (test): `dashboard-ts/tests/unit/hooks/useVideoThumbnail.test.ts`

### Step 1: Write the failing test

Create `tests/unit/hooks/useVideoThumbnail.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'

describe('useVideoThumbnail', () => {
  it('returns null when videoUrl is null', () => {
    const { result } = renderHook(() => useVideoThumbnail(null))
    expect(result.current).toBeNull()
  })

  it('returns null initially when videoUrl is provided (async extraction)', () => {
    const { result } = renderHook(() => useVideoThumbnail('https://example.com/video.mp4'))
    // Hook starts null — blob URL arrives asynchronously after canvas extraction
    expect(result.current).toBeNull()
  })
})
```

### Step 2: Run to verify it fails

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npm run test:unit -- --run tests/unit/hooks/useVideoThumbnail.test.ts
```

Expected: **FAIL** — `Cannot find module '@/hooks/useVideoThumbnail'`

### Step 3: Implement the hook

Create `src/hooks/useVideoThumbnail.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * Extracts the first frame of a video as a blob URL via canvas.
 * Returns null while extracting or if extraction fails (caller shows fallback).
 * Automatically revokes the blob URL on unmount.
 *
 * Only call this when `thumbnail_url` is absent — it creates a network request
 * to load video metadata (~50-200 KB).
 */
export function useVideoThumbnail(videoUrl: string | null): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!videoUrl) return

    let cancelled = false
    let blobUrl: string | null = null

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.crossOrigin = 'anonymous'
    video.playsInline = true

    video.onloadedmetadata = () => {
      if (cancelled) return
      // Seek slightly past 0 to avoid black frames on some codecs
      video.currentTime = 0.1
    }

    video.onseeked = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (cancelled || !blob) return
          blobUrl = URL.createObjectURL(blob)
          setThumbnailUrl(blobUrl)
        },
        'image/jpeg',
        0.8
      )
    }

    // Graceful fallback — onerror leaves state as null → caller shows play icon
    video.onerror = () => { /* intentionally empty */ }

    video.src = videoUrl

    return () => {
      cancelled = true
      video.src = ''
      video.load() // abort any pending network request
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [videoUrl])

  return thumbnailUrl
}
```

### Step 4: Run tests to verify they pass

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npm run test:unit -- --run tests/unit/hooks/useVideoThumbnail.test.ts
```

Expected: **PASS** — 2 tests pass

### Step 5: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 6: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/hooks/useVideoThumbnail.ts tests/unit/hooks/useVideoThumbnail.test.ts
git commit -m "feat(hooks): useVideoThumbnail — canvas frame extraction from video URL"
```

---

## Task 2: `useVideoThumbnail` hook — public frontend

Identical hook for the public project (same logic, separate file per project architecture).

**Files:**
- Create: `cafetton-casero/src/hooks/useVideoThumbnail.ts`

### Step 1: Create the file

The file is identical to the dashboard hook. Copy the implementation from Task 1 exactly:

Create `cafetton-casero/src/hooks/useVideoThumbnail.ts` with the same content as Task 1's `useVideoThumbnail.ts`.

### Step 2: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 3: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/hooks/useVideoThumbnail.ts
git commit -m "feat(hooks): useVideoThumbnail — canvas frame extraction from video URL"
```

---

## Task 3: Wire `useVideoThumbnail` into dashboard `MomentCard`

Replace the grey play icon fallback with a real frame preview.

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Read the file

Read `dashboard-ts/src/components/events/moments-wall.tsx`. Find `function MomentCard` (around line 470). The current fallback for videos without `thumbnail_url` is:

```tsx
) : (
  <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
    <div className="flex items-center justify-center size-14 rounded-full bg-black/50 ring-1 ring-white/20">
      <svg className="size-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.14v14l11-7-11-7z" />
      </svg>
    </div>
  </div>
)}
```

### Step 2: Add the import

At the top of the file, add the hook import after the existing hook imports:

```ts
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'
```

### Step 3: Use the hook in MomentCard

Inside `MomentCard`, after the existing variable declarations (`url`, `video`, `isProcessing`, etc.), add:

```ts
// Extract first frame for legacy videos without a server-generated thumbnail
const extractedThumb = useVideoThumbnail(
  video && !moment.thumbnail_url ? url : null
)
```

Then replace the grey div fallback with:

```tsx
) : (
  // No server thumbnail — show extracted frame if ready, otherwise play icon
  extractedThumb ? (
    <img
      src={extractedThumb}
      alt="Video momento"
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
      <div className="flex items-center justify-center size-14 rounded-full bg-black/50 ring-1 ring-white/20">
        <svg className="size-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.14v14l11-7-11-7z" />
        </svg>
      </div>
    </div>
  )
)}
```

> **Important:** The play icon overlay that's already rendered on top of the entire video area (the `absolute inset-0 flex items-center justify-center` div) remains unchanged — it overlays both the thumbnail image AND the extracted frame.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments): video first-frame thumbnail in MomentCard via canvas extraction"
```

---

## Task 4: Wire `useVideoThumbnail` into public `MomentWall`

**Files:**
- Modify: `cafetton-casero/src/components/sections/MomentWall.tsx`

### Step 1: Read the file

Read `cafetton-casero/src/components/sections/MomentWall.tsx`. Find the video card rendering in the moments grid (around line 293). Current state:

```tsx
{video ? (
  <>
    {m.thumbnail_url ? (
      <img
        src={getMediaUrl(m.thumbnail_url, EVENTS_URL)}
        ...
      />
    ) : (
      /* Fallback for legacy videos without a thumbnail */
      <div className="aspect-video bg-gray-900 w-full group-hover:brightness-110 transition-[filter] duration-300" />
    )}
```

### Step 2: Add hook import

At the top of the file:
```ts
import { useVideoThumbnail } from '../../hooks/useVideoThumbnail'
```

> Note: cafetton-casero may use relative imports — check the existing import style in this file and match it.

### Step 3: Extract card to inner component

The `useVideoThumbnail` hook must be called at the component level (React rules of hooks). The video card is currently rendered inline in a `.map()`. Extract the video card JSX into a small sub-component `VideoMomentCard` inside the same file:

```tsx
function VideoMomentCard({ m, EVENTS_URL, onClick }: {
  m: Moment
  EVENTS_URL: string
  onClick: () => void
}) {
  const resolvedThumb = m.thumbnail_url
    ? getMediaUrl(m.thumbnail_url, EVENTS_URL)
    : null
  const extractedThumb = useVideoThumbnail(resolvedThumb ? null : getMediaUrl(m.content_url, EVENTS_URL))
  const displayThumb = resolvedThumb ?? extractedThumb

  return (
    <div
      className="relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-gray-900 group"
      onClick={onClick}
    >
      {displayThumb ? (
        <img
          src={displayThumb}
          alt={m.description || "Video del evento"}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full bg-gray-900 group-hover:brightness-110 transition-[filter] duration-300" />
      )}
      {/* Play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="size-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
          <svg className="size-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}
```

> **Note:** Read the actual file carefully before implementing. Match the exact className values, Moment type, `getMediaUrl` function name, and onClick behavior already in place. The above is a guide — adapt to what's actually there. The key change is using `useVideoThumbnail` for the fallback.

### Step 4: Use `VideoMomentCard` in the grid map

In the grid's `.map()`, replace the inline video card JSX with:
```tsx
<VideoMomentCard
  key={m.id}
  m={m}
  EVENTS_URL={EVENTS_URL}
  onClick={() => { setLightboxIdx(idx); setLightbox(true) }}
/>
```

Adapt parameters to match the actual code — read the file first.

### Step 5: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 6: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/sections/MomentWall.tsx
git commit -m "feat(wall): video first-frame thumbnail in MomentWall via canvas extraction"
```

---

## Task 5: Wire `useVideoThumbnail` into public `MomentsGallery`

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

### Step 1: Read the VideoSection / video card rendering

Read `cafetton-casero/src/components/moments/MomentsGallery.tsx`. Around line 872–960 find the `VideoSection` component or the video card rendering that uses `moment.thumbnail_url`. Current code around line 899–910:

```tsx
const thumbUrl = moment.thumbnail_url
  ? (moment.thumbnail_url.startsWith('http')
      ? moment.thumbnail_url
      : `${EVENTS_URL}...`)
  : null
```

When `thumbUrl` is null, there's a fallback (likely grey box or nothing).

### Step 2: Extract video card to sub-component

Same pattern as Task 4 — hooks can't be called inside `.map()`. Create a `VideoCard` sub-component inside the file that calls `useVideoThumbnail`:

```tsx
function VideoCard({ moment, EVENTS_URL, index, onOpen }: {
  moment: Moment
  EVENTS_URL: string
  index: number
  onOpen: (index: number) => void
}) {
  const resolvedThumb = moment.thumbnail_url
    ? (moment.thumbnail_url.startsWith('http')
        ? moment.thumbnail_url
        : `${EVENTS_URL}${moment.thumbnail_url.startsWith('/') ? moment.thumbnail_url.slice(1) : moment.thumbnail_url}`)
    : null
  const videoUrl = moment.content_url.startsWith('http')
    ? moment.content_url
    : `${EVENTS_URL}${moment.content_url.startsWith('/') ? moment.content_url.slice(1) : moment.content_url}`
  const extractedThumb = useVideoThumbnail(resolvedThumb ? null : videoUrl)
  const displayThumb = resolvedThumb ?? extractedThumb

  return (
    <div
      className="relative aspect-video cursor-pointer overflow-hidden rounded-xl bg-gray-900 group"
      onClick={() => onOpen(index)}
    >
      {displayThumb ? (
        <img
          src={displayThumb}
          alt={moment.description || "Video del evento"}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full bg-gray-900" />
      )}
      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
        <div className="size-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
          <svg className="size-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}
```

> **Critical:** Read the actual file before implementing. Match the exact existing card structure, className values, and URL resolution logic. The thumb URL resolution code (lines 900–902) is what's shown above — adapt to what's actually there. The key change is calling `useVideoThumbnail` for the null-thumbnail case.

Also add the import at the top:
```ts
import { useVideoThumbnail } from '../../hooks/useVideoThumbnail'
```

### Step 3: Use `VideoCard` in the VideoSection map

Replace the inline card JSX in `.map()` with `<VideoCard ... />`.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): video first-frame thumbnail in MomentsGallery via canvas extraction"
```

---

## Task 6: Optimistic updates — approve / reject in dashboard

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Read the approve and delete handlers

Read `moments-wall.tsx`. Find `handleApprove` (around line 957–968) and `handleDelete` (around line 970–982). Current pattern (both are similar):

```ts
const handleApprove = async (moment: Moment) => {
  try {
    await api.put(`/moments/${moment.id}/approve`, {})
    await globalMutate(swrKey)
    toast.success('Momento aprobado')
  } catch {
    toast.error('No se pudo aprobar el momento.')
  }
}
```

### Step 2: Implement optimistic approve

Replace `handleApprove` with:

```ts
const handleApprove = async (moment: Moment) => {
  // Optimistic update — reflect approval immediately before API call
  await mutate(
    swrKey,
    (prev: Moment[] | undefined) =>
      prev?.map((m) => m.id === moment.id ? { ...m, is_approved: true } : m),
    { revalidate: false }
  )
  try {
    await api.put(`/moments/${moment.id}/approve`, {})
    await mutate(swrKey) // revalidate from server
    toast.success('Momento aprobado')
  } catch {
    await mutate(swrKey) // revert on error
    toast.error('No se pudo aprobar el momento.')
  }
}
```

> **Note on `mutate` vs `globalMutate`:** The component already imports both. Use the bound `mutate` (from `useSWR`) for the local key — check the exact variable names at the top of the component. If `mutate` is the SWR bound mutate, use it. If only `globalMutate` is available, use `globalMutate(swrKey, updater, { revalidate: false })`.

### Step 3: Implement optimistic delete

Replace `handleDelete` with:

```ts
const handleDelete = async (moment: Moment) => {
  // Optimistic update — remove from list immediately
  await mutate(
    swrKey,
    (prev: Moment[] | undefined) =>
      prev?.filter((m) => m.id !== moment.id),
    { revalidate: false }
  )
  try {
    await api.delete(`/moments/${moment.id}`)
    await mutate(swrKey) // revalidate from server
    toast.success('Momento eliminado')
  } catch {
    await mutate(swrKey) // revert on error
    toast.error('No se pudo eliminar el momento.')
  }
}
```

### Step 4: Apply same pattern to `handleBatchApprove` and `handleBatchDelete` if they exist

Search for any batch approval/deletion handlers and apply the same pattern.

### Step 5: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 6: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "perf(moments): optimistic approve/delete — instant UI feedback before API response"
```

---

## Task 7: JSZip dynamic import

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Remove the top-level import

Find at the top of the file:
```ts
import JSZip from 'jszip'
```
Delete this line.

### Step 2: Add dynamic import inside `handleDownloadZip`

Find `handleDownloadZip` (around line 878). At the very start of the function body, before any other logic:

```ts
const handleDownloadZip = async (typeFilter: 'all' | 'photos' | 'videos' = 'all') => {
  const JSZip = (await import('jszip')).default
  // ... rest of the function unchanged
```

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors — `import('jszip')` returns `Promise<typeof import('jszip')>` and `.default` is the constructor.

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "perf(bundle): JSZip dynamic import — removes ~100KB from initial bundle"
```

---

## Task 8: `useMemo` for filtered moments and counts

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Read the current filter/count code

Find around lines 830–850. There are separate declarations for:
- `filteredMoments` (filtered array)
- `photoCount`, `videoCount`, `noteCount`, etc. (counts)
- `lightboxMoments` (derived from filteredMoments or moments)

### Step 2: Wrap in a single `useMemo`

Replace the separate declarations with one `useMemo`. Add `useMemo` to the React import if not already there.

```ts
const {
  filteredMoments,
  lightboxMoments,
  photoCount,
  videoCount,
  noteCount,
  pendingCount,
  approvedCount,
} = useMemo(() => {
  const all = moments ?? []

  const filtered = (() => {
    switch (filter) {
      case 'pending':   return all.filter((m) => !m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m)) && !m.description)
      case 'approved':  return all.filter((m) => m.is_approved)
      case 'failed':    return all.filter((m) => m.processing_status === 'failed')
      case 'photos':    return all.filter((m) => m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m)))
      case 'videos':    return all.filter((m) => m.is_approved && !!resolveUrl(m) && isVideo(resolveUrl(m)))
      case 'notes':     return all.filter((m) => !!m.description && !resolveUrl(m))
      default:          return all
    }
  })()

  return {
    filteredMoments:  filtered,
    lightboxMoments:  filtered.filter((m) => !!resolveUrl(m)),
    photoCount:       all.filter((m) => m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m))).length,
    videoCount:       all.filter((m) => m.is_approved && !!resolveUrl(m) && isVideo(resolveUrl(m))).length,
    noteCount:        all.filter((m) => !!m.description && !resolveUrl(m)).length,
    pendingCount:     all.filter((m) => !m.is_approved).length,
    approvedCount:    all.filter((m) => m.is_approved).length,
  }
}, [moments, filter, resolveUrl])
```

> **Important:** Read the actual filter conditions in the file before implementing. The switch cases above are approximations — match the EXACT filter logic that's already there. The goal is to wrap existing logic in `useMemo`, not rewrite it.

### Step 3: Remove the now-redundant individual declarations

Delete the old separate declarations for `filteredMoments`, `lightboxMoments`, and the count variables.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "perf(moments): useMemo for filteredMoments + counts — avoid O(n) recalc on every render"
```

---

## Task 9: Focus trap in Lightbox, QRModal, WallShareModal

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Create the `useFocusTrap` helper (inline, top of file)

Add this helper function near the top of the file (before the component definitions, after imports):

```ts
/** Traps keyboard focus within a container element while active. */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return
    const container = containerRef.current
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const previouslyFocused = document.activeElement as HTMLElement | null
    first?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [active, containerRef])
}
```

### Step 2: Apply to Lightbox

Find the Lightbox component (around line 129). It has a `<div>` rendered via `createPortal`. Add a `ref` to the outer modal container div and call the hook:

```tsx
function Lightbox({ ... }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true) // Lightbox is always mounted when rendered

  return createPortal(
    <div ref={containerRef} role="dialog" aria-modal="true" ...>
      {/* existing content */}
    </div>,
    document.body
  )
}
```

### Step 3: Apply to QRModal and WallShareModal

Same pattern — add `const containerRef = useRef<HTMLDivElement>(null)`, call `useFocusTrap(containerRef, true)`, and add `ref={containerRef}` + `role="dialog"` + `aria-modal="true"` to the outermost portal div.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "a11y(moments): focus trap in Lightbox, QRModal, WallShareModal — WCAG 2.1 compliance"
```

---

## Task 10: Tab panel accessibility + quick wins (dashboard)

Batch of small, low-risk changes to `moments-wall.tsx`.

**Files:**
- Modify: `dashboard-ts/src/components/events/moments-wall.tsx`

### Step 1: Add `role="tabpanel"` to the moments grid

Find the moments grid container (the div that wraps the actual `filteredMoments.map(...)` grid, around line 1400). Add:

```tsx
<div
  role="tabpanel"
  aria-labelledby={`tab-${filter}`}
  className="..." {/* existing className unchanged */}
>
```

Also add `id={`tab-${tab.value}`}` to each tab button in the filter tabs map (around line 1362–1389).

### Step 2: `aria-label` on icon-only buttons

Find each of these buttons and replace `title="..."` with `aria-label="..."` (keep `title` too — it's fine to have both):

- ZIP dropdown caret button (around line 1159): add `aria-label="Opciones de descarga"`
- Group-by-time toggle (around line 1319): add `aria-label="Agrupar por tiempo"`
- Share/publish toggles (around lines 1257–1282): add descriptive `aria-label` per button

### Step 3: `REFRESH_INTERVAL` constant

Near the top of the file (after imports, before component definitions), add:

```ts
const REFRESH_INTERVAL = 15_000 // ms — also referenced in the "Auto-refresh" UI label
```

Then replace `refreshInterval: 15_000` in the SWR config with `refreshInterval: REFRESH_INTERVAL`.

### Step 4: Replace `.join(' ')` with `clsx()`

Find all instances of `[...].join(' ')` used to build className strings. Replace each with `clsx(...)`. Example:

```tsx
// BEFORE:
className={['base-class', condition && 'conditional-class'].filter(Boolean).join(' ')}

// AFTER:
className={clsx('base-class', condition && 'conditional-class')}
```

`clsx` is already imported in the file — verify this at the top and add the import if missing: `import clsx from 'clsx'`.

### Step 5: Remove `unoptimized` from NoteCard Image

Find the `NoteCard` component (around line 690). Find:
```tsx
<Image ... unoptimized />
```
Remove the `unoptimized` prop.

### Step 6: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit
```

Expected: zero errors

### Step 7: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/moments-wall.tsx
git commit -m "a11y(moments): tabpanel role, aria-labels, REFRESH_INTERVAL const, clsx classnames, unoptimized removed"
```

---

## Task 11: Upload limit toast — public frontend

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Read the `addFiles` function

Find `addFiles` (or the file input `onChange` handler) in `SharedUploadPage.tsx`. It calculates how many files can still be added (`remaining`). Current behavior: silently drops files beyond the limit.

### Step 2: Add toast when limit is hit

Find the section that calculates remaining slots and slices the new files. Add a toast after the slice:

```ts
const MAX_FILES = 10 // or whatever the constant is — check the actual file
const remaining = MAX_FILES - files.filter(f => f.status !== 'done').length

if (newFiles.length > remaining) {
  const dropped = newFiles.length - remaining
  // Existing: newFiles = newFiles.slice(0, remaining) or similar
  toast.warning(
    remaining === 0
      ? `Ya alcanzaste el límite de ${MAX_FILES} archivos`
      : `Solo se agregaron ${remaining} de ${newFiles.length} archivos (límite: ${MAX_FILES})`
  )
}
```

> **Read the file first.** Find the exact variable names (`MAX_FILES`, `remaining`, the toast function used elsewhere in the file). Match the existing toast call style exactly — if the file uses `toast.error(...)` or `toast(...)`, match that pattern.

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "ux(upload): toast when file limit reached — no more silent file drops"
```

---

## Task 12: "Ver más" button — disable on error + og:image:alt + will-change + aria-live

Batch of four small public frontend improvements.

**Files:**
- Modify: `cafetton-casero/src/components/sections/MomentWall.tsx`
- Modify: `cafetton-casero/src/layouts/template.astro`
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

### Step 1: Disable "Ver más" on error (`MomentWall.tsx`)

Read the file. Find the "Ver más" / load-more button (around line 130). It likely has:
```tsx
<button onClick={loadMore} disabled={loadingMore}>
```

Change to:
```tsx
<button
  onClick={() => { setLoadMoreError(null); loadMore(); }}
  disabled={loadingMore || !!loadMoreError}
>
```

If `loadMoreError` doesn't already exist as state, add `const [loadMoreError, setLoadMoreError] = useState<string | null>(null)` and set it in the error handler.

### Step 2: `aria-live` for lightbox navigation (`MomentWall.tsx`)

Find the keyboard `useEffect` for the lightbox. After it (or inside the lightbox JSX), add a visually-hidden live region:

```tsx
{/* Screen reader announcement for lightbox navigation */}
<span
  className="sr-only"
  aria-live="polite"
  aria-atomic="true"
>
  {lightbox ? `Imagen ${lightboxIdx + 1} de ${moments.length}` : ''}
</span>
```

Place this inside the lightbox portal/modal container, not outside it.

### Step 3: `og:image:alt` (`template.astro`)

Read `cafetton-casero/src/layouts/template.astro`. Find the `<meta property="og:image" ...>` tag. Immediately after it, add:

```html
<meta property="og:image:alt" content={pageTitle} />
```

Use the same variable as the `og:title` meta — likely `pageTitle`, `title`, or `event.name` — check the file.

### Step 4: ProcessingCard `will-change` (`MomentsGallery.tsx`)

Read `cafetton-casero/src/components/moments/MomentsGallery.tsx`. Find `ProcessingCard` or the spinner element with `animate-spin` or `rotate: 360`. Add `style={{ willChange: 'transform' }}` to that element.

### Step 5: TypeScript check (both projects)

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 6: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/sections/MomentWall.tsx \
        src/layouts/template.astro \
        src/components/moments/MomentsGallery.tsx
git commit -m "ux+a11y+perf: load-more error state, aria-live lightbox, og:image:alt, will-change spinner"
```

---

## Final Verification

### Dashboard

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npm run test:unit
npx tsc --noEmit
npm run build
git push origin main
```

Expected: all tests pass, zero TS errors, build succeeds.

### Public frontend

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
npm run build
git push origin main
```

Expected: zero TS errors, build succeeds.

---

## Summary

| Task | Project | Change |
|------|---------|--------|
| 1 | dashboard | `useVideoThumbnail` hook + unit tests |
| 2 | cafetton-casero | `useVideoThumbnail` hook (same) |
| 3 | dashboard | Wire hook into `MomentCard` |
| 4 | cafetton-casero | Wire hook into `MomentWall` |
| 5 | cafetton-casero | Wire hook into `MomentsGallery` |
| 6 | dashboard | Optimistic approve/delete |
| 7 | dashboard | JSZip dynamic import |
| 8 | dashboard | `useMemo` for filtered moments + counts |
| 9 | dashboard | Focus trap in 3 modals |
| 10 | dashboard | `tabpanel`, `aria-label`, constant, `clsx`, unoptimized fix |
| 11 | cafetton-casero | Upload limit toast |
| 12 | cafetton-casero | Load-more error state + `aria-live` + `og:image:alt` + `will-change` |
