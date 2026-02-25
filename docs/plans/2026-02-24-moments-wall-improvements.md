# Moments Wall Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the Moments Wall with multi-select bulk actions, media-type filtering, full note display in lightbox, ZIP split by type, and time-grouped grid.

**Architecture:** All changes are isolated to `src/components/events/moments-wall.tsx`. No new files, no backend changes required. Features are additive — each task is independent. Tests live in `tests/unit/components/moments-wall.test.tsx`.

**Tech Stack:** React 18, motion/react v12, Tailwind CSS, JSZip, Vitest + React Testing Library, TypeScript

---

## Context

- Main file: `src/components/events/moments-wall.tsx` (~1140 lines)
- `Moment` model: `src/models/Moment.ts` — has `id`, `content_url`, `thumbnail_url`, `description`, `is_approved`, `processing_status`, `created_at`
- Existing grid: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5` with `MomentCard` per item
- Existing filter state: `useState<'all' | 'pending' | 'approved' | 'failed'>('all')`
- Existing ZIP: `handleDownloadZip` downloads all approved moments
- Lightbox: `Lightbox` component with `moments`, `index`, `onClose`, `onNext`, `onPrev`, `resolveUrl`
- `isVideo(url)` helper exists at line 38
- `resolveUrl(m)` returns `m.content_url ?? ''`

## Tests reference

Tests live in `tests/unit/components/moments-wall.test.tsx`. Run with:
```
npm run test:unit -- --reporter=verbose tests/unit/components/moments-wall.test.tsx
```

---

## Task 1: Media-type filter tabs (Photos / Videos)

Add two new filter tabs: **Fotos** and **Videos**, so the organizer can quickly see only photos or only videos.

**Files:**
- Modify: `src/components/events/moments-wall.tsx` (filter state + filter tabs + filteredMoments logic)
- Test: `tests/unit/components/moments-wall.test.tsx`

### Step 1: Write the failing test

Add to `tests/unit/components/moments-wall.test.tsx`:

```tsx
describe('MomentsWall — media type filters', () => {
  it('shows Fotos and Videos filter tabs', async () => {
    renderWall(mockMoments)
    expect(screen.getByRole('tab', { name: /fotos/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /videos/i })).toBeInTheDocument()
  })

  it('Fotos filter shows only photo moments', async () => {
    renderWall(mockMoments)
    fireEvent.click(screen.getByRole('tab', { name: /fotos/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('moment-card').length).toBeGreaterThan(0)
    })
  })
})
```

### Step 2: Run test to verify it fails
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```
Expected: FAIL — tabs not found.

### Step 3: Implement

In `moments-wall.tsx`, change the filter type:
```tsx
// Replace:
const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'failed'>('all')
// With:
const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'failed' | 'photos' | 'videos'>('all')
```

Update `filteredMoments` logic — add two new cases (after the existing ones):
```tsx
const filteredMoments = moments.filter((m) => {
  if (filter === 'pending')  return !m.is_approved && m.processing_status !== 'failed'
  if (filter === 'approved') return m.is_approved
  if (filter === 'failed')   return m.processing_status === 'failed'
  if (filter === 'photos')   return m.is_approved && !!resolveUrl(m) && !isVideo(resolveUrl(m))
  if (filter === 'videos')   return m.is_approved && !!resolveUrl(m) && isVideo(resolveUrl(m))
  return true
})
```

Add the two new tabs to the tab list array (add after the `approved` tab entry):
```tsx
...(photoCount > 0 ? [{ value: 'photos', label: 'Fotos', count: photoCount }] : []),
...(videoCount > 0 ? [{ value: 'videos', label: 'Videos', count: videoCount }] : []),
```

The full tabs array in the JSX (find the `[... ] as const).map` block around line 999):
```tsx
{([
  { value: 'all',      label: 'Todos',      count: moments.length },
  { value: 'pending',  label: 'Pendientes', count: pendingCount },
  { value: 'approved', label: 'Aprobados',  count: approvedCount },
  ...(photoCount  > 0 ? [{ value: 'photos',  label: 'Fotos',   count: photoCount  }] : []),
  ...(videoCount  > 0 ? [{ value: 'videos',  label: 'Videos',  count: videoCount  }] : []),
  ...(failedCount > 0 ? [{ value: 'failed',  label: 'Errores', count: failedCount }] : []),
] as const).map(...)}
```

