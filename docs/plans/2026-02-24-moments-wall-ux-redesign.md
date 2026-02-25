# MomentsWall UX Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all MomentsWall bugs (video CSP, QR download logo, lightbox download) and deliver top-tier UX improvements (notes visibility, QR open-link button, WallShareModal tabs, toolbar reorganization).

**Architecture:** Surgical fixes across `next.config.mjs`, `src/components/ui/branded-qr.tsx`, and `src/components/events/moments-wall.tsx`. No structural rewrites — add, fix, polish.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, qrcode.react, Heroicons, Vitest + React Testing Library

**Design doc:** `docs/plans/2026-02-24-moments-wall-ux-redesign-design.md`

---

## Task 1: Fix CSP — add `media-src` and `us-east-2`

**Files:**
- Modify: `next.config.mjs`

Videos are blocked because `media-src` is absent from the CSP. When absent, browsers fall back to `default-src 'self'`, blocking all S3 video URLs silently.

**Step 1: Add `us-east-2` and `media-src` to `next.config.mjs`**

In `next.config.mjs`, find the `awsSources` array and the `csp` array. Make these two changes:

```js
const awsSources = [
  'https://*.amazonaws.com',
  'https://*.s3.amazonaws.com',
  'https://*.s3.us-east-1.amazonaws.com',
  'https://*.s3.us-east-2.amazonaws.com',   // ADD: Ohio bucket
  'https://*.s3.us-west-2.amazonaws.com',
  'https://*.cloudfront.net',
].join(' ')

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${awsSources}`,
  `media-src 'self' blob: ${awsSources}`,    // ADD: allows S3 video playback
  "font-src 'self'",
  `connect-src 'self' ${backendUrl} ${awsSources}`,
  `frame-src 'self' ${astroUrl}`,
  "frame-ancestors 'none'",
].join('; ')
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "fix(csp): add media-src directive and us-east-2 S3 region for video playback"
```

---

## Task 2: Copy eventiapp icon SVG to public/

**Files:**
- Create: `public/eventiapp-icon.svg` (copied from `../../cafetton-casero/public/favicon.svg`)

The pink eventiapp brand icon must be at `/eventiapp-icon.svg` so the QR `imageSettings` can reference it.

**Step 1: Read the source file**

Read `C:\Users\AndBe\Desktop\Projects\cafetton-casero\public\favicon.svg` in full.

**Step 2: Write it to the dashboard public folder**

Write the exact SVG content to `C:\Users\AndBe\Desktop\Projects\dashboard-ts\public\eventiapp-icon.svg`.

**Step 3: Verify file exists**

```bash
ls public/eventiapp-icon.svg
```
Expected: file listed.

**Step 4: Commit**

```bash
git add public/eventiapp-icon.svg
git commit -m "feat(assets): add eventiapp pink brand icon for QR center logo"
```

---

## Task 3: Fix BrandedQR — logo in download + sharper size

**Files:**
- Modify: `src/components/ui/branded-qr.tsx`

**Root cause:** The hidden `QRCodeCanvas` (used for hi-res PNG generation) has no `imageSettings`, so the downloaded PNG lacks the center logo. Also `downloadSize = 1024` — increase to `1200` for sharper output.

**Step 1: Write failing test**

In `tests/unit/components/branded-qr.test.tsx` (create if not exists):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) =>
    <div data-testid="qr-svg" data-value={value} />,
  QRCodeCanvas: ({ id, value, imageSettings }: any) =>
    <canvas id={id} data-testid="qr-canvas" data-image-settings={JSON.stringify(imageSettings)} />,
}))

import { BrandedQR } from '@/components/ui/branded-qr'

describe('BrandedQR', () => {
  it('hidden canvas has imageSettings for logo', () => {
    render(<BrandedQR value="https://example.com" />)
    const canvas = screen.getByTestId('qr-canvas')
    const settings = JSON.parse(canvas.getAttribute('data-image-settings') ?? 'null')
    expect(settings).not.toBeNull()
    expect(settings.src).toBeTruthy()
    expect(settings.excavate).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:unit -- tests/unit/components/branded-qr.test.tsx
```
Expected: FAIL — `imageSettings` is null (canvas has no imageSettings prop).

**Step 3: Fix `QRCodeCanvas` in `branded-qr.tsx`**

