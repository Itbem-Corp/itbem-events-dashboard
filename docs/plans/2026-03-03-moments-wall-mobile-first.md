# MomentsWall Mobile-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make MomentsWall fully usable on phone (390px), tablet (768px), and desktop with progressive disclosure — 2-row toolbar + scrollable filter tabs on mobile, full toolbar on tablet+.

**Architecture:** Progressive-disclosure pattern: a new `BottomSheet` UI component holds secondary actions on mobile. The existing toolbar rows become `hidden md:flex`; a new compact mobile row replaces them on `< md`. Filter tabs get horizontal scroll. Grid gains `md` and `xl` breakpoints. Lightbox actions move to a bottom bar on mobile.

**Tech Stack:** Next.js 15, Tailwind CSS, Framer Motion (`motion`), Vitest + React Testing Library

---

### Task 1: BottomSheet UI component

**Files:**
- Create: `src/components/ui/bottom-sheet.tsx`
- Create: `tests/unit/components/ui/bottom-sheet.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/unit/components/ui/bottom-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from '@/components/ui/bottom-sheet'

describe('BottomSheet', () => {
  it('renders children when open', () => {
    render(
      <BottomSheet isOpen onClose={() => {}}>
        <div>Sheet content</div>
      </BottomSheet>
    )
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={() => {}}>
        <div>Sheet content</div>
      </BottomSheet>
    )
    expect(screen.queryByText('Sheet content')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen onClose={onClose}>
        <div>content</div>
      </BottomSheet>
    )
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders title when provided', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="Más acciones">
        <div>content</div>
      </BottomSheet>
    )
    expect(screen.getByText('Más acciones')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- bottom-sheet
```

Expected: 4 failures — `BottomSheet` not defined.

**Step 3: Implement BottomSheet**

```tsx
// src/components/ui/bottom-sheet.tsx
'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            data-testid="bottom-sheet-backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-zinc-900 border-t border-white/10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {title && (
              <p className="px-4 py-2 text-sm font-semibold text-zinc-300 border-b border-white/5">
                {title}
              </p>
            )}
            <div className="px-2 py-2 max-h-[70vh] overflow-y-auto pb-safe">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Reusable row item for inside a BottomSheet
interface SheetRowProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  trailing?: React.ReactNode
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export function SheetRow({ icon, label, onClick, trailing, variant = 'default', disabled }: SheetRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-zinc-200 hover:bg-white/5'
      }`}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- bottom-sheet
```

Expected: 4 passing.

**Step 5: Commit**

```bash
git add src/components/ui/bottom-sheet.tsx tests/unit/components/ui/bottom-sheet.test.tsx
git commit -m "feat(ui): BottomSheet + SheetRow components for mobile overflow actions"
```

---

### Task 2: Filter tabs — horizontal scroll

**Files:**
- Modify: `src/components/events/moments-wall.tsx:1898,1908–1931`

**Step 1: Write the failing test**

In `tests/unit/components/events/moments-wall.test.tsx` (or create if missing), add:

```tsx
it('tablist has overflow-x-auto class for horizontal scroll', () => {
  // render MomentsWall with moments ...
  const tablist = screen.getByRole('tablist')
  expect(tablist.className).toContain('overflow-x-auto')
})

it('each tab has flex-shrink-0 so it does not compress', () => {
  const tabs = screen.getAllByRole('tab')
  tabs.forEach(tab => expect(tab.className).toContain('flex-shrink-0'))
})
```

**Step 2: Run to verify failure**

```bash
npm run test:unit -- moments-wall
```

Expected: 2 new failures.

**Step 3: Apply changes**

In `moments-wall.tsx`, find line 1898:
```tsx
// BEFORE
<div role="tablist" className="flex">
```
Change to:
```tsx
// AFTER
<div role="tablist" className="flex overflow-x-auto scrollbar-hide">
```

Find line 1908 (the tab `<button>`), change `flex-1 sm:flex-initial` to `flex-shrink-0`:
```tsx
// BEFORE
className={clsx(
  'flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors text-center',
  ...
)}