### Step 4: Run test to verify it passes
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```
Expected: PASS

### Step 5: TypeScript check
```
npx tsc --noEmit
```

### Step 6: Commit
```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): add Fotos and Videos filter tabs"
```

---

## Task 2: Multi-select mode with bulk actions

Add a "Seleccionar" toggle button in the toolbar. When active, each card shows a checkbox. Selecting cards enables "Aprobar selección" and "Eliminar selección" bulk action buttons.

**Files:**
- Modify: `src/components/events/moments-wall.tsx`
- Test: `tests/unit/components/moments-wall.test.tsx`

### Step 1: Write the failing tests

```tsx
describe('MomentsWall — multi-select', () => {
  it('shows a Seleccionar toggle button', async () => {
    renderWall(mockMoments)
    expect(screen.getByTitle(/seleccionar/i)).toBeInTheDocument()
  })

  it('entering select mode shows checkboxes on cards', async () => {
    renderWall(mockMoments)
    fireEvent.click(screen.getByTitle(/seleccionar/i))
    await waitFor(() => {
      // Each card gets a checkbox when in select mode
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })
  })

  it('shows bulk action buttons when items are selected', async () => {
    renderWall(mockMoments)
    fireEvent.click(screen.getByTitle(/seleccionar/i))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    await waitFor(() => {
      expect(screen.getByText(/aprobar selección/i)).toBeInTheDocument()
    })
  })
})
```

### Step 2: Run test to verify it fails
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```

### Step 3: Implement

Add state near the top of `MomentsWall` (after `downloadingZip` state):
```tsx
const [selectMode, setSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

const toggleSelect = (id: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

const handleApproveSelected = async () => {
  const toApprove = moments.filter(m => selectedIds.has(m.id) && !m.is_approved)
  if (toApprove.length === 0) return
  try {
    await Promise.all(toApprove.map(m => api.put(`/moments/${m.id}`, { ...m, is_approved: true })))
    await globalMutate(swrKey)
    setSelectedIds(new Set())
    toast.success(`${toApprove.length} momento${toApprove.length !== 1 ? 's' : ''} aprobados`)
  } catch {
    toast.error('Error al aprobar momentos')
  }
}

const handleDeleteSelected = async () => {
  if (selectedIds.size === 0) return
  if (!window.confirm(`¿Eliminar ${selectedIds.size} momento${selectedIds.size !== 1 ? 's' : ''}?`)) return
  try {
    await Promise.all([...selectedIds].map(id => api.delete(`/moments/${id}`)))
    await globalMutate(swrKey)
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.success(`${selectedIds.size} momento${selectedIds.size !== 1 ? 's' : ''} eliminados`)
  } catch {
    toast.error('Error al eliminar momentos')
  }
}
```

Also reset selection when exiting select mode:
```tsx
const exitSelectMode = () => {
  setSelectMode(false)
  setSelectedIds(new Set())
}
```

**In the toolbar Row 1**, add the Seleccionar toggle button (before the `Descargar fotos (ZIP)` button):
```tsx
<button
  onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
  title={selectMode ? 'Cancelar selección' : 'Seleccionar momentos'}
  className={[
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
    selectMode
      ? 'bg-indigo-600 text-white border-indigo-500'
      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10',
  ].join(' ')}
>
  <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/>
  </svg>
  <span className="hidden sm:inline">{selectMode ? `Cancelar (${selectedIds.size})` : 'Seleccionar'}</span>
</button>
```

