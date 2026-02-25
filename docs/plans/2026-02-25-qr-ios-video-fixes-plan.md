# QR Quality + iOS Upload UX + Video Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 issues across dashboard and public frontend: QR print quality, iOS upload delay UX, concurrent upload worker pool, video thumbnails in dashboard grid, iOS video playback, and a dedicated video highlights section.

**Architecture:** Two projects are modified in parallel — `dashboard-ts` (Next.js) and `cafetton-casero` (Astro + React islands). No backend changes required for any task. Each task is self-contained with a single commit.

**Tech Stack:** Next.js 15, React, TypeScript, Vitest + RTL (dashboard-ts tests), Framer Motion, qrcode.react (QRCodeCanvas), Tailwind CSS.

**Design doc:** `docs/plans/2026-02-25-qr-ios-video-fixes-design.md`

---

## Task 1: PNG DPI Metadata Helper + QR Download Quality Fix

**Projects:** dashboard-ts

**Files:**
- Create: `src/lib/png-dpi.ts`
- Modify: `src/components/ui/branded-qr.tsx`
- Test: `tests/unit/lib/png-dpi.test.ts`

---

### Step 1: Create the utility file `src/lib/png-dpi.ts`

```ts
/**
 * Injects a pHYs (physical pixel dimensions) chunk into a PNG data URL.
 * This makes the image open at the correct physical size in print dialogs.
 *
 * PNG chunk layout: length(4) + type(4) + data(9) + crc(4) = 21 bytes
 * Inserted immediately after the IHDR chunk (byte offset 33).
 */

/** CRC32 using standard reflected polynomial 0xEDB88320. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Injects DPI metadata into a PNG data URL.
 * @param dataUrl - PNG as base64 data URL (output of canvas.toDataURL('image/png'))
 * @param dpi     - Target resolution in dots per inch (e.g. 300)
 * @returns New data URL with pHYs chunk embedded
 */
export function injectPngDpi(dataUrl: string, dpi: number): string {
  // 1. Decode base64 → bytes
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  // 2. Build pHYs data: X ppu (4B) + Y ppu (4B) + unit byte (1B)
  const ppm = Math.round(dpi / 0.0254) // dots per inch → pixels per metre
  const chunkData = new Uint8Array(9)
  const dv = new DataView(chunkData.buffer)
  dv.setUint32(0, ppm, false)  // X pixels per unit
  dv.setUint32(4, ppm, false)  // Y pixels per unit
  chunkData[8] = 1              // unit = metre

  // 3. Type bytes: "pHYs"
  const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73])

  // 4. CRC32 over type + data (13 bytes)
  const crcInput = new Uint8Array(13)
  crcInput.set(typeBytes, 0)
  crcInput.set(chunkData, 4)
  const crc = crc32(crcInput)

  // 5. Assemble full chunk: length(4) + type(4) + data(9) + crc(4)
  const chunk = new Uint8Array(21)
  const chunkView = new DataView(chunk.buffer)
  chunkView.setUint32(0, 9, false)   // data length = 9
  chunk.set(typeBytes, 4)
  chunk.set(chunkData, 8)
  chunkView.setUint32(17, crc, false)

  // 6. Insert chunk after IHDR (PNG sig=8B + IHDR chunk=25B → offset 33)
  const IHDR_END = 33
  const result = new Uint8Array(bytes.length + 21)
  result.set(bytes.slice(0, IHDR_END))
  result.set(chunk, IHDR_END)
  result.set(bytes.slice(IHDR_END), IHDR_END + 21)

  // 7. Re-encode to base64 data URL
  let out = ''
  for (let i = 0; i < result.length; i++) out += String.fromCharCode(result[i])
  return `data:image/png;base64,${btoa(out)}`
}
```

---

### Step 2: Write unit tests `tests/unit/lib/png-dpi.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { crc32, injectPngDpi } from '@/lib/png-dpi'