Find the hidden `QRCodeCanvas` near the bottom of `branded-qr.tsx` (the one inside `<div className="absolute -left-[9999px] -top-[9999px]">`).

Replace:
```tsx
<QRCodeCanvas
  id={canvasId}
  value={value}
  size={downloadSize}
  bgColor="#ffffff"
  fgColor="#18181b"
  level="M"
/>
```

With:
```tsx
<QRCodeCanvas
  id={canvasId}
  value={value}
  size={downloadSize}
  bgColor="#ffffff"
  fgColor="#18181b"
  level="M"
  imageSettings={{
    src: '/eventiapp-icon.svg',
    height: Math.round(downloadSize * 0.15),
    width: Math.round(downloadSize * 0.18),
    excavate: true,
  }}
/>
```

Also change the default `downloadSize` prop from `1024` to `1200`:
```tsx
downloadSize = 1200,
```

**Step 4: Run test to verify it passes**

```bash
npm run test:unit -- tests/unit/components/branded-qr.test.tsx
```
Expected: PASS.

**Step 5: Run all unit tests**

```bash
npm run test:unit
```
Expected: all pass.

**Step 6: Commit**

```bash
git add src/components/ui/branded-qr.tsx tests/unit/components/branded-qr.test.tsx
git commit -m "fix(qr): add logo imageSettings to hidden download canvas; increase resolution to 1200px"
```

---

## Task 4: Fix moments-wall.tsx — imports + lightbox download + lightbox description

**Files:**
- Modify: `src/components/events/moments-wall.tsx`

Three changes in this task, all in the lightbox area:
1. Add new icon imports
2. Fix `handleDownload` to use backend proxy (fixes CORS)
3. Add description block below media in lightbox

**Step 1: Add new icon imports**

In `moments-wall.tsx`, find the heroicons import block (lines ~17-32). Add `ArrowTopRightOnSquareIcon` and `ChatBubbleOvalLeftIcon`:

```tsx
import {
  PhotoIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  QrCodeIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ShareIcon,
  SparklesIcon,
  GlobeAltIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleOvalLeftIcon,
} from '@heroicons/react/24/outline'
```

**Step 2: Fix `handleDownload` in the `Lightbox` function**

Find the `handleDownload` function inside `Lightbox` (around line 93). Replace the direct `fetch(url)` with the backend proxy:

