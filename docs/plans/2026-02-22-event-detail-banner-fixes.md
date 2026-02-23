# Event Detail Banner + Data Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact cover-image banner header to the event detail page and fix KPI display issues (show 0 instead of "—", improve resilience to missing backend data).

**Architecture:** Replace the current plain header (breadcrumb + title + meta + buttons) with a compact banner (~200px) that uses the event's `cover_image_url` as background with a dark gradient overlay. Keep `EventCoverUpload` in the Resumen tab for managing the image. Fix KPI cards to show "0" instead of "—" when there are no guests. Add a temporary debug log to investigate what the backend returns for missing fields.

**Tech Stack:** Next.js 15, React, Tailwind CSS, Framer Motion, SWR, TypeScript

---

### Task 1: Add API debug logging to identify missing backend fields

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx:225-228`

**Step 1: Add temporary console.log after event data loads**

After line 228 (`const { data: event, isLoading, error } = useSWR<Event>(...)`), add a `useEffect` to log the raw event response:

```typescript
// TEMPORARY DEBUG — remove after confirming backend fields
useEffect(() => {
  if (event) {
    console.log('[DEBUG event]', {
      max_guests: event.max_guests,
      event_type_id: event.event_type_id,
      event_type: event.event_type,
      event_date_time: event.event_date_time,
      is_active: event.is_active,
      cover_image_url: event.cover_image_url,
    })
  }
}, [event])
```

**Step 2: Check the browser console**

Run: `npm run dev`
Navigate to an event page in the browser. Open DevTools → Console. Look for `[DEBUG event]` output.

Document which fields are `null`, `undefined`, `""`, or missing entirely. This tells us whether the issue is:
- Backend not returning the field at all
- Normalizer mangling the key name
- Field present but with unexpected value (e.g., `0` vs `null` for max_guests)

**Step 3: Share findings with user before proceeding**

Report back what the console shows. If the normalizer is breaking keys (e.g., `EventTypeId` → `event_type_id` works, but nested `EventType.Name` → `event_type.name` might not), we fix the normalizer. If the backend simply doesn't return the field, that's a backend issue.

**Step 4: Remove debug log after investigation**

Delete the `useEffect` debug block added in Step 1.

---

### Task 2: Fix KPI cards — show "0" instead of "—" for confirmados

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx:536-540`

**Step 1: Update the Confirmados KPI value logic**

Current code (lines 536-540):
```typescript
{
  label: 'Confirmados',
  value: guests.length > 0
    ? `${confirmed.length} (${totalAttendees} tot.)`
    : '—',
},
```

Change to:
```typescript
{
  label: 'Confirmados',
  value: `${confirmed.length} (${totalAttendees} tot.)`,
},
```

This always shows "0 (0 tot.)" even when there are no guests, which is more informative than "—".

**Step 2: Verify in browser**

Navigate to an event with no guests — KPI should show "0 (0 tot.)" instead of "—".

---