describe('crc32', () => {
  it('returns 0 for empty input', () => {
    // CRC32 of empty = 0x00000000
    expect(crc32(new Uint8Array([]))).toBe(0x00000000)
  })

  it('matches known CRC for "pHYs" type bytes', () => {
    // Pre-computed CRC32 of bytes [0x70, 0x48, 0x59, 0x73] = 0x8EB050CA
    const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73])
    expect(crc32(typeBytes)).toBe(0x8eb050ca)
  })
})

describe('injectPngDpi', () => {
  // Minimal valid 1×1 white PNG (base64) — standard test fixture
  const MINIMAL_PNG =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg=='

  it('output is longer than input (chunk was inserted)', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const inputLen = atob(MINIMAL_PNG.split(',')[1]).length
    const outputLen = atob(result.split(',')[1]).length
    expect(outputLen).toBe(inputLen + 21) // 21 = pHYs chunk size
  })

  it('pHYs signature is at byte offset 33', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const binary = atob(result.split(',')[1])
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    // "pHYs" = [0x70, 0x48, 0x59, 0x73] at offset 33+4 (after length field)
    expect(bytes[37]).toBe(0x70) // 'p'
    expect(bytes[38]).toBe(0x48) // 'H'
    expect(bytes[39]).toBe(0x59) // 'Y'
    expect(bytes[40]).toBe(0x73) // 's'
  })

  it('embeds correct pixels-per-metre for 300 DPI', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const binary = atob(result.split(',')[1])
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const view = new DataView(bytes.buffer)
    // pHYs data starts at offset 41 (33 length + 4 type + 4 type bytes = offset 41)
    const ppm = view.getUint32(41, false) // big-endian
    expect(ppm).toBe(Math.round(300 / 0.0254)) // 11811
  })
})
```

---

### Step 3: Run tests — verify they fail (function not yet imported)

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
npm run test:unit -- png-dpi
```

Expected: tests fail with import errors or assertion failures on minimal PNG.

---

### Step 4: Modify `src/components/ui/branded-qr.tsx`

Four changes:

**4a.** Add import at top of file (after existing imports):
```ts
import { injectPngDpi } from '@/lib/png-dpi'
```

**4b.** Change default `downloadSize` prop from `800` to `2400`:
```ts
// Before:
  downloadSize = 800,

// After:
  downloadSize = 2400,
```

**4c.** In `handleDownload`, wrap `toDataURL` with `injectPngDpi`:
```ts
// Before:
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl

// After:
      const rawDataUrl = canvas.toDataURL('image/png')
      const dataUrl = injectPngDpi(rawDataUrl, 300)
      const a = document.createElement('a')
      a.href = dataUrl
```

**4d.** In the hidden `QRCodeCanvas`, change `level` to `"H"`:
```tsx
// Before:
          level="M"

// After:
          level="H"
```

(The visible `QRCodeSVG` keeps `level="M"` — no change needed there.)

---

### Step 5: Run tests — verify they pass

```bash
npm run test:unit -- png-dpi
```

Expected: all 4 tests pass.

---

### Step 6: Run TypeScript check

```bash
npx tsc --noEmit
```

Expected: zero errors.

---

### Step 7: Manual smoke test

Run `npm run dev`, open any event's QR modal, click "Descargar QR". Open the PNG in any image viewer and verify:
- File size is noticeably larger (higher resolution)
- If opened in a photo editor (Photoshop, Preview on Mac, etc.) the DPI shows as 300

---

### Step 8: Commit

```bash
git add src/lib/png-dpi.ts src/components/ui/branded-qr.tsx tests/unit/lib/png-dpi.test.ts
git commit -m "feat(qr): high-res sticker download — 2400px, level H, 300 DPI metadata"
```

---

## Task 2: iOS Upload Overlay — "Preparing files..." UX

**Project:** cafetton-casero

**File:**
- Modify: `src/components/SharedUploadPage.tsx`

No unit test — this tests window focus/blur events which require a real browser. Manual test below.

