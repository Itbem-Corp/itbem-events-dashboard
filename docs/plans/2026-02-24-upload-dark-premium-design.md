# Upload Page — Dark & Premium Redesign

**Date:** 2026-02-24
**File to modify:** `cafetton-casero/src/components/SharedUploadPage.tsx`
**Goal:** Transform the flat white upload page into a dark, premium, modern-app experience using glassmorphism, animated light blobs, glowing status rings, and a redesigned success screen.

---

## Approved Design Decisions

| Question | Answer |
|----------|--------|
| Visual style | Dark & premium (gray-950, glassmorphism, blobs) |
| Hero/background | Abstract — fixed dark blobs, always looks good without event cover |
| File grid | 3×3 square grid (current layout) improved with glass, glow rings per status |

---

## 1. Background Layer

**Always present, fixed, full-screen.**

Three ambient light blobs using `position: fixed`, `pointer-events-none`, `z-0`:

| Blob | Color | Size | Position | Blur |
|------|-------|------|----------|------|
| 1 | `violet-600/20` | 400×400px | top-left | `blur-[120px]` |
| 2 | `indigo-500/15` | 320×320px | top-right | `blur-[100px]` |
| 3 | `blue-600/10` | 360×360px | bottom-center | `blur-[140px]` |

Page background: `min-h-screen bg-gray-950`.
Blobs animate with a slow float keyframe (`@keyframes blob-float`) — each blob translates Y ±20px over 8–12s alternating, using `animation-delay` offsets so they don't pulse together.

---

## 2. Header (above the glass card)

```
┌──────────────────────────────┐
│  [ 📸 pill icon violet ]     │
│                              │
│  Comparte tus momentos       │  ← text-2xl font-bold text-white
│  Boda de Ana & Luis          │  ← badge bg-white/5 border-white/10
│  Sube hasta 10 fotos         │  ← text-sm text-gray-400
└──────────────────────────────┘
```

- Camera icon pill: `bg-violet-500/20 border border-violet-500/30 rounded-2xl p-3 mb-5`
- Event name badge: `inline-flex bg-white/5 border border-white/10 rounded-full text-xs text-gray-300 px-3 py-1`
- Heading: `text-2xl font-bold text-white tracking-tight`
- Subtitle: `text-sm text-gray-400`
- Stagger entry: icon (delay 0.05s) → heading (0.1s) → subtitle (0.15s), each `y: 12 → 0, opacity: 0 → 1`

---

## 3. Glass Card (main content container)

Wraps all upload UI (drop zone, file grid, description textarea, submit button):

```css
bg-white/[0.04]
backdrop-blur-xl
border border-white/[0.08]
rounded-3xl
shadow-2xl shadow-black/50
p-4 sm:p-6
```

Replaces the bare `<div>` that currently has no visual container.

---

## 4. Drop Zone — Empty State

Replace flat white dashed rect with dark glass dashed zone:

```
border-2 border-dashed border-white/20
rounded-2xl
bg-white/[0.02]
transition-all duration-200
```

**Drag-over state:**
```
border-violet-400/70
bg-violet-500/[0.08]
shadow-[inset_0_0_40px_rgba(139,92,246,0.12)]
```

**Upload icon container:** `bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-2xl p-3.5`
On drag-over the icon does `scale: 1 → 1.12` spring.

**Text:**
- Primary: `text-sm font-semibold text-white` ("Seleccionar de galería")
- Secondary: `text-xs text-gray-500` ("Fotos y videos · Máx 25 MB / 200 MB video")

**Compact drop zone** (when files are selected):
```
border-dashed border-white/15
rounded-xl py-3.5
bg-white/[0.02]
```
Plus icon: `text-violet-400`; text: `text-sm text-gray-400`

---

## 5. File Grid — 3×3 Square (improved)

Grid: `grid grid-cols-3 gap-2.5`

