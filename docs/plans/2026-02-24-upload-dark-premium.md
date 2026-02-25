# Upload Page Dark & Premium Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform `SharedUploadPage.tsx` from a flat white form into a dark, premium, glassmorphic experience — without touching any upload logic.

**Architecture:** Pure visual/CSS changes inside a single React component. A shared `<DarkBackground>` sub-component renders the three ambient light blobs. Every screen (main, success, coming-soon, thank-you) reuses it. No new dependencies — framer-motion and Tailwind are already in use.

**Tech Stack:** React + framer-motion + Tailwind CSS (in `cafetton-casero`)

---

## Task 1: Add `DarkBackground` component + dark root on all screens

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx`

This component renders the fixed dark background with three animated light blobs. It is reused by every screen.

**Step 1:** Find the line right after the `ThankYouScreen` function ends (~line 1099) — it ends with `}` and a blank line. Add the following new component at the very bottom of the file (after `ThankYouScreen`):

```tsx
// ── Dark background with ambient light blobs ──────────────────────────────────

function DarkBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gray-950 pointer-events-none">
      {/* Blob 1 — violet, top-left */}
      <motion.div
        animate={{ y: [0, -24, 0] }}
        transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full bg-violet-600/20 blur-[120px]"
      />
      {/* Blob 2 — indigo, top-right */}
      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ repeat: Infinity, duration: 13, ease: "easeInOut", delay: 2 }}
        className="absolute top-10 -right-16 w-[320px] h-[320px] rounded-full bg-indigo-500/15 blur-[100px]"
      />
      {/* Blob 3 — blue, bottom-center */}
      <motion.div
        animate={{ y: [0, -16, 0] }}
        transition={{ repeat: Infinity, duration: 11, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full bg-blue-600/10 blur-[140px]"
      />
    </div>
  );
}
```

**Step 2:** In the **Invalid QR screen** (line ~500), change:
```tsx
<div className="min-h-screen flex items-center justify-center bg-white px-6">
  <p className="text-gray-400 text-sm text-center">Enlace inválido. Escanea el código QR de nuevo.</p>
</div>
```
to:
```tsx
<div className="min-h-screen flex items-center justify-center px-6 relative">
  <DarkBackground />
  <p className="text-gray-500 text-sm text-center">Enlace inválido. Escanea el código QR de nuevo.</p>
</div>
```

**Step 3:** In the **main UI return** (line ~530), change:
```tsx
<div className="min-h-screen bg-white flex flex-col">
```
to:
```tsx
<div className="min-h-screen flex flex-col relative">
  <DarkBackground />
```
Then find the closing `</div>` of that root div (line ~872) and close the fragment with an extra `</div>` — actually the existing closing div is fine, just add `<DarkBackground />` as the first child.

**Step 4:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep "SharedUploadPage"
```
Expected: no errors for this file.

**Step 5:** Commit:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): DarkBackground component — dark base + animated blobs"
```

---

## Task 2: Header — adapt text and icon to dark theme

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~540–567

**Step 1:** Replace the header icon container class from:
```tsx
className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-indigo-500/25 mb-5"
```
to:
```tsx
className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-violet-500/20 border border-violet-500/30 shadow-[0_0_40px_rgba(139,92,246,0.25)] mb-5"
```

**Step 2:** Change the heading class from:
```tsx
className="text-2xl font-bold text-gray-900 tracking-tight"
```
to:
```tsx
className="text-2xl font-bold text-white tracking-tight"
```

**Step 3:** Change the subtitle class from:
```tsx
className="mt-2 text-gray-400 text-sm max-w-[280px] mx-auto leading-relaxed"
```
to:
```tsx
className="mt-2 text-gray-500 text-sm max-w-[280px] mx-auto leading-relaxed"
```

**Step 4:** TypeScript check (same command as Task 1 Step 4). Expected: no new errors.

**Step 5:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): header dark theme — white heading, glow icon pill"
```

---

## Task 3: Glass card wrapper around main content

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~570–871

**Step 1:** Find `<main className="flex-1 px-3 sm:px-5 pb-10 max-w-md mx-auto w-full space-y-4">` and replace with:
```tsx
<main className="flex-1 px-3 sm:px-5 pb-10 pt-2 max-w-md mx-auto w-full">
  <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-2xl shadow-black/50 p-4 sm:p-6 space-y-4">
```

**Step 2:** Find the closing `</main>` of that block (~line 871) and add the closing `</div>` before it:
```tsx
  </div>
</main>
```

**Step 3:** TypeScript check. Expected: no errors.