// AFTER
className={clsx(
  'flex-shrink-0 px-4 py-2 sm:py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
  ...
)}
```

> `scrollbar-hide` is a Tailwind utility from `tailwind-scrollbar-hide`. Check `tailwind.config.ts` — if the plugin is not installed, add `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` inline instead: `className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"`.

**Step 4: Run tests**

```bash
npm run test:unit -- moments-wall
```

**Step 5: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(moments-wall): filter tabs horizontal scroll — flex-shrink-0, overflow-x-auto"
```

---

### Task 3: Grid density — add `md` and `xl` breakpoints

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — lines 1535, 2071, 2102, 2143

**Step 1: No behavior test needed** — this is pure CSS. Verify visually after.

**Step 2: Apply changes — 4 lines, same pattern each**

Find all 4 occurrences of `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` and replace each with:

```
grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5
```

Line 1535 (skeleton):
```tsx
// BEFORE
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
// AFTER
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
```

Line 2071 (grouped grid):
```tsx
// BEFORE
<motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
// AFTER
<motion.div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1 sm:gap-1.5" layout>
```

Line 2102 (drag grid):
```tsx
// BEFORE
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
// AFTER
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1 sm:gap-1.5">
```

Line 2143 (flat grid):
```tsx
// BEFORE
<motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
// AFTER
<motion.div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1 sm:gap-1.5" layout>
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(moments-wall): grid md:4-cols xl:5-cols — tablet and wide desktop density"
```

---

### Task 4: Card action bar — thinner on mobile

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — lines 794, 810, 825

The approve, unapprove, and delete buttons currently use `py-3.5` on all screen sizes. On mobile the bar is always visible and `py-3.5` makes it tall. Reduce to `py-2` on mobile, keep `py-3.5` on `sm+`.

**Step 1: Apply changes**

Line 794 (approve button):
```tsx
// BEFORE
className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs ..."
// AFTER
className="flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-3.5 text-xs ..."
```

Line 810 (unapprove button):
```tsx
// BEFORE
className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs ..."
// AFTER
className="flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-3.5 text-xs ..."
```

Line 825 (delete button):
```tsx
// BEFORE
className={clsx(
  'flex items-center justify-center gap-1.5 py-3.5 text-xs ...',
  approved || isFailed ? 'flex-1' : 'px-4',
)}
// AFTER
className={clsx(
  'flex items-center justify-center gap-1.5 py-2 sm:py-3.5 text-xs ...',
  approved || isFailed ? 'flex-1' : 'px-4',
)}
```

**Step 2: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(moments-wall): card action bar py-2 on mobile (was py-3.5 all sizes)"
```

---

### Task 5: Modal padding fix — QR and WallShare

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — lines 415, 499

Both modals have `w-full max-w-sm` on the inner panel. On 390px this leaves ~3px margin. Fix: add `mx-4` so there's always 16px margin on each side.

**Step 1: Apply changes**

Line 415 (QRModal inner panel):
```tsx
// BEFORE
className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl"
// AFTER
className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm mx-4 flex flex-col items-center gap-4 shadow-2xl"
```

Line 499 (WallShareModal inner panel):
```tsx
// BEFORE
className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl"
// AFTER
className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm mx-4 flex flex-col items-center gap-4 shadow-2xl"
```

**Step 2: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(moments-wall): modal mx-4 padding — prevents edge overflow on 390px phones"
```

---

### Task 6: Lightbox — actions bottom bar on mobile

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — lines 221–315 (lightbox controls)

**Goal:** On mobile (`< md`), the top bar shrinks to only close + counter. Approve, delete, download move to a sticky bottom bar.

**Step 1: Read the current lightbox controls section**

Read lines 221–320 of `src/components/events/moments-wall.tsx` to get the exact current markup.

**Step 2: Restructure**

Replace the existing top controls bar and add a bottom actions bar. The lightbox component is a large `motion.div`. Inside it:

**Top bar (keep, simplified on mobile):**
```tsx
{/* Top bar — close + counter only on mobile, full controls on md+ */}
<div
  className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
  onClick={(e) => e.stopPropagation()}