After the existing bulk action buttons (approve all / reject all), add the selected-items actions (only shown when `selectMode && selectedIds.size > 0`):
```tsx
{selectMode && selectedIds.size > 0 && (
  <>
    <button
      onClick={handleApproveSelected}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 border border-lime-500/20 transition-colors"
    >
      <CheckIcon className="size-3.5" />
      <span className="hidden sm:inline">Aprobar selección ({selectedIds.size})</span>
      <span className="sm:hidden">Aprobar ({selectedIds.size})</span>
    </button>
    <button
      onClick={handleDeleteSelected}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
    >
      <XMarkIcon className="size-3.5" />
      <span className="hidden sm:inline">Eliminar selección ({selectedIds.size})</span>
      <span className="sm:hidden">Eliminar ({selectedIds.size})</span>
    </button>
  </>
)}
```

**In the grid**, pass `selectMode` and `selectedIds` down to `MomentCard`:

Change the `MomentCard` interface:
```tsx
interface MomentCardProps {
  moment: Moment
  onApprove: (m: Moment) => Promise<void>
  onDelete: (m: Moment) => Promise<void>
  onOpenLightbox: (m: Moment) => void
  resolveUrl: (m: Moment) => string
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}
```

Inside `MomentCard`, add the checkbox overlay when `selectMode` is true:
```tsx
{selectMode && (
  <div
    className="absolute inset-0 z-20 cursor-pointer"
    onClick={(e) => { e.stopPropagation(); onToggleSelect?.(moment.id) }}
  >
    <div className={[
      'absolute top-2 right-2 size-6 rounded-full border-2 flex items-center justify-center transition-colors',
      selected
        ? 'bg-indigo-500 border-indigo-400'
        : 'bg-black/40 border-white/40 backdrop-blur-sm',
    ].join(' ')}>
      {selected && <CheckIcon className="size-3.5 text-white" />}
    </div>
    {selected && (
      <div className="absolute inset-0 bg-indigo-500/20 border-2 border-indigo-400/60 rounded-xl" />
    )}
  </div>
)}
```

Also, when `selectMode` is true, clicking the card should toggle selection (not open lightbox). Wrap the `onOpenLightbox` calls:
```tsx
onClick={() => selectMode ? onToggleSelect?.(moment.id) : onOpenLightbox(moment)}
```

Update the grid rendering to pass the new props:
```tsx
<MomentCard
  key={moment.id}
  moment={moment}
  onApprove={handleApprove}
  onDelete={handleDelete}
  onOpenLightbox={handleOpenLightbox}
  resolveUrl={resolveUrl}
  selectMode={selectMode}
  selected={selectedIds.has(moment.id)}
  onToggleSelect={toggleSelect}
/>
```

Add a "Seleccionar todo" checkbox in the toolbar when `selectMode` is active:
```tsx
{selectMode && (
  <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
    <input
      type="checkbox"
      className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
      checked={selectedIds.size === filteredMoments.length && filteredMoments.length > 0}
      onChange={(e) => {
        if (e.target.checked) {
          setSelectedIds(new Set(filteredMoments.map(m => m.id)))
        } else {
          setSelectedIds(new Set())
        }
      }}
    />
    <span>Seleccionar todo</span>
  </label>
)}
```

### Step 4: Run tests
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
npm run test:unit
npx tsc --noEmit
```

### Step 5: Commit
```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): multi-select mode with bulk approve/delete on selection"
```

---

## Task 3: Full note/description display in lightbox

Currently `description` shows as a truncated chip on cards. In the lightbox, show the full note as a visible card below the image — always visible, not just on hover.

**Files:**
- Modify: `src/components/events/moments-wall.tsx` (Lightbox component, lines 62–228)
- Test: `tests/unit/components/moments-wall.test.tsx`

### Step 1: Write the failing test

```tsx
describe('MomentsWall — lightbox note display', () => {
  it('shows full description in lightbox when moment has a note', async () => {
    const momentWithNote = { ...mockMoments[0], description: 'Un mensaje especial del invitado' }
    renderWall([momentWithNote])
    // Open lightbox — click the card image area
    fireEvent.click(screen.getByTestId('moment-card'))
    await waitFor(() => {
      expect(screen.getByText('Un mensaje especial del invitado')).toBeInTheDocument()
    })
  })
})
```

### Step 2: Run test to verify it fails
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```

