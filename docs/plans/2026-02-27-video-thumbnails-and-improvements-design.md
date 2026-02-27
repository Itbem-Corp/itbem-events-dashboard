# Design Doc — Video Thumbnails + General Improvements

**Date:** 2026-02-27
**Status:** Approved
**Projects affected:** dashboard-ts, cafetton-casero (public frontend)

---

## 1. Video Thumbnails — Canvas Frame Extraction

### Problem

Videos without `thumbnail_url` (legacy uploads + Lambda failures) show:
- Dashboard `MomentCard`: dark gradient + grey play icon
- Public `MomentWall`: plain dark grey box
- Public `MomentsGallery`: dark grey box

The `thumbnail_url` field exists in the `Moment` model and Lambda generates it for new videos. The fallback path is the issue.

### Solution: `useVideoThumbnail(url)` hook

A custom React hook that, given a video URL, extracts the first frame via canvas and returns a blob URL usable as `<img src>`.

**Algorithm:**
1. Create a hidden `<HTMLVideoElement>` (not in DOM)
2. Set `preload="metadata"`, `crossOrigin="anonymous"`, `muted = true`
3. On `loadedmetadata`: set `currentTime = 0.1` (avoids black frame 0)
4. On `onseeked`: draw frame onto an off-screen canvas, call `canvas.toBlob()`
5. Return blob URL via `useState`; clean up with `URL.revokeObjectURL` on unmount
6. Graceful fallback: if any step fails (CORS, network, codec), return `null` → caller shows grey play icon

**Interface:**
```ts
function useVideoThumbnail(videoUrl: string | null): string | null
// Returns: blob URL of first frame, or null if not yet ready / failed
```

**Where applied:**
- `dashboard-ts/src/components/events/moments-wall.tsx` — `MomentCard` fallback (when `moment.thumbnail_url` is falsy)
- `cafetton-casero/src/components/sections/MomentWall.tsx` — video card fallback
- `cafetton-casero/src/components/moments/MomentsGallery.tsx` — `VideoSection` card fallback

**Hook file locations:**
- `dashboard-ts/src/hooks/useVideoThumbnail.ts`
- `cafetton-casero/src/hooks/useVideoThumbnail.ts` (identical logic, separate file per project)

**Loading state:** While extracting (~100–300ms), show the existing grey play icon. Once blob URL is ready, fade in the frame with `opacity` transition.

**Performance:** Extraction only runs when the card is visible (both projects already use `useLazyVisible` / intersection observer). Maximum one video element created per card, destroyed after extraction.

---

## 2. Dashboard Improvements (`dashboard-ts`)

### 2a. Optimistic updates — approve / reject

**Problem:** `handleApprove` and `handleDelete` call `globalMutate()` only after the API request completes (500–1000ms lag). Admins double-click.

**Solution:** Before the API call, mutate the local SWR cache to reflect the expected state. On API error, revert and show a toast.

Pattern:
```ts
// Optimistically update
await mutate(swrKey, (prev) => prev?.map(m => m.id === id ? { ...m, is_approved: true } : m), false)
try {
  await api.put(...)
  await mutate(swrKey) // revalidate
} catch {
  await mutate(swrKey) // revert on error
  toast.error('...')
}
```

### 2b. JSZip — dynamic import

**Problem:** JSZip (~100KB) is a top-level import, loaded on every page visit.

**Solution:** Lazy import inside `handleDownloadZip`:
```ts
const JSZip = (await import('jszip')).default
```
Remove the top-level `import JSZip from 'jszip'`.

### 2c. `useMemo` for filtered moments

**Problem:** `filteredMoments`, counts (`photoCount`, `videoCount`, etc.), and `lightboxMoments` recompute on every render even when `moments` and `filter` haven't changed.

**Solution:** Wrap all derived arrays and counts in a single `useMemo(() => ({ filteredMoments, lightboxMoments, photoCount, videoCount, noteCount }), [moments, filter])`.

### 2d. Focus trap in modals

**Problem:** Lightbox, QRModal, WallShareModal use `createPortal` but don't trap keyboard focus.

**Solution:** Each modal `useEffect` on open: find all focusable elements in the modal, set focus on first, intercept Tab/Shift+Tab to cycle within, restore prior focus on close. No new dependencies — implement with native DOM APIs.

### 2e. Tab panel accessibility