Each thumbnail card base:
```
relative aspect-square rounded-2xl overflow-hidden
ring-1 ring-white/10
bg-gray-800
transition-all duration-200
```

**Hover:** `ring-white/25 scale-[1.03]`

**Status ring glow system:**

| Status | Ring | Shadow glow |
|--------|------|-------------|
| pending | `ring-1 ring-white/10` | none |
| uploading | `ring-2 ring-amber-400/60` | `shadow-[0_0_14px_rgba(251,191,36,0.35)]` |
| done | `ring-2 ring-green-400/60` | `shadow-[0_0_14px_rgba(52,211,153,0.45)]` |
| error | `ring-2 ring-red-400/60` | `shadow-[0_0_14px_rgba(248,113,113,0.45)]` |

**"Add more" tile** (last slot when `files.length < MAX_FILES`):
```
border-2 border-dashed border-white/15
rounded-2xl aspect-square
flex flex-col items-center justify-center gap-1
bg-white/[0.02] hover:bg-violet-500/[0.06]
```
Plus icon: `text-violet-400 w-6 h-6`; label: `text-[10px] text-gray-500`

**Stagger entry animation:** each thumb `initial={{ opacity: 0, scale: 0.8 }}` → spring, delay `index * 0.04s`

---

## 6. Description Textarea

Replace white textarea with dark glass:

```
bg-white/[0.04]
border border-white/10
rounded-xl
text-white text-sm
placeholder-gray-600
focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20
```

Character count label: `text-xs text-gray-600`

---

## 7. Submit Button

Keep existing indigo→violet gradient, add glow:

```
shadow-[0_8px_32px_rgba(99,102,241,0.30)]
hover:shadow-[0_8px_40px_rgba(99,102,241,0.50)]
```

Loading state: three dot-pulse indicators (white dots, staggered opacity/scale animation) replacing the current spinner SVG.

---

## 8. Error / Warning Banners

| Type | Current | New |
|------|---------|-----|
| Error | `bg-red-50 text-red-600` | `bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl` |
| Warning (partial) | `bg-amber-50 border-amber-200` | `bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl` |

---

## 9. Success Screen

**Background:** Same dark + blobs (inherit from page).

**Badge:** `bg-gradient-to-br from-violet-500 to-indigo-500` with:
```
shadow-[0_0_60px_rgba(139,92,246,0.55)]
```

**Confetti:** 16 particles (up from 12), larger variety (4–10px), more color diversity including `#f472b6` (pink), some with slight blur for depth.

**Text colors:** `text-white` heading, `text-gray-400` body (not gray-900/gray-500).

**"Subir más" button:** same gradient with glow.

---

## 10. Coming Soon & Thank You Screens

Both use the shared dark + blobs background (no `bg-white` on their root div).

- **Coming Soon:** Camera icon pill with glass dark style, floating dots remain, text in `text-white` / `text-gray-400`.
- **Thank You:** Heart icon with violet glow, event name in white, moments link button with gradient.

---

## Scope

- **Only file:** `cafetton-casero/src/components/SharedUploadPage.tsx`
- No backend changes
- No new dependencies (framer-motion already in use)
- The CSS blob float animation can be a Tailwind `@keyframes` added via `tailwind.config` or inline `style` prop with CSS variables — prefer inline style to avoid touching config
- TypeScript check must pass after changes

---

## Definition of Done

- [ ] `bg-gray-950` full-page dark background with 3 light blobs
- [ ] Glass card wraps all upload UI
- [ ] Drop zone dark glass with violet drag-over glow
- [ ] Grid thumbnails with status glow rings
- [ ] All text adapted to white/gray-400 palette (no dark text on dark bg)
- [ ] Error/warning banners dark glass style
- [ ] Success screen dark + violet gradient badge
- [ ] Coming Soon / Thank You screens dark
- [ ] `npx tsc --noEmit` zero errors in cafetton-casero
