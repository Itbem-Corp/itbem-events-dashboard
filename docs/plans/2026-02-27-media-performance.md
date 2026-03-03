# Media Performance: Upload + Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Four targeted improvements to upload and photo/video wall performance: HEIC browser conversion, lazy loading in MomentWall, lightbox preload in both galleries, and blur-up transition in ImageWithLoader.

**Architecture:** All changes are confined to cafetton-casero. Task 1 (HEIC) modifies SharedUploadPage.tsx. Tasks 2–3 modify MomentWall.tsx and MomentsGallery.tsx. Task 4 modifies ImageWithLoader.tsx. No new npm dependencies. No backend changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, `createImageBitmap()` Web API, `IntersectionObserver` (already in use)

---

## Task 1: HEIC → JPEG in-browser conversion

**Context:** iOS devices upload photos in HEIC format. Currently these show an icon placeholder and upload as opaque blobs (no compression). `createImageBitmap()` can decode HEIC natively in Safari 17+, Chrome 120+, and Edge — converting to JPEG enables preview + compression.

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Add `tryConvertHeic` helper

Read the file first. Find `extractVideoThumbnail` — insert the new function immediately after it (before `compressImage`).

```ts
/**
 * Attempts to decode a HEIC/HEIF file using createImageBitmap() and re-encode
 * as JPEG at 2048px / 85%. Returns null if the browser doesn't support HEIC
 * decode (Safari <17, Firefox) — caller falls back to the existing icon.
 */
async function tryConvertHeic(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale  = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(bitmap.width  * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })
          : null),
        "image/jpeg",
        0.85
      );
    });
  } catch {
    return null; // browser doesn't support HEIC decode — keep icon placeholder
  }
}
```

### Step 2: Trigger conversion in `addFiles`

In `addFiles`, find the block that fires video thumbnail generation:
```ts
entries.filter((e) => e.isVideo).forEach((e) => generateVideoThumb(e));
```

Immediately after it, add HEIC conversion:
```ts
// Attempt async HEIC → JPEG conversion for preview + compression
entries.filter((e) => e.isHeic).forEach(async (e) => {
  const converted = await tryConvertHeic(e.file);
  if (!converted) return; // browser unsupported — icon stays
  const newPreview = URL.createObjectURL(converted);
  setFiles((prev) => prev.map((x) =>
    x.id === e.id
      ? { ...x, file: converted, previewUrl: newPreview, isHeic: false }
      : x
  ));
});
```