**Problem:** Filter tabs have `role="tab"` + `aria-selected` but the grid container lacks `role="tabpanel"`.

**Solution:** Wrap the moments grid `<div>` with `role="tabpanel"` + `aria-labelledby={activeTabId}`.

### 2f. `aria-label` on icon-only buttons

**Problem:** Zip caret (line 1159), group-by-time toggle (line 1319), share/publish toggles (lines 1257–1282) have `title` but no `aria-label`.

**Solution:** Replace `title="..."` with `aria-label="..."` (or add both — `title` shows tooltip, `aria-label` is read by screen readers).

### 2g. `REFRESH_INTERVAL` constant

Replace hardcoded `15_000` with `const REFRESH_INTERVAL = 15_000` at the top of the file.

### 2h. `clsx()` for className builders

Replace all `.join(' ')` className arrays with `clsx(...)` (already imported in the project).

### 2i. Remove `unoptimized` from NoteCard Image

Line 710: `<Image ... unoptimized>` — remove the prop so Next.js can optimize the 56×56px thumbnail.

---

## 3. Public Frontend Improvements (`cafetton-casero`)

### 3a. Upload limit feedback

**Problem:** When user adds files beyond the 10-file limit, the second batch silently drops files.

**Solution:** In `addFiles`, after calculating `remaining`, if `remaining <= 0` show a `toast` (or if `files.length > remaining`, show "Solo puedes subir X más"). Use the existing toast system.

### 3b. "Ver más" button — disable while loading / error

**Problem:** `MomentWall.tsx` load-more button doesn't disable on error state, allowing multiple simultaneous requests.

**Solution:** Disable the button while `loadingMore || loadMoreError`. Reset `loadMoreError` on next click attempt.

### 3c. `og:image:alt` meta tag

**Problem:** `template.astro` sets `og:image` but no `og:image:alt`.

**Solution:** Add `<meta property="og:image:alt" content={pageTitle} />` below the existing `og:image` meta.

### 3d. ProcessingCard spinner `will-change`

**Problem:** `rotate: 360` CSS animation on processing cards lacks GPU acceleration hint.

**Solution:** Add `style={{ willChange: 'transform' }}` to the spinning element in `MomentsGallery.tsx`.

### 3e. Lightbox `aria-live` in MomentWall

**Problem:** Arrow key navigation changes the lightbox image with no announcement to screen readers.

**Solution:** Add a visually-hidden `<span aria-live="polite">` that updates with "Imagen N de M" when `lightboxIdx` changes.

---

## Files Changed Summary

| Project | File | Changes |
|---------|------|---------|
| dashboard-ts | `src/hooks/useVideoThumbnail.ts` | New hook |
| dashboard-ts | `src/components/events/moments-wall.tsx` | Video thumbnail hook + optimistic updates + JSZip lazy + useMemo + focus traps + tabpanel + aria-labels + REFRESH_INTERVAL + clsx + unoptimized fix |
| cafetton-casero | `src/hooks/useVideoThumbnail.ts` | New hook (identical) |
| cafetton-casero | `src/components/sections/MomentWall.tsx` | Video thumbnail hook + load-more fix + aria-live |
| cafetton-casero | `src/components/moments/MomentsGallery.tsx` | Video thumbnail hook + will-change |
| cafetton-casero | `src/layouts/template.astro` | og:image:alt |
| cafetton-casero | `src/components/SharedUploadPage.tsx` | Upload limit toast |

---

## Definition of Done

- [ ] Videos without `thumbnail_url` show real first-frame preview (not grey box) in dashboard and both public components
- [ ] Frame extraction fails gracefully → grey play icon fallback (no crash)
- [ ] Approve/reject in dashboard reflects instantly (optimistic)
- [ ] JSZip not loaded until ZIP download starts
- [ ] `filteredMoments` + counts wrapped in `useMemo`
- [ ] Modal keyboard focus trapped in Lightbox, QRModal, WallShareModal
- [ ] Moments grid has `role="tabpanel"`
- [ ] All icon-only buttons have `aria-label`
- [ ] Adding files beyond limit shows a toast
- [ ] "Ver más" disabled during loading/error
- [ ] `og:image:alt` present in template
- [ ] `npx tsc --noEmit` zero errors (dashboard)
- [ ] `npx tsc --noEmit` zero errors (cafetton-casero)
- [ ] `npm run build` passes (dashboard)
- [ ] `npm run build` passes (cafetton-casero)