**Step 4:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): glass card wrapper — bg-white/4 backdrop-blur-xl"
```

---

## Task 4: Drop zone dark treatment

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~688–742

### Empty state large drop zone

**Step 1:** Replace the drop zone `className` ternary (inside the `files.length === 0` branch) from:
```tsx
className={`cursor-pointer border-2 border-dashed rounded-3xl aspect-[4/3] flex flex-col items-center justify-center gap-4 transition-all ${
  dragOver
    ? "border-indigo-400 bg-indigo-50 scale-[1.01]"
    : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50"
}`}
```
to:
```tsx
className={`cursor-pointer border-2 border-dashed rounded-3xl aspect-[4/3] flex flex-col items-center justify-center gap-4 transition-all duration-200 ${
  dragOver
    ? "border-violet-400/70 bg-violet-500/[0.08] shadow-[inset_0_0_40px_rgba(139,92,246,0.12)] scale-[1.01]"
    : "border-white/20 hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
}`}
```

**Step 2:** Replace the upload icon container motion.div `className` (the `dragOver ? "bg-indigo-100" : "bg-gray-50"` one) from:
```tsx
className={`p-4 rounded-2xl transition-colors ${dragOver ? "bg-indigo-100" : "bg-gray-50"}`}
```
to:
```tsx
className={`p-4 rounded-2xl transition-colors ${dragOver ? "bg-violet-500/20" : "bg-gradient-to-br from-violet-500/15 to-indigo-500/15"}`}
```

**Step 3:** Change the upload icon `className` from:
```tsx
<IconUpload className={`w-8 h-8 ${dragOver ? "text-indigo-500" : "text-gray-300"}`} />
```
to:
```tsx
<IconUpload className={`w-8 h-8 ${dragOver ? "text-violet-300" : "text-violet-400/60"}`} />
```

**Step 4:** Change drop zone text classes — primary text:
```tsx
<p className="text-[15px] font-semibold text-gray-700">
```
to:
```tsx
<p className="text-[15px] font-semibold text-white">
```
And the subtitle:
```tsx
<p className="text-xs text-gray-400 mt-1">Fotos y videos · Máx. 25 MB fotos, 200 MB videos</p>
```
to:
```tsx
<p className="text-xs text-gray-500 mt-1">Fotos y videos · Máx. 25 MB fotos, 200 MB videos</p>
```

### Compact drop zone (has files)

**Step 5:** Replace the compact drop zone `className` ternary from:
```tsx
className={`cursor-pointer border-2 border-dashed rounded-2xl py-4 flex items-center justify-center gap-2 transition-all ${
  dragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50"
}`}
```
to:
```tsx
className={`cursor-pointer border-2 border-dashed rounded-2xl py-4 flex items-center justify-center gap-2 transition-all ${
  dragOver ? "border-violet-400/70 bg-violet-500/[0.08]" : "border-white/15 hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
}`}
```

**Step 6:** Change the compact drop zone Plus icon and text:
```tsx
<svg className="w-5 h-5 text-gray-400" ...
<span className="text-sm font-medium text-gray-500">
```
to:
```tsx
<svg className="w-5 h-5 text-violet-400" ...
<span className="text-sm font-medium text-gray-400">
```

### Camera button

**Step 7:** Replace the camera button class from:
```tsx
className="mt-2 w-full flex items-center justify-center gap-2.5 rounded-2xl border border-gray-200 py-3.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
```
to:
```tsx
className="mt-2 w-full flex items-center justify-center gap-2.5 rounded-2xl border border-white/10 py-3.5 text-sm font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 transition-colors"
```

**Step 8:** TypeScript check. Expected: no errors.

**Step 9:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): dark drop zone — glass dashed border, violet glow on drag"
```

---

## Task 5: File grid — dark cards + status glow rings

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~580–678

### Thumbnail card base

**Step 1:** Replace the thumbnail `motion.div` base class from:
```tsx
className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 group cursor-pointer"
```
to:
```tsx
className={`relative aspect-square rounded-2xl overflow-hidden bg-gray-800 group cursor-pointer transition-all duration-200 ${
  entry.status === 'uploading' ? 'ring-2 ring-amber-400/60 shadow-[0_0_14px_rgba(251,191,36,0.35)]' :
  entry.status === 'done'     ? 'ring-2 ring-green-400/60 shadow-[0_0_14px_rgba(52,211,153,0.45)]' :
  entry.status === 'error'    ? 'ring-2 ring-red-400/60 shadow-[0_0_14px_rgba(248,113,113,0.45)]' :
  'ring-1 ring-white/10 hover:ring-white/25 hover:scale-[1.02]'
}`}
```

### HEIC placeholder