### Task 3: Compact banner header with cover image

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx:391-464` (replace header section)

**Step 1: Replace the header section**

Replace the current breadcrumb + header + meta section (lines 391-464) with a compact banner. The banner:
- Uses `event.cover_image_url` as `background-image` if available
- Has a dark gradient overlay (`bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/60`)
- Falls back to a subtle gradient when no cover image
- Is ~200px tall with rounded corners
- Contains: breadcrumb, event name + badge, meta line (date, address, days countdown), and action buttons
- Action buttons stay at the bottom of the banner

Replace lines 391–464 with:

```tsx
{/* Banner header with cover image */}
<div className="relative overflow-hidden rounded-2xl border border-white/10">
  {/* Cover image background */}
  {event.cover_image_url ? (
    <img
      src={event.cover_image_url}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  ) : null}

  {/* Gradient overlay */}
  <div
    className={[
      'absolute inset-0',
      event.cover_image_url
        ? 'bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/60'
        : 'bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-800/90',
    ].join(' ')}
  />

  {/* Content */}
  <div className="relative px-6 py-6 sm:py-8">
    {/* Breadcrumb */}
    <div className="max-lg:hidden mb-4">
      <Link
        href="/events"
        className="inline-flex items-center gap-2 text-sm/6 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ChevronLeftIcon className="size-4 fill-zinc-400" />
        Eventos
      </Link>
    </div>

    {/* Title + Badge */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Heading>{event.name}</Heading>
      <Badge color={event.is_active ? 'lime' : 'zinc'}>
        {event.is_active ? 'Activo' : 'Inactivo'}
      </Badge>
      {event.event_type?.name && (
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
          {event.event_type.name}
        </span>
      )}
    </div>

    {/* Meta line */}
    <p className="mt-2 text-sm/6 text-zinc-400">
      {formatEventDate(event.event_date_time, event.timezone)}
      {event.address && (
        <>
          <span aria-hidden="true"> · </span>
          {event.address}
        </>
      )}
      <span aria-hidden="true"> · </span>
      {daysUntil === null ? (
        <span className="text-zinc-500">Sin fecha</span>
      ) : daysUntil === 0 ? (
        <span className="text-amber-400 font-medium">¡Hoy!</span>
      ) : isPast ? (
        <span className="text-zinc-500">Hace {Math.abs(daysUntil)} días</span>
      ) : daysUntil <= 7 ? (
        <span className="text-amber-400 font-medium">En {daysUntil} día{daysUntil !== 1 ? 's' : ''}</span>
      ) : (
        <span>En {daysUntil} días</span>
      )}
    </p>

    {/* Action buttons */}
    <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
      <a
        href={`/events/${id}/studio`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-colors"
      >
        <PaintBrushIcon className="size-4" />
        Studio
      </a>
      <a
        href={`${PUBLIC_FRONTEND_URL}/e/${event.identifier}?preview=1`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-white/20 hover:text-zinc-100 transition-colors"
      >
        <ArrowTopRightOnSquareIcon className="size-4" />
        Vista previa
      </a>
      <a
        href={`/events/${id}/checkin`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-sm font-medium text-lime-400 hover:bg-lime-500/20 hover:border-lime-500/50 transition-colors"
      >
        <ClipboardDocumentCheckIcon className="size-4" />
        Check-in
      </a>
      <Button outline onClick={() => setIsEditOpen(true)}>
        Editar evento
      </Button>
    </div>
  </div>
</div>
```

**Step 2: Remove the old breadcrumb block**

The breadcrumb that was at lines 393-402 is now inside the banner. Make sure there's no duplicate.

**Step 3: Adjust spacing before tabs**

The `mt-8` on the tab navigation div (currently line 468) should change to `mt-6` since the banner already provides visual separation.

**Step 4: Verify in browser**

- Event WITH cover image: should see the image as background with dark overlay, text readable
- Event WITHOUT cover image: should see a subtle dark gradient, still looks clean
- Mobile: buttons should wrap properly, text stays readable
- Banner should be ~200px tall naturally from the padding + content

---

### Task 4: Remove cover image section from Resumen tab (optional, keep upload)

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx:618-625`

**Step 1: Change the Resumen tab cover section**

The current "Imagen de portada" section in Resumen (lines 618-625) shows a large 16:9 preview + upload. Since the cover is now visible in the banner, change this section to be a simpler "Cambiar portada" action rather than a large preview.

Replace lines 618-625:
```tsx
{/* Cover image */}
<div>
  <Subheading>Imagen de portada</Subheading>
  <p className="mt-1 text-sm text-zinc-500 mb-3">
    La imagen aparece como fondo en el encabezado del evento.
  </p>
  <div className="mt-3">
    <EventCoverUpload event={event} />
  </div>
</div>
```

This keeps the upload functionality but adds a description that explains the banner connection.

**Step 2: Verify**

Upload a cover → banner should update after SWR revalidation. Remove cover → banner falls back to gradient.

---

### Task 5: Commit all changes

**Step 1: Stage and commit**

```bash
git add src/app/(app)/events/[id]/page.tsx
git commit -m "feat(events): add compact banner header with cover image and fix KPI display"
```
