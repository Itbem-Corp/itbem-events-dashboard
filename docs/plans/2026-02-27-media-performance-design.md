# Design Doc — Media Performance: Upload + Visualization

**Date:** 2026-02-27
**Status:** Approved
**Projects affected:** cafetton-casero (public frontend)

---

## Problems

1. **HEIC files**: no preview, no compression — upload as opaque blobs
2. **Photo grid**: images may not all have `loading="lazy"` — N requests on mount
3. **Lightbox**: navigating to next image triggers a cold network request
4. **Blur-up**: `ImageWithLoader` fades in from transparent but no blur transition — jarring on slow connections

---

## Solution 1: HEIC → JPEG conversion via `createImageBitmap()`

**File:** `cafetton-casero/src/components/SharedUploadPage.tsx`

`createImageBitmap()` can decode HEIC on Safari 17+, Chrome 120+, Edge. Falls back to the existing icon placeholder on older browsers.

**Implementation — `tryConvertHeic(file)`:**

```ts
async function tryConvertHeic(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width  = Math.min(bitmap.width,  2048);
    canvas.height = Math.round(bitmap.height * (canvas.width / bitmap.width));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
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
    return null; // browser doesn't support HEIC decode — fall back to icon
  }
}
```

**Integration in `buildEntry()`:**

```ts
// Before:
} else if (isHeic) {
  previewUrl = "heic";
}

// After:
} else if (isHeic) {
  previewUrl = "heic"; // default — overwritten async below if browser supports it
}
// After calling buildEntry(), fire-and-forget conversion for HEIC entries:
// tryConvertHeic(entry.file).then(converted => { if (converted) updateEntry(converted) })
```

Because `buildEntry()` is synchronous, the conversion is triggered after the entry is added to state. A `useEffect` or direct `.then()` in `addFiles()` updates the entry's `previewUrl` and replaces `entry.file` with the converted JPEG when ready.

**Specifically in `addFiles()`**, after `setFiles((prev) => [...prev, ...entries])`:

```ts
entries.filter(e => e.isHeic).forEach(async (e) => {
  const converted = await tryConvertHeic(e.file);
  if (!converted) return;
  const newPreview = URL.createObjectURL(converted);
  setFiles(prev => prev.map(x =>
    x.id === e.id
      ? { ...x, file: converted, previewUrl: newPreview, isHeic: false }
      : x
  ));
});
```

This means: HEIC files show the icon first, then (within ~300ms on modern devices) switch to a real JPEG preview. The converted JPEG is also used for upload, so compression applies too.

**No new npm dependencies.**

---

## Solution 2: Lazy loading audit + fix in MomentsGallery

**File:** `cafetton-casero/src/components/moments/MomentsGallery.tsx`

Find all `<img>` tags in the photo masonry grid section and verify they all have:
```tsx
loading="lazy"
decoding="async"
```

The video thumbnail images already have these (line ~296). The photo grid images may not. Add them where missing.

For the first 6 images (above the fold), use `loading="eager"` to avoid lazy-loading LCP images.

---

## Solution 3: Preload adjacent images in GalleryLightbox

**File:** `cafetton-casero/src/components/moments/MomentsGallery.tsx` (inside `GalleryLightbox`)

When the lightbox opens at index `i`, or when the user navigates, preload `i+1` and `i-1` in the background:

```ts
useEffect(() => {
  const preload = (url: string | undefined) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  };
  const prev = moments[index - 1];
  const next = moments[index + 1];
  if (prev) preload(resolveFullUrl(prev, EVENTS_URL));
  if (next) preload(resolveFullUrl(next, EVENTS_URL));
}, [index, moments, EVENTS_URL]);
```

This fires on mount and every time `index` changes. `new Image().src = url` registers the URL in the browser cache — when the user navigates, the image is already downloaded.

Apply the same pattern to `MomentWall.tsx` lightbox if it has its own lightbox implementation.

---

## Solution 4: Blur-up transition in ImageWithLoader

**File:** `cafetton-casero/src/components/ImageWithLoader.tsx`

Enhance the existing fade-in with a simultaneous blur-to-clear transition:

```tsx
// Before:
className={`w-full h-full ${dynamicObjectClass} transition-opacity duration-500 ${
  loaded ? "opacity-100" : "opacity-0"
} ${className}`}

// After:
className={`w-full h-full ${dynamicObjectClass} transition-[opacity,filter] duration-500 ${
  loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm"
} ${className}`}
```

The `blur-sm` → `blur-0` transition gives a "coming into focus" feel as the image loads. Duration 500ms matches the existing opacity transition.

**Note:** `transition-[opacity,filter]` uses Tailwind's arbitrary value syntax for transitioning multiple properties simultaneously.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `SharedUploadPage.tsx` | +`tryConvertHeic()` + HEIC-to-JPEG conversion in `addFiles()` |
| `MomentsGallery.tsx` | `loading="lazy"` on all grid photo imgs + preload in `GalleryLightbox` |
| `MomentWall.tsx` | Preload in lightbox (if applicable) |
| `ImageWithLoader.tsx` | Blur-up CSS transition |

---

## Definition of Done

- [ ] HEIC files: on supported browsers, preview shows real photo within ~500ms; on unsupported, icon remains
- [ ] Converted HEIC → JPEG is uploaded (not original HEIC blob) on supported browsers
- [ ] All photo grid `<img>` tags have `loading="lazy" decoding="async"` (except first 6)
- [ ] Navigating lightbox to N+1/N-1 doesn't cause a loading spinner (image already cached)
- [ ] `ImageWithLoader` images blur from `blur-sm` to sharp on load
- [ ] `npx tsc --noEmit` zero errors in cafetton-casero