**Step 2:** Change the HEIC gradient from light to dark:
```tsx
<div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 flex flex-col items-center justify-center gap-1">
  <svg className="w-6 h-6 text-gray-400" ...
  <p className="text-[9px] text-gray-500 font-medium">HEIC</p>
```
to:
```tsx
<div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800 flex flex-col items-center justify-center gap-1">
  <svg className="w-6 h-6 text-gray-500" ...
  <p className="text-[9px] text-gray-400 font-medium">HEIC</p>
```

### Description textarea

**Step 3:** Replace the textarea class from:
```tsx
className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 resize-none transition-all"
```
to:
```tsx
className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/40 resize-none transition-all"
```

**Step 4:** TypeScript check. Expected: no errors.

**Step 5:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): dark file grid — status glow rings, dark card bg, dark textarea"
```

---

## Task 6: Error / warning banners + progress bar dark

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~787–848

### Error banner

**Step 1:** Change error banner class from:
```tsx
className="rounded-xl bg-red-50 px-4 py-3 flex items-start gap-2"
```
to:
```tsx
className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-start gap-2"
```

**Step 2:** Change error icon color from `text-red-400` to `text-red-400` (same — already ok).

**Step 3:** Change error text color from:
```tsx
<p className="text-sm text-red-600 leading-relaxed">
```
to:
```tsx
<p className="text-sm text-red-300 leading-relaxed">
```

### Warning banner (partial success)

**Step 4:** Change warning banner class from:
```tsx
className="rounded-xl bg-amber-50 border border-amber-200/50 px-4 py-3 flex items-start gap-2.5"
```
to:
```tsx
className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-start gap-2.5"
```

**Step 5:** Change warning badge from `bg-amber-400` to `bg-amber-500/40 border border-amber-400/40`.

**Step 6:** Change warning heading text from:
```tsx
<p className="text-sm font-medium text-amber-800">
```
to:
```tsx
<p className="text-sm font-medium text-amber-300">
```

**Step 7:** Change warning subtitle from:
```tsx
<p className="text-xs text-amber-600 mt-0.5">
```
to:
```tsx
<p className="text-xs text-amber-400/80 mt-0.5">
```

### Progress bar

**Step 8:** Change progress bar track from:
```tsx
<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
```
to:
```tsx
<div className="h-2 bg-white/10 rounded-full overflow-hidden">
```

**Step 9:** Add glow to the progress fill by appending shadow to its className:
```tsx
className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
```
→ (no change needed here, the gradient fill already looks good on dark)

**Step 10:** Change progress status text from:
```tsx
<p className="text-xs text-gray-500 font-medium">
```
to:
```tsx
<p className="text-xs text-gray-400 font-medium">
```

**Step 11:** TypeScript check. Expected: no errors.

**Step 12:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): dark banners + progress bar — glass red/amber, white/10 track"
```

---

## Task 7: Submit button glow

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` line ~859

**Step 1:** Replace the submit button class from:
```tsx
className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none"
```
to:
```tsx
className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.55)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none"
```

**Step 2:** TypeScript check. Expected: no errors.

**Step 3:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): submit button indigo glow shadow"
```

---

## Task 8: SuccessScreen — dark premium

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~877–951

**Step 1:** Replace the root `div` class from:
```tsx
<div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
```
to:
```tsx
<div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
  <DarkBackground />
```

**Step 2:** Increase confetti from 12 to 16 particles and add 4 more colors. Replace:
```tsx
{Array.from({ length: 12 }).map((_, i) => (
```
to:
```tsx
{Array.from({ length: 16 }).map((_, i) => (
```
And change the color array from 6 to 8 colors:
```tsx
backgroundColor: ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa"][i % 6],
```
to:
```tsx
backgroundColor: ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#fb923c", "#e879f9"][i % 8],
```

**Step 3:** Change the badge from green to violet-indigo gradient with glow:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-8 shadow-lg shadow-green-500/30"
```
to:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(139,92,246,0.55)]"
```

**Step 4:** Change heading color from:
```tsx
<h2 className="text-2xl font-bold text-gray-900 tracking-tight">
```
to:
```tsx
<h2 className="text-2xl font-bold text-white tracking-tight">
```

**Step 5:** Change body text from:
```tsx
<p className="text-gray-500 text-sm max-w-[280px] mx-auto leading-relaxed">
```
to:
```tsx
<p className="text-gray-400 text-sm max-w-[280px] mx-auto leading-relaxed">
```

**Step 6:** Change footer italic from:
```tsx
className="text-gray-400 text-xs italic"
```
to:
```tsx
className="text-gray-500 text-xs italic"
```

**Step 7:** TypeScript check. Expected: no errors.