### Step 3: Implement

In the `Lightbox` component (around line 62), inside the returned portal JSX, find where the bottom controls are rendered. The lightbox renders media then a bottom bar with download, close etc.

Locate the bottom bar area in the Lightbox return (search for the `ArrowDownTrayIcon` download button inside the Lightbox). Add the note section **above** the control bar:

```tsx
{/* Note / description from guest */}
{moment.description && (
  <div className="absolute bottom-16 left-4 right-4 z-20 pointer-events-none">
    <div className="flex items-start gap-2 rounded-xl bg-black/70 backdrop-blur-md px-3 py-2.5 ring-1 ring-white/10">
      <ChatBubbleOvalLeftIcon className="size-4 text-white/50 shrink-0 mt-0.5" />
      <p className="text-sm text-white/80 leading-relaxed">{moment.description}</p>
    </div>
  </div>
)}
```

(`ChatBubbleOvalLeftIcon` is already imported from `@heroicons/react/24/outline` at the top.)

### Step 4: Run tests
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
npx tsc --noEmit
```

### Step 5: Commit
```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): show full guest note in lightbox"
```

---

## Task 4: ZIP split — download photos-only or videos-only

Change the ZIP download button to a dropdown-style button group: `Descargar ZIP` with a split arrow that opens a small menu: **Todos · Solo fotos · Solo vídeos**.

**Files:**
- Modify: `src/components/events/moments-wall.tsx`
- Test: `tests/unit/components/moments-wall.test.tsx`

### Step 1: Write the failing test

```tsx
describe('MomentsWall — zip split', () => {
  it('shows zip type dropdown options', async () => {
    renderWall(mockMoments)
    // Open the ZIP split menu
    const zipToggle = screen.getByTitle(/opciones de descarga/i)
    fireEvent.click(zipToggle)
    await waitFor(() => {
      expect(screen.getByText(/solo fotos/i)).toBeInTheDocument()
      expect(screen.getByText(/solo vídeos/i)).toBeInTheDocument()
    })
  })
})
```

### Step 2: Run test to verify it fails
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```

### Step 3: Implement

Add state for the dropdown:
```tsx
const [showZipMenu, setShowZipMenu] = useState(false)
const zipMenuRef = useRef<HTMLDivElement>(null)
```

Add a `useEffect` to close the menu when clicking outside:
```tsx
useEffect(() => {
  if (!showZipMenu) return
  const handler = (e: MouseEvent) => {
    if (zipMenuRef.current && !zipMenuRef.current.contains(e.target as Node)) {
      setShowZipMenu(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [showZipMenu])
```

Update `handleDownloadZip` to accept a filter parameter:
```tsx
const handleDownloadZip = async (typeFilter: 'all' | 'photos' | 'videos' = 'all') => {
  const approved = moments.filter((m) => {
    if (!m.is_approved || !resolveUrl(m)) return false
    if (typeFilter === 'photos') return !isVideo(resolveUrl(m))
    if (typeFilter === 'videos') return isVideo(resolveUrl(m))
    return true
  })
  if (approved.length === 0) {
    toast.info('No hay momentos aprobados para descargar')
    return
  }
  setShowZipMenu(false)
  setDownloadingZip(true)
  // ... rest of existing ZIP logic unchanged ...
  const suffix = typeFilter === 'photos' ? '-fotos' : typeFilter === 'videos' ? '-videos' : ''
  a.download = `momentos-${eventIdentifier}${suffix}.zip`
  // ...
}
```