---

### Step 1: Add `isPreparing` state and refs

Inside `SharedUploadPage` component, after existing `useState` declarations, add:

```ts
const [isPreparing, setIsPreparing] = useState(false)
const pickerOpenRef = useRef(false)
```

---

### Step 2: Add the focus listener effect

Add this `useEffect` after the existing `useEffect` blocks inside the component:

```ts
  // Detect iOS gallery picker close → show "preparing" overlay until onChange fires
  useEffect(() => {
    const onFocus = () => {
      if (pickerOpenRef.current) {
        setIsPreparing(true)
        pickerOpenRef.current = false
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
```

---

### Step 3: Mark picker as open when the input is clicked

Find the two `<input type="file" ...>` elements (one for gallery `fileInputRef`, one for camera `cameraInputRef`). Add `onFocus` handler to the hidden file inputs. Since these inputs are hidden and triggered programmatically, instead intercept at the button that triggers `.click()`:

Find every place where `fileInputRef.current?.click()` or `cameraInputRef.current?.click()` is called (should be 2 places — gallery button and camera button). Wrap each with:

```ts
// Before any .click() call, add:
pickerOpenRef.current = true
```

Example:
```ts
// Before:
fileInputRef.current?.click()

// After:
pickerOpenRef.current = true
fileInputRef.current?.click()
```

Do the same for `cameraInputRef.current?.click()`.

---

### Step 4: Clear `isPreparing` when `onChange` fires

Find the `onChange` handler on the file inputs. It will call `addFiles(...)`. Add `setIsPreparing(false)` as the very first line of that handler:

```ts
// Find the onChange handlers on both <input type="file"> elements.
// At the top of each handler, add:
setIsPreparing(false)
pickerOpenRef.current = false
```

---

### Step 5: Add the overlay JSX

Find the return JSX of `SharedUploadPage`. Add the overlay as the first child inside the outermost `<div>`, using `AnimatePresence` which is already imported:

```tsx
<AnimatePresence>
  {isPreparing && (
    <motion.div
      key="preparing"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl backdrop-blur-md"
      style={{
        background: 'rgba(24,24,27,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <svg
        className="w-4 h-4 text-pink-400 animate-spin shrink-0"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm text-white/90 font-medium whitespace-nowrap">
        Preparando archivos de tu galería…
      </span>
    </motion.div>
  )}
</AnimatePresence>
```

---

### Step 6: Reduce video thumbnail extraction timeout

Find `extractVideoThumbnail` function. Change the fallback timeout from 5000ms to 2000ms:

```ts
// Before:
    setTimeout(fallback, 5000)

// After:
    setTimeout(fallback, 2000)
```

---

### Step 7: Manual test (iOS)

- Open the upload page on an iPhone (or iPhone Simulator)
- Tap the gallery button
- Select 5+ photos/videos
- Tap "Add" — verify the "Preparando archivos..." banner appears immediately
- Wait for files to appear in the queue — banner disappears
- Verify `isPreparing` never shows on Android or desktop (too fast to see, which is correct)

---

### Step 8: Commit

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): iOS gallery preparation overlay + 2s thumbnail timeout"
```

---

## Task 3: Upload Worker Pool (8 concurrent, queue-draining)

**Project:** cafetton-casero

**File:**
- Modify: `src/components/SharedUploadPage.tsx`

---

### Step 1: Add `runPool` helper inside the component file

Add this function at module level (outside the component, before `SharedUploadPage`):

```ts
const POOL_SIZE = 8

/**
 * Worker pool: starts up to POOL_SIZE workers, each draining the shared queue
 * immediately when they finish — no waiting for other workers to complete.
 */