>
  {/* Counter — always visible */}
  <span className="text-xs text-white/70 tabular-nums">
    {lightboxIndex != null ? lightboxIndex + 1 : 0} / {displayedMoments.length}
  </span>

  {/* Desktop-only: zoom + action buttons */}
  <div className="hidden md:flex items-center gap-1 sm:gap-2 shrink-0">
    {/* ... keep ALL existing zoom / approve / delete / download / close buttons here ... */}
  </div>

  {/* Mobile-only: just close button */}
  <button
    type="button"
    onClick={() => setLightboxIndex(null)}
    className="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
    aria-label="Cerrar"
  >
    <IconX className="w-4 h-4" />
  </button>
</div>
```

**Bottom actions bar (mobile only, below media):**

Insert this AFTER the media `<div>` and BEFORE the closing of the lightbox container:
```tsx
{/* Mobile bottom action bar — md:hidden */}
<div
  className="md:hidden absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent z-10"
  onClick={(e) => e.stopPropagation()}
>
  {lightboxMoment && !lightboxMoment.is_approved && lightboxMoment.processing_status !== 'failed' && (
    <button
      type="button"
      onClick={() => handleApprove(lightboxMoment)}
      className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-lime-500/20 hover:bg-lime-500/30 text-lime-300 text-sm font-semibold transition-colors"
    >
      <IconCheck className="w-4 h-4" />
      Aprobar
    </button>
  )}
  {lightboxMoment?.is_approved && (
    <button
      type="button"
      onClick={() => handleUnapprove(lightboxMoment)}
      className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-semibold transition-colors"
    >
      <IconX className="w-4 h-4" />
      Quitar
    </button>
  )}
  <button
    type="button"
    onClick={() => lightboxMoment && handleDelete(lightboxMoment.id)}
    className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors"
    aria-label="Eliminar"
  >
    <IconTrash className="w-4 h-4" />
  </button>
  <a
    href={lightboxMoment ? resolveUrl(lightboxMoment) ?? '' : ''}
    download
    className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
    aria-label="Descargar"
  >
    <IconDownload className="w-4 h-4" />
  </a>
</div>
```

> **Note:** Look up the exact handler names (e.g., `handleApprove`, `handleDelete`) in the component — they may be named differently. Search for where the approve button in the existing top bar calls its `onClick` and replicate those calls.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(moments-wall): lightbox bottom action bar on mobile — top bar slim on phones"
```

---

### Task 7: Toolbar — mobile 2-row + bottom sheet

**Files:**
- Modify: `src/components/events/moments-wall.tsx` — lines 1549 (Row 1), 1797 (Row 2)
- Import: `BottomSheet`, `SheetRow` from `@/components/ui/bottom-sheet`

This is the largest change. The approach: keep Rows 1 and 2 exactly as they are but add `hidden md:flex` to both so they only show on tablet+. Then insert a new compact mobile row above Row 1 that shows on `< md` only (`flex md:hidden`).

**Step 1: Add `showMoreSheet` state**

At the top of the component (near other state declarations, around line 314), add:
```tsx
const [showMoreSheet, setShowMoreSheet] = useState(false)
```

**Step 2: Add `hidden md:flex` to existing toolbar rows**

Line 1549 Row 1: change `flex flex-wrap` → `hidden md:flex flex-wrap`
```tsx
// BEFORE
<div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5">
// AFTER
<div className="hidden md:flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5">
```

Line 1797 Row 2: change `flex flex-wrap` → `hidden md:flex flex-wrap`
```tsx
// BEFORE
<div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/5 border-l-2 border-l-indigo-500/30">
// AFTER
<div className="hidden md:flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/5 border-l-2 border-l-indigo-500/30">
```