Replace the existing ZIP button in the toolbar with a split button group:
```tsx
{approvedCount > 0 && (
  <div ref={zipMenuRef} className="relative">
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      <button
        onClick={() => handleDownloadZip('all')}
        disabled={downloadingZip}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
        title="Descargar todos los momentos aprobados en un ZIP"
      >
        {downloadingZip ? (
          <ArrowPathIcon className="size-3.5 animate-spin" />
        ) : (
          <ArrowDownTrayIcon className="size-3.5" />
        )}
        <span className="hidden sm:inline">{downloadingZip ? 'Generando…' : 'Descargar ZIP'}</span>
        <span className="sm:hidden">ZIP</span>
      </button>
      <button
        onClick={() => setShowZipMenu(v => !v)}
        title="Opciones de descarga"
        className="flex items-center px-2 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-l border-white/10 transition-colors"
      >
        <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>

    {showZipMenu && (
      <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border border-white/10 bg-zinc-900 shadow-xl shadow-black/40 py-1">
        <button onClick={() => handleDownloadZip('all')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
          <ArrowDownTrayIcon className="size-3.5" /> Todos
        </button>
        <button onClick={() => handleDownloadZip('photos')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
          <ArrowDownTrayIcon className="size-3.5" /> Solo fotos
        </button>
        <button onClick={() => handleDownloadZip('videos')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors">
          <ArrowDownTrayIcon className="size-3.5" /> Solo vídeos
        </button>
      </div>
    )}
  </div>
)}
```

### Step 4: Run tests
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
npx tsc --noEmit
```

### Step 5: Commit
```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): ZIP split dropdown — download all, photos-only, or videos-only"
```

---

## Task 5: Time-grouped grid

Group the moment cards by their upload time. Show a small sticky-ish section header (e.g. "20:30 — 21:00") between groups. Use `created_at` from `BaseEntity`.

**Files:**
- Modify: `src/components/events/moments-wall.tsx`
- Test: `tests/unit/components/moments-wall.test.tsx`

### Step 1: Write the failing test

```tsx
describe('MomentsWall — time grouping', () => {
  it('shows a time group header when groupByTime is enabled', async () => {
    const moments = [
      { ...mockMoments[0], created_at: '2026-08-15T20:35:00Z' },
      { ...mockMoments[1], created_at: '2026-08-15T20:40:00Z' },
    ]
    renderWall(moments)
    // Enable group-by-time toggle
    fireEvent.click(screen.getByTitle(/agrupar por hora/i))
    await waitFor(() => {
      // Should show a time bucket label
      expect(screen.getByText(/20:/)).toBeInTheDocument()
    })
  })
})
```

### Step 2: Run test to verify it fails
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
```

### Step 3: Implement

Add a helper function at the top of the file (after `isVideo`):
```tsx
/** Groups moments into 30-minute buckets, returns sorted array of [label, moments[]] */
function groupByTimeBuckets(moments: Moment[]): Array<{ label: string; items: Moment[] }> {
  const map = new Map<string, Moment[]>()
  for (const m of moments) {
    const d = new Date(m.created_at)
    // Round down to nearest 30 min
    const h = d.getHours()
    const min = d.getMinutes() < 30 ? '00' : '30'
    const label = `${String(h).padStart(2, '0')}:${min}`
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(m)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }))
}
```

Add a `groupByTime` toggle state in `MomentsWall`:
```tsx
const [groupByTime, setGroupByTime] = useState(false)
```

Add the toggle button in **Row 2** of the toolbar (near "Ver muro"):
```tsx
<button
  onClick={() => setGroupByTime(v => !v)}
  title="Agrupar por hora"
  className={[
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
    groupByTime
      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'
      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border-white/10',
  ].join(' ')}
>
  <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd"/>
  </svg>
  <span className="hidden sm:inline">Por hora</span>
</button>
```

Replace the grid section in JSX. Find the `filteredMoments.length === 0 ...` ternary and add a third case for grouped rendering:

```tsx
{/* When groupByTime is active and we have moments, render grouped */}
{filteredMoments.length > 0 && groupByTime ? (
  <div className="space-y-6">
    {groupByTimeBuckets(filteredMoments).map(({ label, items }) => (
      <div key={label}>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-medium text-zinc-500 tabular-nums">{label}</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
          <AnimatePresence>
            {items.map((moment) => (
              <MomentCard
                key={moment.id}
                moment={moment}
                onApprove={handleApprove}
                onDelete={handleDelete}
                onOpenLightbox={handleOpenLightbox}
                resolveUrl={resolveUrl}
                selectMode={selectMode}
                selected={selectedIds.has(moment.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    ))}
  </div>
) : filteredMoments.length > 0 ? (
  /* Existing flat grid */
  <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5" layout>
    ...
  </motion.div>
) : /* empty states */ ...}
```