**Why this works:**
- `buildEntry()` sets `previewUrl = "heic"` synchronously — the icon shows immediately
- Conversion runs async; when done it replaces the icon with a real JPEG preview
- `isHeic: false` means `compressImage` will now process it (it's already ≤2048px/JPEG so it'll be a no-op or re-compress if original was very large)
- On upload, the converted `file` (JPEG) is used instead of the original HEIC blob

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
git commit -m "feat(upload): HEIC → JPEG conversion via createImageBitmap() — preview + compression for iOS photos"
```

---

## Task 2: Lazy loading audit in MomentWall.tsx

**Context:** `MomentsGallery.tsx` already uses a `useLazyImage` hook (IntersectionObserver, rootMargin 200px) and all photo cards are lazy. However `MomentWall.tsx` (the simpler wall used in invitation pages) renders `<img>` tags without `loading="lazy"`, making the browser download all photos on mount.

**Files:**
- Modify: `cafetton-casero/src/components/sections/MomentWall.tsx`

### Step 1: Read the file

Read `src/components/sections/MomentWall.tsx`. Find all `<img>` tags in the moments grid (not the lightbox). There are two:
1. Video thumbnail image (inside `{m.thumbnail_url ? (<img src={...} .../>)`)
2. Photo image (the `<img src={src} .../>` for non-video moments)

### Step 2: Add `loading` and `decoding` attributes

For both `<img>` tags in the grid (not the lightbox `<img>`):

```tsx
// Video thumbnail img — find it and add the two attributes:
<img
  src={getMediaUrl(m.thumbnail_url, EVENTS_URL)}
  alt={m.description || "Video del evento"}
  className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
  loading="lazy"
  decoding="async"
/>

// Photo img — find it and add the two attributes:
<img
  src={src}
  alt={m.description || "Momento del evento"}
  className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
  loading="lazy"
  decoding="async"
/>
```

> **Note:** The lightbox `<img>` (inside the lightbox modal) should use `loading="eager"` since the user has actively requested to see it. Do NOT add `loading="lazy"` to the lightbox image.

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/sections/MomentWall.tsx
git commit -m "perf(wall): add loading=lazy + decoding=async to MomentWall grid images"
```

---

## Task 3: Preload adjacent images in lightboxes

**Context:** When a user opens image N in the lightbox and presses next, the browser makes a cold request for image N+1. Preloading N-1 and N+1 when the lightbox opens (or when the index changes) hides this latency behind the user's viewing time.

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx` (inside `GalleryLightbox`)
- Modify: `cafetton-casero/src/components/sections/MomentWall.tsx` (inside lightbox effect)

### Step 3a: Preload in GalleryLightbox (MomentsGallery.tsx)

Read `GalleryLightbox` function (~line 1021). It already has a `useEffect` for keyboard navigation. Add a **separate** `useEffect` for preloading:

Insert after the existing keyboard `useEffect` (after its closing `}, [onClose, onNext, onPrev])`):

```ts
// Preload adjacent images so navigation feels instant
useEffect(() => {
  const preload = (m: Moment | undefined) => {
    if (!m) return;
    const url = resolveFullUrl(m, EVENTS_URL);
    if (!url || isVideo(url)) return; // videos are too large to preload
    const img = new Image();
    img.src = url;
  };
  preload(moments[index - 1]);
  preload(moments[index + 1]);
}, [index, moments, EVENTS_URL]);
```

This fires on mount and every time `index` changes, keeping the cache warm for the next tap.

### Step 3b: Preload in MomentWall.tsx lightbox

Read `MomentWall.tsx`. Find the keyboard navigation `useEffect` for the lightbox (it handles ArrowLeft/ArrowRight/Escape using `lightbox` and `lightboxIdx` state). Add a preload effect nearby.

After the keyboard `useEffect` closing brace, add:

```ts
// Preload the adjacent moments so lightbox navigation feels instant
useEffect(() => {
  if (!lightbox) return;
  const preload = (m: Moment | undefined) => {
    if (!m) return;
    const src = getMediaUrl(m.content_url, EVENTS_URL);
    if (!src || isVideoUrl(src)) return;
    const img = new Image();
    img.src = src;
  };
  preload(moments[lightboxIdx - 1]);
  preload(moments[lightboxIdx + 1]);
}, [lightbox, lightboxIdx, moments, EVENTS_URL]);
```

> **Note on `isVideoUrl`:** this function already exists in MomentWall.tsx — use it as-is.

### Step 3c: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors

### Step 3d: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/moments/MomentsGallery.tsx src/components/sections/MomentWall.tsx
git commit -m "perf(lightbox): preload adjacent images on index change — instant navigation"
```

---

## Task 4: Blur-up transition in ImageWithLoader

**Context:** `ImageWithLoader.tsx` already fades images from `opacity-0` to `opacity-100`. Adding a simultaneous `blur-sm → blur-0` gives a "coming into focus" effect that makes loading feel intentional rather than jarring.

**Files:**
- Modify: `cafetton-casero/src/components/ImageWithLoader.tsx`

### Step 1: Read the file

Read `src/components/ImageWithLoader.tsx`. Find the `<img>` element's `className`. It currently has:

```tsx
className={`w-full h-full ${dynamicObjectClass} transition-opacity duration-500 ${
  loaded ? "opacity-100" : "opacity-0"
} ${className}`}
```

### Step 2: Add blur transition

Replace the `className` expression:

```tsx
className={`w-full h-full ${dynamicObjectClass} transition-[opacity,filter] duration-500 ${
  loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm"
} ${className}`}
```

**What changes:**
- `transition-opacity` → `transition-[opacity,filter]` (Tailwind arbitrary value — transitions both properties simultaneously)
- Add `blur-0` when loaded, `blur-sm` when loading

**Note:** `blur-0` (`filter: blur(0px)`) and `blur-sm` (`filter: blur(4px)`) are standard Tailwind classes. No config changes needed.

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors (this is a JSX string change, not a type change)

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/ImageWithLoader.tsx
git commit -m "perf(ui): blur-up transition in ImageWithLoader — filter blur-sm→0 on load"
```

---

## Final verification + push

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
git push origin main
```

Expected: zero TypeScript errors, push succeeds.

---

## Summary

| Task | File | Change |
|------|------|--------|
| 1 | `SharedUploadPage.tsx` | `tryConvertHeic()` + async HEIC→JPEG in `addFiles` |
| 2 | `MomentWall.tsx` | `loading="lazy" decoding="async"` on grid `<img>` tags |
| 3 | `MomentsGallery.tsx` | Preload effect in `GalleryLightbox` |
| 3 | `MomentWall.tsx` | Preload effect in lightbox |
| 4 | `ImageWithLoader.tsx` | `blur-sm → blur-0` CSS transition |