Replace:
```tsx
const handleDownload = async () => {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const extMatch = url.match(/\.(\w{2,5})(?:\?|$)/)
    const ext = extMatch?.[1] ?? 'jpg'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `momento-${moment.id}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    toast.error('Error al descargar archivo')
  }
}
```

With:
```tsx
const handleDownload = async () => {
  try {
    const res = await api.get(`/moments/${moment.id}/download`, { responseType: 'blob' })
    const key = moment.content_url ?? url
    const extMatch = key.match(/\.(\w{2,5})(?:\?|$)/)
    const ext = extMatch?.[1] ?? 'jpg'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(res.data)
    a.download = `momento-${moment.id}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    toast.error('Error al descargar archivo')
  }
}
```

**Step 3: Add description block below media in lightbox**

In the lightbox JSX, find the closing `</motion.div>` of the media block (around line 206, right before the Next button). Add the description pill after it:

Find this block:
```tsx
      </motion.div>

      {/* Next — hidden on mobile, use swipe instead */}
```

Replace with:
```tsx
      </motion.div>

      {/* Description pill — shown below media when moment has a note */}
      {moment.description && (
        <div
          className="absolute bottom-16 left-4 right-4 flex justify-center z-10 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="max-w-lg rounded-full bg-black/60 backdrop-blur-sm px-5 py-2 text-sm text-white/80 italic text-center line-clamp-2 ring-1 ring-white/10">
            &ldquo;{moment.description}&rdquo;
          </p>
        </div>
      )}

      {/* Next — hidden on mobile, use swipe instead */}
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 5: Run all unit tests**

```bash
npm run test:unit
```
Expected: all pass (existing tests not affected — api mock already has put/delete; lightbox is portal-based and not easily testable without DOM).

**Step 6: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix(lightbox): use backend proxy for download; add description pill below media"
```

---

## Task 5: Add description chip on media cards

**Files:**
- Modify: `src/components/events/moments-wall.tsx`
- Modify: `tests/unit/components/moments-wall.test.tsx`

**Root cause:** When a card has media (`hasMedia === true`), the `moment.description` is completely hidden. Only text-only cards (no media) show the description as the card body.

**Step 1: Write failing test**

In `tests/unit/components/moments-wall.test.tsx`, add to `describe('MomentsWall — moment card content')`:

```tsx
it('shows description chip when moment has media and a description', async () => {
  await renderWall([makePhotoMoment({ description: 'Nota del invitado' })])
  expect(screen.getByText('Nota del invitado')).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:unit -- tests/unit/components/moments-wall.test.tsx --reporter=verbose
```
Expected: FAIL — "Nota del invitado" not found (it's hidden when hasMedia is true).

**Step 3: Add the description chip in `MomentCard`**

In `MomentCard`, find the action bar overlay (around line 523, the `{!isProcessing && (` block). The chip goes ABOVE the action bar, inside the card.

Find this comment:
```tsx
      {/* ── Action bar (bottom overlay) ─────────────────────────
```

Add the chip BEFORE it (between the status badge section and the action bar):

```tsx
      {/* ── Description chip — above action bar, only when card has media ── */}
      {hasMedia && moment.description && !isProcessing && !isFailed && (
        <div className="absolute bottom-12 left-2 right-2 z-10 pointer-events-none sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity sm:duration-200">
          <span className="inline-flex items-center gap-1 max-w-full rounded-full bg-black/65 backdrop-blur-sm px-2.5 py-1 text-[10px] text-white/75 ring-1 ring-white/10">
            <ChatBubbleOvalLeftIcon className="size-3 shrink-0 text-white/50 flex-none" />
            <span className="truncate">{moment.description}</span>
          </span>
        </div>
      )}

      {/* ── Action bar (bottom overlay) ─────────────────────────
```

**Step 4: Run test to verify it passes**

```bash
npm run test:unit -- tests/unit/components/moments-wall.test.tsx --reporter=verbose
```
Expected: PASS.

**Step 5: Run all unit tests**

```bash
npm run test:unit
```
Expected: all pass.

**Step 6: Commit**

```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): show description chip on media cards with guest notes"
```

---

## Task 6: Add "Abrir enlace" button + redesign WallShareModal with tabs

**Files:**
- Modify: `src/components/events/moments-wall.tsx`
- Modify: `tests/unit/components/moments-wall.test.tsx`

Two sub-changes:
1. `QRModal`: add "Abrir enlace" `<a>` button above "Copiar enlace"
2. `WallShareModal`: add tab bar ("Ver muro" / "Subir fotos") — each tab shows its own BrandedQR + open + copy buttons. Remove the two separate link sections.

**Step 1: Write failing test for "Abrir enlace" in QR modal**

In `tests/unit/components/moments-wall.test.tsx`, add to `describe('MomentsWall — QR modal')`:

```tsx
it('shows Abrir enlace link in QR modal', async () => {
  await renderWall([makeMoment()])
  fireEvent.click(screen.getByTitle('Generar QR para subida compartida'))
  await waitFor(() => {
    const link = screen.getByRole('link', { name: /Abrir enlace/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:unit -- tests/unit/components/moments-wall.test.tsx --reporter=verbose
```
Expected: FAIL — no element with role "link" and name "Abrir enlace".

**Step 3: Update `QRModal` — add "Abrir enlace" button**

Find the `QRModal` function. Inside the `<div className="space-y-2 pt-1 w-full">` block, add the "Abrir enlace" anchor ABOVE the "Copiar enlace" button:

Find:
```tsx
        <div className="space-y-2 pt-1 w-full">
          <p className="text-xs text-zinc-500 break-all text-center px-2">{url}</p>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <ClipboardDocumentIcon className="size-4" />
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
```

Replace with:
```tsx
        <div className="space-y-2 pt-1 w-full">
          <p className="text-xs text-zinc-500 break-all text-center px-2">{url}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <ClipboardDocumentIcon className="size-4" />
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
```

**Step 4: Redesign `WallShareModal` with tabs**

Replace the entire `WallShareModal` function with this:

```tsx
function WallShareModal({ wallUrl, uploadUrl, onClose }: { wallUrl: string; uploadUrl: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'wall' | 'upload'>('wall')
  const [copied, setCopied] = useState(false)

  const activeUrl = activeTab === 'wall' ? wallUrl : uploadUrl

  const copy = async () => {
    await navigator.clipboard.writeText(activeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wall-share-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative rounded-2xl bg-zinc-900 border border-white/10 p-6 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        >
          <XMarkIcon className="size-4" />
        </button>

        {/* Tab bar */}
        <div className="flex w-full rounded-lg overflow-hidden border border-white/10">
          {([
            { key: 'wall',   label: 'Ver muro' },
            { key: 'upload', label: 'Subir fotos' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCopied(false) }}
              className={[
                'flex-1 py-2 text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* QR for active tab */}
        <BrandedQR
          value={activeUrl}
          title={activeTab === 'wall' ? 'Muro de Momentos' : 'Subir Fotos'}
          subtitle={activeTab === 'wall' ? 'Escanea para ver los mejores momentos' : 'Escanea para subir fotos y videos'}
          downloadName={activeTab === 'wall' ? 'qr-muro-momentos' : 'qr-subida-momentos'}
          size={180}
          dark
        />

        {/* URL + actions */}
        <div className="space-y-2 pt-1 w-full">
          <p className="text-xs text-zinc-500 break-all text-center px-2">{activeUrl}</p>
          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Abrir enlace
          </a>
          <button
            onClick={copy}
            className={[
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-medium transition-colors',
              activeTab === 'wall'
                ? 'bg-pink-500 hover:bg-pink-400'
                : 'bg-indigo-600 hover:bg-indigo-500',
            ].join(' ')}
          >
            <ClipboardDocumentIcon className="size-4" />
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
```

**Step 5: Run test to verify it passes**

```bash
npm run test:unit -- tests/unit/components/moments-wall.test.tsx --reporter=verbose
```
Expected: PASS (new "Abrir enlace" test passes, existing QR modal test still passes).

**Step 6: Run all unit tests**

```bash
npm run test:unit
```
Expected: all pass.

**Step 7: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 8: Commit**

```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(qr): add Abrir enlace button; redesign WallShareModal with wall/upload tabs"
```

---

## Task 7: Toolbar reorganization — 3 clear rows

**Files:**
- Modify: `src/components/events/moments-wall.tsx`

Restructure the toolbar from two disorganized rows into three visually clear rows with border dividers.

**Step 1: No new tests needed** — existing tests cover all buttons by title/text. Just verify existing tests still pass after the refactor.

**Step 2: Replace the toolbar section**

In the `return` statement of `MomentsWall`, find the header section starting at:
```tsx
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
```

And ending just before:
```tsx
      {/* ── Grid ───────────────────────────────────────────────────────── */}
```

Replace the entire header div with this reorganized version:

```tsx
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-white/10 overflow-hidden">

        {/* Row 1 — Content actions */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5">
          {/* Counts + badges */}
          <p className="text-sm text-zinc-400 flex-1 min-w-0">
            {moments.length} momento{moments.length !== 1 ? 's' : ''} en total
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
            {failedCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 ring-1 ring-rose-500/20">
                {failedCount} con error
              </span>
            )}
          </p>

          {/* Bulk actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {approvedCount > 0 && (
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50 border border-white/10"
                title="Descarga las imágenes aprobadas en un ZIP. Los videos no están incluidos."
              >
                {downloadingZip ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{downloadingZip ? 'Generando…' : 'Descargar fotos (ZIP)'}</span>
                <span className="sm:hidden">{downloadingZip ? '…' : 'ZIP'}</span>
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={handleApproveAll}
                disabled={approvingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 transition-colors border border-lime-500/20 disabled:opacity-50"
                title={`Aprobar ${pendingCount} momento${pendingCount !== 1 ? 's' : ''} pendientes`}
              >
                {approvingAll ? (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{approvingAll ? 'Aprobando…' : `Aprobar todos (${pendingCount})`}</span>
                <span className="sm:hidden">{approvingAll ? '…' : `Aprobar (${pendingCount})`}</span>
              </button>
            )}

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              {isValidating && (
                <ArrowPathIcon className="size-3 animate-spin text-zinc-400" />
              )}
              <span className="sm:hidden">
                {isValidating ? '…' : '15s'}
              </span>
              <span className="hidden sm:inline">
                {isValidating ? 'Actualizando…' : 'Auto-actualiza cada 15s'}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2 — Sharing & settings */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/5 border-l-2 border-l-indigo-500/30">
          <button
            onClick={handleToggleShare}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
              shareEnabled
                ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border-indigo-500/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10'
            }`}
            title={shareEnabled ? 'Subida por QR habilitada — cualquiera con el enlace puede subir' : 'Habilitar subida por QR compartido'}
          >
            <QrCodeIcon className="size-3.5" />
            <span className="hidden sm:inline">{shareEnabled ? 'Subida QR activa' : 'Habilitar subida QR'}</span>
            <span className="sm:hidden">{shareEnabled ? 'QR activo' : 'QR subida'}</span>
          </button>
          <button
            onClick={handleTogglePublish}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
              wallPublished
                ? 'bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 border-lime-500/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10'
            }`}
          >
            <GlobeAltIcon className="size-3.5" />
            <span className="hidden sm:inline">{wallPublished ? 'Muro publicado' : 'Publicar muro'}</span>
            <span className="sm:hidden">{wallPublished ? 'Publicado' : 'Publicar'}</span>
          </button>

          {/* Separator */}
          <div className="hidden sm:block h-5 w-px bg-white/10" />

          <button
            onClick={() => setShowWallShare(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 transition-colors border border-pink-500/30"
            title="Compartir muro de momentos"
          >
            <ShareIcon className="size-3.5" />
            <span className="hidden sm:inline">Compartir muro</span>
            <span className="sm:hidden">Muro</span>
          </button>
          {shareEnabled && (
            <button
              onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 transition-colors border border-indigo-500/30"
              title="Generar QR para subida compartida"
            >
              <QrCodeIcon className="size-3.5" />
              <span className="hidden sm:inline">QR de subida</span>
              <span className="sm:hidden">QR</span>
            </button>
          )}
        </div>

        {/* Row 3 — Filters */}
        <div role="tablist" className="flex">
          {([
            { value: 'all',      label: 'Todos',      count: moments.length },
            { value: 'pending',  label: 'Pendientes', count: pendingCount },
            { value: 'approved', label: 'Aprobados',  count: approvedCount },
            ...(failedCount > 0 ? [{ value: 'failed', label: 'Errores', count: failedCount }] : []),
          ] as const).map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value as typeof filter)}
              className={[
                'flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors text-center',
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              ].join(' ')}
            >
              {f.label}
              {f.count > 0 && (
                <span className={[
                  'ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  filter === f.value ? 'bg-white/20' : 'bg-zinc-800 text-zinc-500',
                ].join(' ')}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
```

**Step 3: Run all unit tests**

```bash
npm run test:unit
```
Expected: all pass. Key tests that verify buttons are still present:
- "shows QR button when share uploads enabled" — checks `title="Generar QR para subida compartida"` ✓
- "shows total moment count" — checks count text ✓
- Filter tab tests — check tab roles ✓

**Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 5: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(toolbar): reorganize MomentsWall toolbar into 3 clear rows with visual separators"
```

---

## Task 8: Final verification + build

**Step 1: Update api mock to include `get`**

In `tests/unit/components/moments-wall.test.tsx`, the `@/lib/api` mock currently only has `put` and `delete`. Add `get` so the lightbox download doesn't throw if called in future tests:

Find:
```tsx
vi.mock('@/lib/api', () => ({
  api: {
    put:    vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))
```

Replace with:
```tsx
vi.mock('@/lib/api', () => ({
  api: {
    get:    vi.fn().mockResolvedValue({ data: new Blob() }),
    put:    vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))
```

**Step 2: Run full test suite**

```bash
npm run test:unit
```
Expected: all tests pass.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 4: Production build**

```bash
npm run build
```
Expected: build succeeds with no errors.

**Step 5: Final commit**

```bash
git add tests/unit/components/moments-wall.test.tsx
git commit -m "test(moments): add api.get to mock for download coverage"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `next.config.mjs` | Add `media-src` directive + `us-east-2` S3 region |
| `public/eventiapp-icon.svg` | Copy from cafetton-casero/public/favicon.svg |
| `src/components/ui/branded-qr.tsx` | Add `imageSettings` to hidden canvas; `downloadSize` → 1200 |
| `src/components/events/moments-wall.tsx` | Fix lightbox download (backend proxy); add lightbox description pill; add card description chip; add "Abrir enlace" buttons; WallShareModal tabs; toolbar 3-row layout |
| `tests/unit/components/branded-qr.test.tsx` | New: test imageSettings on canvas |
| `tests/unit/components/moments-wall.test.tsx` | Add api.get mock; test description chip; test "Abrir enlace" button |