async function runPool(tasks: Array<() => Promise<void>>): Promise<void> {
  if (tasks.length === 0) return
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

---

### Step 2: Remove the old CONCURRENCY constant

Find and delete this line in `handleUpload`:
```ts
const CONCURRENCY = 3;
```

---

### Step 3: Replace the upload loop with `runPool`

Inside `handleUpload`, find the loop that currently batches uploads with CONCURRENCY (look for a `for` loop or `Promise.all` slice with CONCURRENCY). Replace the entire loop with:

```ts
    const pendingEntries = files.filter((e) => e.status !== 'done')
    const uploadTasks = pendingEntries.map((entry, idx) => () => uploadOne(entry, idx === 0))
    await runPool(uploadTasks)
```

Note: `isFirst` is passed as `idx === 0` — the first task in the array is the first to run. Read the `uploadOne` function to confirm what `isFirst` controls and adjust if needed (it may be used for `connectionError` detection on the first file only).

---

### Step 4: Manual test

- Upload 10 photos simultaneously — verify all 10 show progress bars at once
- Upload 3 photos + 2 videos — verify photos complete first, videos continue without waiting for a "next batch"
- Upload 1 file — verify it still works (edge case: pool of 1)

---

### Step 5: Commit

```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): worker pool — 8 concurrent uploads, queue-draining"
```

---

## Task 4: Video Thumbnails + Placeholder in Dashboard Grid

**Project:** dashboard-ts

**File:**
- Modify: `src/components/events/moments-wall.tsx`
- Test: `tests/unit/components/events/moments-wall-video.test.tsx`

---

### Step 1: Read the moment card rendering in `moments-wall.tsx`

Open `src/components/events/moments-wall.tsx` and find the section where individual moment cards are rendered inside the grid (look for the `img` tag that uses `content_url` or `thumbnail_url` as `src`). Note the exact component or inline block that renders a single card — you'll modify it in Step 3.

---

### Step 2: Write the failing test

```tsx
// tests/unit/components/events/moments-wall-video.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// We test the video card rendering logic directly.
// Import or extract the card-rendering function once you've read moments-wall.tsx.
// For now, test the `isVideo` helper which is exported or copy-pasted here for isolation.

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(url)
}

describe('isVideo helper', () => {
  it('detects mp4', () => expect(isVideo('https://s3.example.com/video.mp4')).toBe(true))
  it('detects mov', () => expect(isVideo('https://s3.example.com/clip.mov')).toBe(true))
  it('detects webm', () => expect(isVideo('video.webm?t=123')).toBe(true))
  it('does not flag jpg', () => expect(isVideo('photo.jpg')).toBe(false))
  it('does not flag png', () => expect(isVideo('photo.png')).toBe(false))
})
```

Run:
```bash
npm run test:unit -- moments-wall-video
```

Expected: all 5 tests pass (the `isVideo` logic is straightforward).

---

### Step 3: Modify the moment card to handle videos

In `moments-wall.tsx`, find the place where a `<img>` or `<Image>` is rendered for each moment. Wrap it with video detection logic:

```tsx
// Find the moment card render — it will look something like:
// <img src={resolveUrl(m)} alt="..." ... />

// Replace with:
{isVideo(resolveUrl(m)) ? (
  /* Video card */
  <div className="relative w-full h-full">
    {m.thumbnail_url ? (
      <img
        src={m.thumbnail_url}
        alt="Video del evento"
        className="w-full h-full object-cover"
      />
    ) : (
      /* No thumbnail yet — styled placeholder */
      <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-zinc-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
    )}
    {/* Play icon overlay — always shown for videos */}
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      </div>
    </div>
  </div>
) : (
  /* Existing image render — keep exactly as it was */
  <img src={resolveUrl(m)} alt="Momento del evento" className="..." />
)}
```

Adapt `resolveUrl(m)` to whatever function/expression already exists for URL resolution in this file.

---

### Step 4: Run TypeScript check

```bash
npx tsc --noEmit
```

Expected: zero errors.

---

### Step 5: Manual test in dashboard

- Open an event with at least one video moment (processing_status = 'done')
- Verify videos show the placeholder + play icon (not a broken image)
- Verify photos still render normally
- Click a video in the grid — confirm the lightbox opens with `<video>` controls

---

### Step 6: Commit

```bash
git add src/components/events/moments-wall.tsx tests/unit/components/events/moments-wall-video.test.tsx
git commit -m "feat(dashboard): video thumbnail placeholder in moments grid"
```

---

## Task 5: `playsInline` + `preload` Fix in MomentWall.tsx

**Project:** cafetton-casero

**File:**
- Modify: `src/components/sections/MomentWall.tsx`

This is a one-line fix per video element.

---

### Step 1: Find all `<video>` elements in the file

Open `src/components/sections/MomentWall.tsx`. Search for `<video` — there should be at least one in the lightbox (around line 370).

---

### Step 2: Add `playsInline` and `preload="metadata"` to each `<video>`

```tsx
// Before:
<video
  src={getMediaUrl(lightbox.content_url, EVENTS_URL)}
  controls
  autoPlay
  className="w-full max-h-[80vh] rounded-xl"
/>

// After:
<video
  src={getMediaUrl(lightbox.content_url, EVENTS_URL)}
  controls
  autoPlay
  playsInline
  preload="metadata"
  className="w-full max-h-[80vh] rounded-xl"
/>
```

Apply the same change to any other `<video>` in this file.

---

### Step 3: Verify `getMediaUrl` handles absolute S3 URLs

Check the `getMediaUrl` function in `MomentWall.tsx`:
```ts
function getMediaUrl(contentUrl: string, EVENTS_URL: string): string {
  if (!contentUrl) return "";
  if (contentUrl.startsWith("http")) return contentUrl;   // ← S3 absolute URL: passes through correctly
  return EVENTS_URL + "storage/" + contentUrl;
}
```

If it already has the `startsWith("http")` guard, no change needed. If not, add it.

---

### Step 4: Manual test (iOS Safari required)

- Open the event page on an iPhone in Safari
- Find a moment with a video
- Tap the play button — video should start playing **inline** (not jump to fullscreen)
- Verify the first frame is visible before tapping (from `preload="metadata"`)

---

### Step 5: Commit

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/sections/MomentWall.tsx
git commit -m "fix(video): add playsInline + preload=metadata for iOS Safari playback"
```

---

## Task 6: VideoHighlights Section in MomentsGallery

**Project:** cafetton-casero

**File:**
- Modify: `src/components/moments/MomentsGallery.tsx`

---

### Step 1: Split moments into photos and videos

Inside `MomentsGallery`, after the `moments` state, add a derived split using `useMemo`. Find the `groupedItems` useMemo — add the split just above it:

```ts
  const videoMoments = React.useMemo(
    () => moments.filter(m => isVideo(resolveFullUrl(m, EVENTS_URL))),
    [moments, EVENTS_URL]
  )
  const photoMoments = React.useMemo(
    () => moments.filter(m => !isVideo(resolveFullUrl(m, EVENTS_URL))),
    [moments, EVENTS_URL]
  )
```

---

### Step 2: Update `groupedItems` to use only photos

Change `groupedItems` to operate on `photoMoments` instead of `moments`:

```ts
  // Before:
  const groupedItems = React.useMemo(() => {
    const groups: ...
    for (let i = 0; i < moments.length; i += MOMENTS_PER_GROUP) {

  // After:
  const groupedItems = React.useMemo(() => {
    const groups: ...
    for (let i = 0; i < photoMoments.length; i += MOMENTS_PER_GROUP) {
```

Also update the slice inside to use `photoMoments`:
```ts
      const slice = photoMoments.slice(i, i + MOMENTS_PER_GROUP)
```

---

### Step 3: Add `VideoHighlights` component (new, same file)

Add this component definition after the existing `MomentCard` component:

```tsx
function VideoHighlights({
  videoMoments,
  EVENTS_URL,
  theme,
  onOpen,
}: {
  videoMoments: Moment[]
  EVENTS_URL: string
  theme: ReturnType<typeof getTheme>
  onOpen: (index: number) => void
}) {
  if (videoMoments.length === 0) return null

  return (
    <div className="mb-10">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className={`w-6 h-0.5 rounded-full ${theme.accentSoft}`} />
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${theme.accent}`}>
          Momentos en video
        </p>
        <div className={`flex-1 h-px ${theme.accentSoft} opacity-30`} />
      </div>

      {/* Responsive grid: 1 col mobile, 2 col sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {videoMoments.map((moment, i) => {
          const thumbUrl = moment.thumbnail_url
            ? (moment.thumbnail_url.startsWith('http')
                ? moment.thumbnail_url
                : `${EVENTS_URL}${moment.thumbnail_url.startsWith('/') ? moment.thumbnail_url.slice(1) : moment.thumbnail_url}`)
            : null
          return (
            <motion.button
              key={moment.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 280, damping: 24 }}
              onClick={() => onOpen(i)}
              className="group relative w-full overflow-hidden rounded-2xl bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              style={{ aspectRatio: '16/9' }}
            >
              {/* Thumbnail or dark placeholder */}
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={moment.description || 'Video del evento'}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                  <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
              )}

              {/* Dark scrim for play button visibility */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />

              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-xl"
                >
                  <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </motion.div>
              </div>

              {/* Description overlay */}
              {moment.description && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-white text-xs line-clamp-1">{moment.description}</p>
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
```

---

### Step 4: Render `VideoHighlights` and wire up lightbox for videos

In the main `MomentsGallery` return JSX, add `VideoHighlights` between `HeroHeader` and the photo groups div. Also add a separate `videoLightboxIndex` state for the video section lightbox:

```ts
  const [videoLightboxIndex, setVideoLightboxIndex] = useState<number | null>(null)
```

In the JSX, after `<HeroHeader .../>` and before the photo grid `<div className="flex flex-col gap-0">`:

```tsx
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-0">
        <VideoHighlights
          videoMoments={videoMoments}
          EVENTS_URL={EVENTS_URL}
          theme={theme}
          onOpen={(i) => setVideoLightboxIndex(i)}
        />
      </div>
```

Add a second `AnimatePresence` + `GalleryLightbox` for videos (below the existing one for photos):

```tsx
      <AnimatePresence>
        {videoLightboxIndex !== null && (
          <GalleryLightbox
            moments={videoMoments}
            index={videoLightboxIndex}
            EVENTS_URL={EVENTS_URL}
            theme={theme}
            onClose={() => setVideoLightboxIndex(null)}
            onNext={() => setVideoLightboxIndex(i => i !== null ? Math.min(i + 1, videoMoments.length - 1) : null)}
            onPrev={() => setVideoLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
          />
        )}
      </AnimatePresence>
```

---

### Step 5: Manual test

- Open the moments gallery page for an event with at least 1 video
- Verify "Momentos en video" section appears above the photo grid
- Verify 16:9 cards show thumbnail or dark placeholder with play icon
- Click a video card — lightbox opens and video plays with `playsInline`
- Verify photo masonry below has no video cards mixed in

---

### Step 6: Commit

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): VideoHighlights section — dedicated 16:9 video cards above photo grid"
```

---

## Final Verification

### Dashboard-ts

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
npx tsc --noEmit
npm run test:unit
npm run build
```

All must pass with zero errors.

### Cafetton-casero

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npm run build
```

Build must pass.

---

## Out of Scope (follow-up, not in this plan)

- **S3 CORS headers** — if videos still don't play after Task 5, backend/infra must add `Access-Control-Allow-Origin` for the Astro domain to the S3 bucket CORS policy
- **Lambda thumbnail verification** — run backend agent to confirm `GET /moments?event_id=X` returns `thumbnail_url` when Lambda has processed the video
- **S3 Multipart Upload** — for very large videos, future sprint with backend presigned part URLs