Note: keep the empty state JSX exactly as it was; only insert the grouped branch at the top of the ternary.

### Step 4: Run tests
```
npm run test:unit -- tests/unit/components/moments-wall.test.tsx
npm run test:unit
npx tsc --noEmit
```

### Step 5: Commit
```bash
git add src/components/events/moments-wall.tsx tests/unit/components/moments-wall.test.tsx
git commit -m "feat(moments): time-grouped grid with 30-minute buckets"
```

---

## Task 6: IntersectionObserver lazy-load for cards

For events with many moments (100+), cards outside the viewport should not render their images until they scroll into view. Implement a custom `useLazyVisible` hook and apply it to `MomentCard`.

**Files:**
- Create: `src/hooks/useLazyVisible.ts`
- Modify: `src/components/events/moments-wall.tsx` (MomentCard)
- Test: `tests/unit/hooks/useLazyVisible.test.ts`

### Step 1: Write the failing test

Create `tests/unit/hooks/useLazyVisible.test.ts`:
```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useLazyVisible } from '@/hooks/useLazyVisible'

// Mock IntersectionObserver
const observeMock = vi.fn()
const unobserveMock = vi.fn()
const disconnectMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation((cb) => ({
    observe: observeMock,
    unobserve: unobserveMock,
    disconnect: disconnectMock,
  })))
})

describe('useLazyVisible', () => {
  it('returns a ref and visible state', () => {
    const { result } = renderHook(() => useLazyVisible())
    expect(result.current.ref).toBeDefined()
    expect(typeof result.current.visible).toBe('boolean')
  })

  it('starts as visible:false when IntersectionObserver exists', () => {
    const { result } = renderHook(() => useLazyVisible())
    expect(result.current.visible).toBe(false)
  })
})
```

Run: `npm run test:unit -- tests/unit/hooks/useLazyVisible.test.ts`
Expected: FAIL — hook not found.

### Step 2: Implement `useLazyVisible.ts`

Create `src/hooks/useLazyVisible.ts`:
```ts
import { useEffect, useRef, useState } from 'react'

/**
 * Returns a ref and a `visible` boolean.
 * `visible` becomes true once the element enters the viewport and stays true.
 * Falls back to true immediately if IntersectionObserver is not supported.
 */
export function useLazyVisible(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, visible }
}
```

### Step 3: Run hook tests
```
npm run test:unit -- tests/unit/hooks/useLazyVisible.test.ts
```
Expected: PASS

### Step 4: Apply to MomentCard

In `MomentCard`, import and use the hook:
```tsx
import { useLazyVisible } from '@/hooks/useLazyVisible'
```

Inside `MomentCard`:
```tsx
const { ref: lazyRef, visible } = useLazyVisible()
```

Attach `lazyRef` to the outer `motion.div` of MomentCard:
```tsx
<motion.div ref={lazyRef} layout ...>
```

Wrap the media area (the `isProcessing ? ... : video ? ... : hasMedia ? ...` block) with a visibility guard:
```tsx
{visible ? (
  /* existing full media/state rendering */
) : (
  <div className="absolute inset-0 bg-zinc-800/40 animate-pulse rounded-xl" />
)}
```

### Step 5: Run all tests + TS
```
npm run test:unit
npx tsc --noEmit
```

### Step 6: Commit
```bash
git add src/hooks/useLazyVisible.ts tests/unit/hooks/useLazyVisible.test.ts src/components/events/moments-wall.tsx
git commit -m "feat(moments): IntersectionObserver lazy loading for MomentCard"
```

---

## Final verification

```bash
npm run test:unit   # all 95+ tests pass
npx tsc --noEmit    # zero errors
npm run build       # production build succeeds
```