**Step 8:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): SuccessScreen dark — violet badge glow, 16 confetti, white text"
```

---

## Task 9: ComingSoonScreen — dark

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~953–1043

**Step 1:** Replace root div:
```tsx
<div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
```
to:
```tsx
<div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
  <DarkBackground />
```

**Step 2:** The floating dots use purple/lavender colors — update them to be slightly brighter for visibility on dark:
```tsx
backgroundColor: ['#c4b5fd', '#a5b4fc', '#e9d5ff', '#ddd6fe', '#c7d2fe'][i % 5],
```
to:
```tsx
backgroundColor: ['#a78bfa', '#818cf8', '#c084fc', '#6366f1', '#8b5cf6'][i % 5],
```
And increase their opacity range:
```tsx
opacity: [0.15, 0.35, 0.15],
```
to:
```tsx
opacity: [0.25, 0.55, 0.25],
```

**Step 3:** Change the icon container shadow to match dark:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/25"
```
to:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.45)]"
```

**Step 4:** Update pulse ring color:
```tsx
className="absolute inset-0 rounded-full border-2 border-indigo-300"
```
to:
```tsx
className="absolute inset-0 rounded-full border-2 border-violet-400/60"
```

**Step 5:** Change heading + body text to white:
```tsx
<h2 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">
```
to:
```tsx
<h2 className="text-2xl font-bold text-white tracking-tight leading-tight">
```

```tsx
className="text-gray-400 text-sm leading-relaxed"
```
(already gray-400 — fine on dark background, no change needed)

**Step 6:** Change the loading dots color and label:
```tsx
className="w-1.5 h-1.5 rounded-full bg-indigo-400"
```
to:
```tsx
className="w-1.5 h-1.5 rounded-full bg-violet-400"
```

**Step 7:** TypeScript check. Expected: no errors.

**Step 8:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): ComingSoonScreen dark — violet glow, brighter dots, white heading"
```

---

## Task 10: ThankYouScreen — dark

**File:**
- Modify: `cafetton-casero/src/components/SharedUploadPage.tsx` lines ~1046–1099

**Step 1:** Replace root div:
```tsx
<div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
```
to:
```tsx
<div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
  <DarkBackground />
```

**Step 2:** Update star decoration colors to be more visible on dark (increase brightness):
```tsx
className="absolute text-amber-300/40 text-lg pointer-events-none"
```
to:
```tsx
className="absolute text-amber-300/60 text-lg pointer-events-none"
```
And opacity range:
```tsx
animate={{ y: [0, -12, 0], opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
```
to:
```tsx
animate={{ y: [0, -12, 0], opacity: [0.3, 0.7, 0.3], scale: [1, 1.2, 1] }}
```

**Step 3:** Add glow to the heart badge:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-8 shadow-lg shadow-amber-500/20"
```
to:
```tsx
className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(251,146,60,0.45)]"
```

**Step 4:** Change heading to white:
```tsx
<h2 className="text-2xl font-bold text-gray-900 tracking-tight">
```
to:
```tsx
<h2 className="text-2xl font-bold text-white tracking-tight">
```

**Step 5:** Change event name from `text-gray-600` to `text-gray-300`:
```tsx
className="text-lg font-medium text-gray-600"
```
to:
```tsx
className="text-lg font-medium text-gray-300"
```

**Step 6:** Change body text — already `text-gray-400`, fine on dark. No change.

**Step 7:** TypeScript check. Expected: no errors.

**Step 8:** Commit:
```bash
git add src/components/SharedUploadPage.tsx
git commit -m "feat(upload): ThankYouScreen dark — white heading, amber glow, brighter stars"
```

---

## Task 11: Final verification

**Step 1:** Full TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -v "astro.config"
```
Expected: zero errors related to SharedUploadPage.

**Step 2:** Visual scan — grep for any remaining `bg-white` that shouldn't be white:
```bash
grep -n "bg-white[^/]" src/components/SharedUploadPage.tsx
```
Expected: only `bg-white/[0.04]` (glass card), `bg-white/10` (lightbox info bar), `bg-white/20` (lightbox close button hover) — all intentional glass effects. If you see a bare `bg-white`, replace with `bg-gray-950`.

**Step 3:** Grep for remaining light-mode text colors that would be invisible on dark:
```bash
grep -n "text-gray-900\|text-gray-800\|text-gray-700" src/components/SharedUploadPage.tsx
```
Expected: zero matches (all should have been replaced). If any remain, change to `text-white` or `text-gray-200` as appropriate.

**Step 4:** Commit docs update:
```bash
cd C:/Users/AndBe/Desktop/Projects/dashboard-ts
git add docs/
git commit -m "docs: upload dark premium plan — mark implemented"
```