**Step 3: Insert the mobile compact row**

Insert this block BEFORE the existing Row 1 div (before line 1549):

```tsx
{/* ── Mobile-only compact toolbar (hidden on md+) ──────────────────── */}
<div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-white/5">
  {/* Count */}
  <span className="flex-1 min-w-0 text-xs text-zinc-400 truncate">
    {filteredMoments.length} momentos
  </span>

  {/* Select mode toggle */}
  <button
    type="button"
    onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()) }}
    className={clsx(
      'flex items-center justify-center w-9 h-9 rounded-lg text-xs font-medium transition-colors',
      selectMode
        ? 'bg-indigo-600 text-white'
        : 'bg-white/10 text-zinc-300 hover:bg-white/15',
    )}
    aria-label={selectMode ? 'Cancelar selección' : 'Seleccionar'}
  >
    <IconCheckbox className="w-4 h-4" />
  </button>

  {/* ZIP download — icon only */}
  <button
    type="button"
    onClick={() => setShowZipMenu(v => !v)}
    disabled={downloadingZip || moments.length === 0}
    className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-zinc-300 hover:bg-white/15 transition-colors disabled:opacity-40"
    aria-label="Descargar ZIP"
  >
    {downloadingZip
      ? <IconLoader2 className="w-4 h-4 animate-spin" />
      : <IconDownload className="w-4 h-4" />}
  </button>

  {/* Approve all (only when pending exist) */}
  {pendingCount > 0 && !selectMode && (
    <button
      type="button"
      onClick={handleApproveAll}
      disabled={approvingAll}
      className="flex items-center justify-center w-9 h-9 rounded-lg bg-lime-500/20 text-lime-300 hover:bg-lime-500/30 transition-colors disabled:opacity-40"
      aria-label="Aprobar todos"
    >
      {approvingAll
        ? <IconLoader2 className="w-4 h-4 animate-spin" />
        : <IconCheck className="w-4 h-4" />}
    </button>
  )}

  {/* Approve/Delete selection (when selectMode has selection) */}
  {selectMode && selectedIds.size > 0 && (
    <>
      <button
        type="button"
        onClick={handleApproveSelected}
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-lime-500/20 text-lime-300 hover:bg-lime-500/30 transition-colors"
        aria-label="Aprobar selección"
      >
        <IconCheck className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={handleDeleteSelected}
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
        aria-label="Eliminar selección"
      >
        <IconTrash className="w-4 h-4" />
      </button>
    </>
  )}

  {/* ⋯ More actions */}
  <button
    type="button"
    onClick={() => setShowMoreSheet(true)}
    className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-zinc-300 hover:bg-white/15 transition-colors"
    aria-label="Más acciones"
  >
    <IconDots className="w-4 h-4" />
  </button>
</div>

{/* Bottom sheet for mobile secondary actions */}
<BottomSheet
  isOpen={showMoreSheet}
  onClose={() => setShowMoreSheet(false)}
  title="Acciones"
>
  {pendingCount > 0 && (
    <SheetRow
      icon={<IconX className="w-4 h-4" />}
      label={`Rechazar todos (${pendingCount} pendientes)`}
      variant="danger"
      disabled={rejectingAll}
      onClick={() => { setShowMoreSheet(false); handleRejectAll() }}
    />
  )}
  <SheetRow
    icon={<IconQrcode className="w-4 h-4" />}
    label="QR de carga"
    trailing={
      <span className={clsx('text-xs font-medium', shareEnabled ? 'text-lime-400' : 'text-zinc-500')}>
        {shareEnabled ? 'Activo' : 'Inactivo'}
      </span>
    }
    onClick={() => { setShowMoreSheet(false); setShowQR(true) }}
  />
  <SheetRow
    icon={<IconEye className="w-4 h-4" />}
    label="Publicar muro"
    trailing={
      <span className={clsx('text-xs font-medium', wallPublished ? 'text-lime-400' : 'text-zinc-500')}>
        {wallPublished ? 'Publicado' : 'Oculto'}
      </span>
    }
    onClick={() => { setShowMoreSheet(false); handleToggleWall() }}
  />
  <SheetRow
    icon={<IconExternalLink className="w-4 h-4" />}
    label="Ver muro público"
    onClick={() => { setShowMoreSheet(false); /* open wall link */ }}
  />
  <SheetRow
    icon={<IconCalendarTime className="w-4 h-4" />}
    label="Agrupar por hora"
    trailing={
      <span className={clsx('text-xs font-medium', groupByTime ? 'text-indigo-400' : 'text-zinc-500')}>
        {groupByTime ? 'Activo' : 'Inactivo'}
      </span>
    }
    onClick={() => { setShowMoreSheet(false); setGroupByTime(v => !v) }}
  />
  <SheetRow
    icon={<IconShare className="w-4 h-4" />}
    label="Compartir muro"
    onClick={() => { setShowMoreSheet(false); setShowWallShare(true) }}
  />
  {legacyCount > 0 && (
    <SheetRow
      icon={<IconRefresh className="w-4 h-4" />}
      label={`Reoptimizar legacy (${legacyCount})`}
      disabled={requeuingLegacy}
      onClick={() => { setShowMoreSheet(false); handleRequeueLegacy() }}
    />
  )}
</BottomSheet>
```

