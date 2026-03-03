# Core Web Vitals — LCP + INP Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the two Cloudflare-confirmed Core Web Vitals issues: LCP driven by a lazy-loaded footer SVG (P75: 2276ms, P99: 4584ms) and INP on the upload button (224ms, threshold: 200ms).

**Architecture:** Two targeted, surgical changes — one in `Footer.tsx` (cafetton-casero) and one in `SharedUploadPage.tsx` (cafetton-casero). No new dependencies. No visual design changes. CLS is already 100% — no action needed.

**Tech Stack:** React 18, TypeScript, Framer Motion, `flushSync` from react-dom, Tailwind CSS

---

## Root Cause Summary

| Metric | Element | Root Cause |
|--------|---------|-----------|
| **LCP** | `img` in `Footer.tsx` → `/backgrounds/vectores-03.svg` | `loading="lazy"` defers the fetch; `<motion.footer initial={{ opacity: 0 }}>` hides it for 800ms — browser's LCP timer doesn't stop until opacity > 0 |
| **INP** | Upload button `onClick={handleUpload}` | React 18 batches `setUploading(true)` + `setError("")` — no synchronous paint before heavy JS runs; user gets no visual feedback for 224ms |

---

## Task 1: LCP Fix — Footer.tsx

**Cloudflare confirmed element:** `img.w-[160px].sm:w-[200px].md:w-[240px]` → `vectores-03.svg`

**Files:**
- Modify: `cafetton-casero/src/components/common/Footer.tsx`

### Step 1: Read the file

Read `cafetton-casero/src/components/common/Footer.tsx` before editing.

Current state (lines 14–28):
```tsx
<motion.footer
  className="relative bg-white border-t mt-16 py-10 text-gray-600 text-sm overflow-hidden"
  initial={{ opacity: 0, y: 40 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: "easeOut" }}
>
  ...
  <img
    src="/backgrounds/vectores-03.svg"
    alt="eventiapp 2025 by itbem"
    className="w-[160px] sm:w-[200px] md:w-[240px]"
    loading="lazy"
    decoding="async"
  />
```

### Step 2: Fix the `<motion.footer>` animation — remove opacity, keep slide

Change `initial` and `animate` to only use `y` (no `opacity`). This keeps the slide-in animation visually intact while letting the browser paint the footer content immediately.

```tsx
// BEFORE:
initial={{ opacity: 0, y: 40 }}
animate={{ opacity: 1, y: 0 }}

// AFTER:
initial={{ y: 40 }}
animate={{ y: 0 }}
```

### Step 3: Fix the LCP `<img>` — eager load + high priority

Change the logo img from lazy-deferred to high-priority:

```tsx
// BEFORE:
<img
  src="/backgrounds/vectores-03.svg"
  alt="eventiapp 2025 by itbem"
  className="w-[160px] sm:w-[200px] md:w-[240px]"
  loading="lazy"
  decoding="async"
/>

// AFTER:
<img
  src="/backgrounds/vectores-03.svg"
  alt="eventiapp 2025 by itbem"
  className="w-[160px] sm:w-[200px] md:w-[240px]"
  loading="eager"
  fetchpriority="high"
  decoding="async"
/>
```

> **Why `fetchpriority="high"`:** Cloudflare confirmed this is the LCP element. `fetchpriority="high"` moves it to the browser's high-priority fetch queue, skipping bandwidth contention with other resources. The SVG is only 9KB so it will load in <100ms on any connection.

> **Why remove `loading="lazy"`:** `loading="lazy"` is correct for off-screen images, but catastrophically wrong for the LCP element — it instructs the browser to defer loading until the element approaches the viewport, adding hundreds of milliseconds to LCP.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors. (This is a JSX attribute change — no type risk, but always verify.)

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/common/Footer.tsx
git commit -m "perf(lcp): footer logo eager+high-priority, remove opacity animation — LCP fix"
```

---

## Task 2: INP Fix — SharedUploadPage.tsx

**Cloudflare confirmed element:** `button.w-full.rounded-2xl.bg-gradient-to-r.from-indigo-600.to-violet-600...` → `onClick={handleUpload}`

**Files:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

### Step 1: Read the handleUpload function

Read `SharedUploadPage.tsx`. Find `const handleUpload = async () => {` (around line 742). Current start:

```ts
const handleUpload = async () => {
  if (files.length === 0 || !identifier || uploading) return;
  setUploading(true);
  setError("");
  // ... heavy processing
```

### Step 2: Add `flushSync` import

At the top of the file, find the React import. The file likely has:
```ts
import { useCallback, useEffect, useRef, useState } from 'react'
```

Add `flushSync` from `react-dom`. This is a separate package, not from `react`:

```ts
import { flushSync } from 'react-dom'
```

> **What `flushSync` does:** Forces React to flush pending state updates synchronously to the DOM before returning. Normally React batches updates and paints asynchronously — `flushSync` breaks that batching for the wrapped block, ensuring the button shows its loading state (spinner/disabled) in the same frame as the click. This is the standard React-approved pattern for INP optimization.

### Step 3: Wrap the initial state updates in `flushSync`

Replace the first two state-setter lines in `handleUpload`:

```ts
// BEFORE:
const handleUpload = async () => {
  if (files.length === 0 || !identifier || uploading) return;
  setUploading(true);
  setError("");

// AFTER:
const handleUpload = async () => {
  if (files.length === 0 || !identifier || uploading) return;
  flushSync(() => {
    setUploading(true);
    setError("");
  });
```

> **Important:** Only the immediate visual feedback calls go inside `flushSync`. Everything else (the async upload logic below) stays exactly as-is. Do NOT wrap async operations in `flushSync`.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
```

Expected: zero errors.

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "perf(inp): flushSync on upload button state — forces immediate paint on click"
```

---

## Final Verification + Push

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config.mjs"
npm run build
git push origin main
```

Expected: zero TypeScript errors, build succeeds, push succeeds.

---

## Expected Impact (after Cloudflare re-measures in ~24h)

| Metric | Before | Expected After |
|--------|--------|----------------|
| LCP P75 | 2276ms (Needs improvement) | <1200ms (Good) |
| LCP P99 | 4584ms (Bad) | <2500ms (Good/borderline) |
| LCP Bad % | 4% | ~0% |
| INP 224ms | 14% Needs improvement | ~0% Needs improvement |

---

## Files Changed Summary

| File | Change |
|------|--------|
| `cafetton-casero/src/components/common/Footer.tsx` | Remove `opacity` from motion animation; `loading="eager"` + `fetchpriority="high"` on logo img |
| `cafetton-casero/src/components/SharedUploadPage.tsx` | `flushSync` wrapping initial state updates in `handleUpload` |