> **Icon names:** Check the existing imports at the top of `moments-wall.tsx` for the exact icon component names used (e.g., `IconDots`, `IconCheckbox`, `IconQrcode`). If `IconDots` is not imported, find the equivalent — search for `...` or `DotsHorizontal` in the current imports.

> **Handler names:** Find the exact handler names in the component:
> - "Reject all" handler — search for `rejectingAll` setter call to find the function name
> - "Toggle wall" handler — search for `wallPublished` setter call
> - "Requeue legacy" handler — search for `requeuingLegacy` setter call

**Step 4: Add import at top of file**

Find the existing imports in `moments-wall.tsx` and add:
```tsx
import { BottomSheet, SheetRow } from '@/components/ui/bottom-sheet'
```

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors before continuing. Common issues:
- `showMoreSheet` state not declared → add to state section
- Handler names don't match → look up correct names in component
- Icon not found → find equivalent in existing imports

**Step 6: Run unit tests**

```bash
npm run test:unit
```

Expected: all existing tests still pass.

**Step 7: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments-wall): mobile 2-row toolbar + bottom sheet for secondary actions"
```

---

### Task 8: TypeScript + tests + build verification

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Fix any that appear.

**Step 2: All unit tests**

```bash
npm run test:unit
```

Expected: all pass including new BottomSheet tests.

**Step 3: Production build**

```bash
npm run build
```

Expected: build succeeds with 0 errors.

**Step 4: Final commit if any cleanup needed**

```bash
git add -p   # stage only relevant changes
git commit -m "fix(moments-wall): mobile-first cleanup — tsc + build green"
```

**Step 5: Push**

```bash
git push origin main
```

---

## Manual Verification Checklist

After implementation, verify on each device:

**Phone (390px — Chrome DevTools iPhone 14):**
- [ ] Toolbar shows 2 rows only (compact row + filter tabs)
- [ ] Filter tabs scroll horizontally, no truncation
- [ ] Tapping `⋯ Más` opens bottom sheet from bottom
- [ ] Bottom sheet items trigger correct actions and close sheet
- [ ] Card action bar is shorter (py-2)
- [ ] Lightbox shows bottom action bar for approve/delete/download
- [ ] QR modal has visible margin on sides

**Tablet (768px — Chrome DevTools iPad):**
- [ ] Toolbar shows 3 rows (rows 1+2 visible, compact row hidden)
- [ ] Grid shows 4 columns
- [ ] Filter tabs scroll if > 5 tabs

**Desktop (1280px+):**
- [ ] All 4 toolbar rows visible
- [ ] Grid shows 5 columns
- [ ] Lightbox top bar unchanged
