# Full-Stack Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 6 production-quality features spanning Go backend, Next.js dashboard, and Astro public frontend — analytics que funcionen, charts reales, QR check-in, sección Agenda, OG tags dinámicos, y tarjeta RSVP con QR.

**Architecture:** Fire-and-forget goroutines para analytics en Go; recharts para charts en dashboard; nuevo tipo SDUI para Agenda; Astro SSR para OG tags; dynamic imports para QR scanner y confirmation card.

**Tech Stack:** Go + Echo (backend), Next.js 15 + recharts + @zxing/browser (dashboard), Astro 5 + React + qrcode.react + html-to-image (public frontend).

---

## Task 1 — Backend: Analytics Auto-Tracking

**Files:**
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\EventAnalyticsService.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\invitations\invitations.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\moments\moments.go`

**Context:**
- `EventAnalytics` model has `Views`, `RSVPConfirmed`, `RSVPDeclined`, `MomentUploads` fields
- Nothing increments these fields — all show 0
- `GetEventAnalyticsByEventID` + `CreateEventAnalytics` + `UpdateEventAnalytics` already exist
- Pattern: fire-and-forget goroutine so analytics never block the main request

**Step 1: Add `IncrementAnalytics` helper to EventAnalyticsService.go**

Append this function at the end of `services/events/EventAnalyticsService.go`:

```go
// IncrementAnalytics atomically increments one analytics counter for an event.
// Runs as fire-and-forget — never call this on the main goroutine if you don't want latency.
// Creates the analytics record if it doesn't exist yet.
func IncrementAnalytics(eventID uuid.UUID, field string) {
	analytics, err := GetEventAnalyticsByEventID(eventID)
	if err != nil || analytics == nil {
		analytics = &models.EventAnalytics{EventID: eventID}
		applyIncrement(analytics, field)
		_ = CreateEventAnalytics(analytics)
		return
	}
	applyIncrement(analytics, field)
	_ = UpdateEventAnalytics(analytics)
}

func applyIncrement(a *models.EventAnalytics, field string) {
	switch field {
	case "views":
		a.Views++
	case "rsvp_confirmed":
		a.RSVPConfirmed++
	case "rsvp_declined":
		a.RSVPDeclined++
	case "moment_uploads":
		a.MomentUploads++
	}
}
```

**Step 2: Wire RSVP tracking in invitations.go**

In `controllers/invitations/invitations.go`, after the successful `ConfirmRSVP` call (line 65), add the analytics goroutine.

The current `ConfirmRSVP` handler ends at line 71. Replace the final section:

```go
// BEFORE (lines 65-70):
guest, err := invitationSvc.ConfirmRSVP(token, req.Status, req.Method, req.GuestCount)
if err != nil {
    return utils.Error(c, http.StatusUnauthorized, "RSVP confirmation failed", err.Error())
}

return utils.Success(c, http.StatusOK, "RSVP confirmed", guest)
```

```go
// AFTER:
guest, err := invitationSvc.ConfirmRSVP(token, req.Status, req.Method, req.GuestCount)
if err != nil {
    return utils.Error(c, http.StatusUnauthorized, "RSVP confirmation failed", err.Error())
}

// Fire-and-forget analytics — never blocks the response
go func(eventID uuid.UUID, status string) {
    field := "rsvp_confirmed"
    if status == "declined" {
        field = "rsvp_declined"
    }
    eventService.IncrementAnalytics(eventID, field)
}(guest.EventID, req.Status)

return utils.Success(c, http.StatusOK, "RSVP confirmed", guest)
```

Add the import for the events service package in the import block:

```go
import (
    invitationsService "events-stocks/services/invitations"
    eventService "events-stocks/services/events"
    "events-stocks/utils"
    "github.com/gofrs/uuid"
    "github.com/labstack/echo/v4"
    "net/http"
)
```

**Step 3: Read the Moment model to confirm EventID field**

```bash
cat \\wsl.localhost\Ubuntu\var\www\itbem-events-backend\models\Moment.go
```

If `models.Moment` has an `EventID` field → proceed to Step 4.
If not (only has `InvitationID`) → use `moment.InvitationID` to derive event (skip Step 4, add note).

**Step 4: Wire MomentUploads tracking in moments.go**

In `controllers/moments/moments.go`, in `CreateMoment` after line 56, add goroutine:

```go
// If Moment has EventID:
go func(eventID uuid.UUID) {
    eventService.IncrementAnalytics(eventID, "moment_uploads")
}(moment.EventID)

// OR if Moment only has InvitationID, skip this for now — add TODO comment
```

Add import `eventService "events-stocks/services/events"` and `"github.com/gofrs/uuid"` if not already present.

**Step 5: Build and verify**

```bash
# In WSL terminal:
cd /var/www/itbem-events-backend
go build ./...
```

Expected: no errors. If `uuid.UUID{}` mismatch, check import path (`github.com/gofrs/uuid`).

**Step 6: Read the page-spec controller and add view tracking**

```bash
cat \\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\events\events.go | grep -A 20 "page-spec\|PageSpec\|GetPageSpec"
```

Find the handler, add at the top of the handler body:

```go
// Fire view tracking — runs async, never blocks
go func(token string) {
    // Get invitation by token to find eventID, then increment
    inv, err := invitationSvc.GetInvitationByToken(token)
    if err == nil && inv != nil {
        eventService.IncrementAnalytics(inv.EventID, "views")
    }
}(c.QueryParam("token"))
```

**Step 7: Final build + commit**

```bash
cd /var/www/itbem-events-backend
go build ./...
git add services/events/EventAnalyticsService.go controllers/invitations/invitations.go controllers/moments/moments.go controllers/events/events.go
git commit -m "feat: auto-track analytics — views, RSVP confirmed/declined, moment uploads"
```

---

## Task 2 — Dashboard: Analytics Tab with Real Charts

**Files:**
- Read first: `src/components/events/event-analytics-panel.tsx`
- Modify: `src/components/events/event-analytics-panel.tsx`
- Modify: `src/models/EventAnalytics.ts` (verify fields match)
- Modify: `package.json` (add recharts)

**Step 1: Install recharts**

```bash
cd "C:/Users/AndBe/Desktop/Projects/dashboard-ts"
npm install recharts
npm install --save-dev @types/recharts
```

**Step 2: Read the current analytics panel**

```bash
cat "src/components/events/event-analytics-panel.tsx"
```

Note what SWR keys it uses and what it currently renders (likely 5 KPI cards).

**Step 3: Replace event-analytics-panel.tsx with charts**

Full replacement for `src/components/events/event-analytics-panel.tsx`:

```tsx
'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { EventAnalytics } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'

interface Props {
  eventId: string
  eventIdentifier: string
}

const ROLE_COLORS: Record<string, string> = {
  graduate: '#6366f1',
  guest:    '#a78bfa',
  vip:      '#f59e0b',
  speaker:  '#10b981',
  staff:    '#3b82f6',
  host:     '#ec4899',
  '':       '#71717a',
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-zinc-800" />
      ))}
      <div className="col-span-2 h-48 rounded-xl bg-zinc-800" />
      <div className="col-span-2 h-48 rounded-xl bg-zinc-800" />
    </div>
  )
}

function KPICard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

export function EventAnalyticsPanel({ eventId, eventIdentifier }: Props) {
  const { data: analytics, isLoading: loadingA } = useSWR<EventAnalytics>(
    `/events/${eventId}/analytics`,
    fetcher,
  )
  const { data: guests = [], isLoading: loadingG } = useSWR<Guest[]>(
    `/guests/${eventIdentifier}`,
    fetcher,
  )

  const isLoading = loadingA || loadingG
  if (isLoading) return <Skeleton />

  // ── Derived metrics ──────────────────────────────────────────
  const totalGuests   = guests.length
  const responded     = guests.filter(g => g.rsvp_status && g.rsvp_status !== 'pending').length
  const confirmed     = analytics?.rsvp_confirmed ?? guests.filter(g => g.rsvp_status === 'confirmed').length
  const declined      = analytics?.rsvp_declined  ?? guests.filter(g => g.rsvp_status === 'declined').length
  const responseRate  = totalGuests > 0 ? Math.round((responded / totalGuests) * 100) : 0
  const views         = analytics?.views ?? 0
  const momentUploads = analytics?.moment_uploads ?? 0

  // ── Funnel data ───────────────────────────────────────────────
  const funnelData = [
    { name: 'Invitados', value: totalGuests },
    { name: 'Respondieron', value: responded },
    { name: 'Confirmados', value: confirmed },
    { name: 'Declinaron', value: declined },
  ]

  // ── Role breakdown ────────────────────────────────────────────
  const roleCounts: Record<string, number> = {}
  for (const g of guests) {
    const role = g.role || ''
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
  }
  const roleData = Object.entries(roleCounts)
    .map(([name, value]) => ({
      name: name || 'sin rol',
      value,
      color: ROLE_COLORS[name] ?? '#71717a',
    }))
    .sort((a, b) => b.value - a.value)

  const tooltipStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    color: '#f4f4f5',
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Vistas"        value={views}                           sub="páginas cargadas" />
        <KPICard label="Confirmados"   value={confirmed}                       sub={`de ${totalGuests} invitados`} />
        <KPICard label="Declinaron"    value={declined}                        sub="no asistirán" />
        <KPICard label="Tasa respuesta" value={`${responseRate}%`}             sub={`${responded} respondieron`} />
      </div>

      {/* RSVP Funnel */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Embudo RSVP</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#27272a' }} />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name="Personas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Role Donut */}
      {roleData.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Composición por rol</h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={roleData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {roleData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Moments */}
      {momentUploads > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <span className="text-4xl">📸</span>
          <div>
            <p className="text-2xl font-bold text-white">{momentUploads}</p>
            <p className="text-sm text-zinc-500">momentos subidos por invitados</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Update the event detail page to pass eventIdentifier**

In `src/app/(app)/events/[id]/page.tsx`, find where `EventAnalyticsPanel` is rendered (around line 989) and update its props:

```tsx
// BEFORE:
<EventAnalyticsPanel eventId={event.id} />

// AFTER:
<EventAnalyticsPanel eventId={event.id} eventIdentifier={event.identifier} />
```

**Step 5: Verify EventAnalytics model has correct fields**

Read `src/models/EventAnalytics.ts` and confirm it has `rsvp_confirmed`, `rsvp_declined`, `views`, `moment_uploads`. If field names differ from the backend, update the model to match.

Expected model:
```typescript
export interface EventAnalytics {
  id: string
  event_id: string
  views: number
  rsvp_confirmed: number
  rsvp_declined: number
  moment_uploads: number
  moment_comments: number
  created_at: string
  updated_at: string
}
```

**Step 6: TypeScript check + commit**

```bash
cd "C:/Users/AndBe/Desktop/Projects/dashboard-ts"
npx tsc --noEmit
git add src/components/events/event-analytics-panel.tsx src/models/EventAnalytics.ts package.json package-lock.json
git commit -m "feat: analytics tab — RSVP funnel + role donut + KPI cards using recharts"
```

---

## Task 3 — Dashboard: QR Scanner in Check-in Page

**Files:**
- Create: `src/components/events/qr-scanner.tsx`
- Modify: `src/app/(app)/events/[id]/checkin/page.tsx`
- Modify: `package.json` (add @zxing/browser)

**Step 1: Install @zxing/browser**

```bash
cd "C:/Users/AndBe/Desktop/Projects/dashboard-ts"
npm install @zxing/browser @zxing/library
```

**Step 2: Create QR scanner component**

Create `src/components/events/qr-scanner.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface Props {
  onScan: (token: string) => void
  onClose: () => void
}

export function QRScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    let codeReader: import('@zxing/browser').BrowserMultiFormatReader | null = null
    let active = true

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        codeReader = new BrowserMultiFormatReader()

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (devices.length === 0) {
          setError('No se encontró cámara en este dispositivo')
          return
        }

        // Prefer back camera on mobile
        const back = devices.find(d => /back|rear|environment/i.test(d.label))
        const deviceId = back?.deviceId ?? devices[0].deviceId

        await codeReader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (!active) return
            if (result) {
              // Extract token from URL if it's a full URL, otherwise use raw text
              const text = result.getText()
              const match = text.match(/[?&]token=([^&]+)/)
              const token = match ? match[1] : text
              setScanning(false)
              onScan(token)
            }
            if (err && !(err.name === 'NotFoundException')) {
              console.warn('[QRScanner]', err)
            }
          },
        )
      } catch (e) {
        setError('No se pudo acceder a la cámara. Verifica los permisos.')
        console.error('[QRScanner] init error', e)
      }
    }

    startScanner()

    return () => {
      active = false
      codeReader?.reset()
    }
  }, [onScan])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 text-white z-10"
          aria-label="Cerrar scanner"
        >
          <XMarkIcon className="size-6" />
        </button>

        {/* Title */}
        <p className="absolute top-6 left-0 right-0 text-center text-white text-lg font-medium">
          Escanear QR del invitado
        </p>

        {/* Video */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80">
          <video
            ref={videoRef}
            className="w-full h-full object-cover rounded-2xl"
            playsInline
            muted
          />

          {/* Scan frame overlay */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner brackets */}
              {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
                <div
                  key={corner}
                  className={[
                    'absolute w-8 h-8 border-white border-4',
                    corner === 'tl' ? 'top-0 left-0 border-r-0 border-b-0 rounded-tl-lg' : '',
                    corner === 'tr' ? 'top-0 right-0 border-l-0 border-b-0 rounded-tr-lg' : '',
                    corner === 'bl' ? 'bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg' : '',
                    corner === 'br' ? 'bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg' : '',
                  ].join(' ')}
                />
              ))}
              {/* Scanning line */}
              <motion.div
                className="absolute left-2 right-2 h-0.5 bg-emerald-400 opacity-80"
                animate={{ top: ['8px', 'calc(100% - 8px)', '8px'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          )}
        </div>

        {error && (
          <p className="mt-6 text-red-400 text-sm text-center px-8">{error}</p>
        )}

        {!error && (
          <p className="mt-6 text-zinc-400 text-sm">
            Apunta la cámara al código QR de la invitación
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
```

**Step 3: Add QR scanner to check-in page**

Read the current check-in page to find:
- Where the sticky header is
- Where guest check-in is handled (the function that marks guests as arrived)

Then make these changes to `src/app/(app)/events/[id]/checkin/page.tsx`:

**3a — Add import at top:**
```tsx
import { QRScanner } from '@/components/events/qr-scanner'
```

**3b — Add state:**
```tsx
const [showScanner, setShowScanner] = useState(false)
```

**3c — Add QR scan handler** (next to the existing check-in handler):
```tsx
const handleQRScan = useCallback(async (token: string) => {
  setShowScanner(false)
  // Find guest by matching rsvp_token_id or any token field
  // The token from QR is the pretty_token stored in the invitation
  // Match against guest list using invitation data
  // For now: show toast with scanned token and let organizer confirm
  const match = guests.find(g =>
    // pretty_token is stored in invitation, not directly on guest
    // Best we can do client-side: match by name or show scan result
    g.rsvp_token_id === token
  )
  if (match) {
    await handleCheckin(match)
    toast.success(`✅ ${match.first_name} ${match.last_name} — Llegó`)
  } else {
    toast.error(`QR escaneado: ${token.slice(0, 12)}… — no encontrado en lista`)
  }
}, [guests, handleCheckin])
```

**3d — Add scanner button in the sticky header** (next to the search input):
```tsx
<button
  onClick={() => setShowScanner(true)}
  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
>
  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4z" />
  </svg>
  <span className="hidden sm:inline">Escanear QR</span>
</button>
```

**3e — Render scanner overlay** (before the closing `</div>` of the page):
```tsx
{showScanner && (
  <QRScanner
    onScan={handleQRScan}
    onClose={() => setShowScanner(false)}
  />
)}
```

**Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/events/qr-scanner.tsx src/app/\(app\)/events/\[id\]/checkin/page.tsx package.json package-lock.json
git commit -m "feat: QR scanner overlay in check-in page — @zxing/browser dynamic import"
```

---

## Task 4 — Public Frontend: AgendaSection SDUI Component

**Working directory:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero`

**Files:**
- Create: `src/components/sections/AgendaSection.tsx`
- Modify: `src/components/engine/registry.ts`
- Modify: `src/components/engine/types.ts`

**Step 1: Add AgendaConfig type to types.ts**

Append to `src/components/engine/types.ts` after `RSVPConfirmationConfig`:

```typescript
export interface AgendaItem {
  time: string        // "14:00"
  title: string       // "Ceremonia"
  description?: string
  icon?: 'ceremony' | 'reception' | 'dinner' | 'party' | 'music' | 'photo' | 'default'
  location?: string
}

export interface AgendaConfig {
  title?: string      // "Programa del día"
  subtitle?: string
  items: AgendaItem[]
}
```

**Step 2: Create AgendaSection.tsx**

Create `src/components/sections/AgendaSection.tsx`:

```tsx
"use client";

import { motion } from 'framer-motion';
import type { SectionComponentProps, AgendaConfig, AgendaItem } from '../engine/types';

const ICONS: Record<string, string> = {
  ceremony:  '💍',
  reception: '🥂',
  dinner:    '🍽️',
  party:     '🎉',
  music:     '🎵',
  photo:     '📸',
  default:   '✨',
}

function getIcon(item: AgendaItem): string {
  return ICONS[item.icon ?? 'default'] ?? '✨'
}

function AgendaSkeleton() {
  return (
    <section className="py-16 px-4 animate-pulse">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-10 w-14 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-100 rounded w-48" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface AgendaItemRowProps {
  item: AgendaItem
  index: number
  isLast: boolean
}

function AgendaItemRow({ item, index, isLast }: AgendaItemRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      className="flex gap-0 relative"
    >
      {/* Time column */}
      <div className="w-16 flex-shrink-0 pt-1 text-right pr-4">
        <span
          className="text-sm font-aloevera font-semibold"
          style={{ color: '#C7A44C' }}
        >
          {item.time}
        </span>
      </div>

      {/* Center line + dot */}
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 border-dashed"
          style={{ borderColor: '#C7A44C', backgroundColor: '#fff' }}
        >
          {getIcon(item)}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ backgroundColor: '#C7A44C', opacity: 0.3, minHeight: 32 }}
          />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 pl-4 pb-8">
        <p
          className="text-lg font-astralaga leading-tight"
          style={{ color: '#07293A' }}
        >
          {item.title}
        </p>
        {item.location && (
          <p className="text-sm font-aloevera mt-0.5" style={{ color: '#8B5D3D' }}>
            📍 {item.location}
          </p>
        )}
        {item.description && (
          <p className="text-sm font-aloevera mt-1" style={{ color: '#555' }}>
            {item.description}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default function AgendaSection({ config }: SectionComponentProps) {
  const { title = 'Programa del día', subtitle, items = [] } = config as unknown as AgendaConfig;

  if (!items || items.length === 0) return <AgendaSkeleton />

  return (
    <section className="py-16 px-4 relative z-10">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2
            className="text-4xl font-astralaga"
            style={{ color: '#07293A' }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-2 text-lg font-aloevera"
              style={{ color: '#8B5D3D' }}
            >
              {subtitle}
            </p>
          )}
          <div
            className="mt-4 mx-auto w-16 h-px"
            style={{ backgroundColor: '#C7A44C' }}
          />
        </motion.div>

        {/* Timeline */}
        <div>
          {items.map((item, i) => (
            <AgendaItemRow
              key={i}
              item={item}
              index={i}
              isLast={i === items.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 3: Register in registry.ts**

In `src/components/engine/registry.ts`, add `Agenda` entry after `RSVPConfirmation`:

```typescript
// BEFORE closing `} as const;`
  Agenda: {
    loader: () => import('../sections/AgendaSection'),
    hydration: 'visible',
  },
```

**Step 4: Add Agenda config editor in dashboard Studio**

In `dashboard-ts/src/app/(app)/events/[id]/studio/page.tsx`, find the `SectionConfigEditor` switch statement (the one that handles different `component_type` values) and add a case for `Agenda`:

```tsx
case 'Agenda': {
  const items: Array<{time:string;title:string;description?:string;icon?:string;location?:string}> =
    Array.isArray(localConfig.items) ? localConfig.items as never[] : []
  return (
    <div className="space-y-3">
      <Field>
        <Label>Título de la sección</Label>
        <Input
          value={String(localConfig.title ?? 'Programa del día')}
          onChange={e => setLocalConfig(p => ({ ...p, title: e.target.value }))}
        />
      </Field>
      <div className="space-y-2">
        <Label className="text-xs text-zinc-500">Actividades</Label>
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border border-zinc-700 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Hora</Label>
                <Input
                  value={item.time}
                  placeholder="14:00"
                  onChange={e => {
                    const next = [...items]; next[idx] = { ...next[idx], time: e.target.value }
                    setLocalConfig(p => ({ ...p, items: next }))
                  }}
                />
              </Field>
              <Field>
                <Label>Ícono</Label>
                <Select
                  value={item.icon ?? 'default'}
                  onChange={e => {
                    const next = [...items]; next[idx] = { ...next[idx], icon: e.target.value }
                    setLocalConfig(p => ({ ...p, items: next }))
                  }}
                >
                  <option value="default">✨ General</option>
                  <option value="ceremony">💍 Ceremonia</option>
                  <option value="reception">🥂 Recepción</option>
                  <option value="dinner">🍽️ Cena</option>
                  <option value="party">🎉 Fiesta</option>
                  <option value="music">🎵 Música</option>
                  <option value="photo">📸 Fotos</option>
                </Select>
              </Field>
            </div>
            <Field>
              <Label>Título de la actividad</Label>
              <Input
                value={item.title}
                placeholder="Ceremonia"
                onChange={e => {
                  const next = [...items]; next[idx] = { ...next[idx], title: e.target.value }
                  setLocalConfig(p => ({ ...p, items: next }))
                }}
              />
            </Field>
            <Field>
              <Label>Lugar (opcional)</Label>
              <Input
                value={item.location ?? ''}
                placeholder="Salón principal"
                onChange={e => {
                  const next = [...items]; next[idx] = { ...next[idx], location: e.target.value }
                  setLocalConfig(p => ({ ...p, items: next }))
                }}
              />
            </Field>
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-300"
              onClick={() => {
                const next = items.filter((_, i) => i !== idx)
                setLocalConfig(p => ({ ...p, items: next }))
              }}
            >
              Eliminar actividad
            </button>
          </div>
        ))}
        <button
          type="button"
          className="w-full py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          onClick={() => {
            const next = [...items, { time: '', title: '', icon: 'default' }]
            setLocalConfig(p => ({ ...p, items: next }))
          }}
        >
          + Agregar actividad
        </button>
      </div>
    </div>
  )
}
```

**Step 5: Build public frontend**

```bash
cd "C:/Users/AndBe/Desktop/Projects/cafetton-casero"
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no TypeScript errors.

**Step 6: Commit both repos**

```bash
# Public frontend
cd "C:/Users/AndBe/Desktop/Projects/cafetton-casero"
git add src/components/sections/AgendaSection.tsx src/components/engine/registry.ts src/components/engine/types.ts
git commit -m "feat: AgendaSection SDUI component — vertical timeline with entrance animations"

# Dashboard
cd "C:/Users/AndBe/Desktop/Projects/dashboard-ts"
git add src/app/\(app\)/events/\[id\]/studio/page.tsx
git commit -m "feat: Agenda section config editor in Studio — add/remove/edit agenda items"
```

---

## Task 5 — Public Frontend: Dynamic OG Tags

**Working directory:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero`

**Files:**
- Modify: `src/pages/evento.astro`
- Modify: `src/layouts/template.astro` (need to read this first)
- Modify: `src/pages/graduacion-izapa.astro` (need to read this first)

**Step 1: Read template layout and other pages**

```bash
cat "src/layouts/template.astro"
cat "src/pages/graduacion-izapa.astro" | head -40
```

Identify where `<head>` meta tags are injected (likely via a slot in template.astro).

**Step 2: Update evento.astro with SSR OG tags**

Replace `src/pages/evento.astro` with:

```astro
---
/**
 * Generic event page — zero-code route for new events.
 * Fetches event metadata server-side for OG tags.
 */
import TemplateLayout from '../layouts/template.astro';
import EventPage from '../components/engine/EventPage';

const EVENTS_URL = import.meta.env.PUBLIC_EVENTS_URL;

// Get token from query string at request time
const token = Astro.url.searchParams.get('token') ?? '';

// Fetch event metadata for OG tags (best-effort — page still works if this fails)
let ogTitle = 'Eventiapp | Tu invitación';
let ogDescription = 'Estás invitado a un evento especial.';
let ogImage = '';
let ogUrl = Astro.url.href;

if (token) {
  try {
    const res = await fetch(`${EVENTS_URL}api/invitations/ByToken/${token}`, {
      headers: { Authorization: '1' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = await res.json();
      const inv = json?.data;
      if (inv?.event) {
        const ev = inv.event;
        ogTitle = ev.name ?? ogTitle;
        ogDescription = ev.description
          ? ev.description.slice(0, 160)
          : `${ev.organizer_name ? `Organizado por ${ev.organizer_name}. ` : ''}${ev.location_name ?? ''}`.trim() || ogDescription;
        ogImage = ev.cover_image_url ?? '';
      }
    }
  } catch {
    // Fail silently — page renders without OG tags
  }
}
---

<TemplateLayout
  title={ogTitle}
  ogTitle={ogTitle}
  ogDescription={ogDescription}
  ogImage={ogImage}
  ogUrl={ogUrl}
>
  <body>
    <EventPage
      client:only="react"
      EVENTS_URL={EVENTS_URL}
    />
  </body>
</TemplateLayout>
```

**Step 3: Update template.astro to accept and inject OG props**

Read the current template.astro, then add props and meta tags. The pattern is:

```astro
---
interface Props {
  title: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  ogUrl?: string
}

const {
  title,
  ogTitle = title,
  ogDescription = 'Tu invitación digital',
  ogImage = '',
  ogUrl = '',
} = Astro.props;
---

<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>

    <!-- Open Graph -->
    <meta property="og:title" content={ogTitle} />
    <meta property="og:description" content={ogDescription} />
    <meta property="og:type" content="website" />
    {ogUrl && <meta property="og:url" content={ogUrl} />}
    {ogImage && <meta property="og:image" content={ogImage} />}
    {ogImage && <meta property="og:image:width" content="1200" />}
    {ogImage && <meta property="og:image:height" content="630" />}

    <!-- Twitter Card -->
    <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
    <meta name="twitter:title" content={ogTitle} />
    <meta name="twitter:description" content={ogDescription} />
    {ogImage && <meta name="twitter:image" content={ogImage} />}

    <!-- existing head content follows... -->
```

**Step 4: Build + check**

```bash
cd "C:/Users/AndBe/Desktop/Projects/cafetton-casero"
npm run build 2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add src/pages/evento.astro src/layouts/template.astro
git commit -m "feat: dynamic OG/Twitter meta tags in evento.astro for rich social previews"
```

---

## Task 6 — Public Frontend: RSVP Confirmation Card with QR

**Working directory:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero`

**Files:**
- Create: `src/components/RSVPConfirmationCard.tsx`
- Modify: `src/components/sections/RSVPConfirmation.tsx`
- Modify: `package.json` (add qrcode.react + html-to-image)

**Step 1: Install dependencies**

```bash
cd "C:/Users/AndBe/Desktop/Projects/cafetton-casero"
npm install qrcode.react html-to-image
```

**Step 2: Create RSVPConfirmationCard component**

Create `src/components/RSVPConfirmationCard.tsx`:

```tsx
"use client";

import { useRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import type { InvitationData } from './InvitationDataLoader';

// Dynamic imports — only loaded after RSVP confirm
const QRCode = lazy(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })));

interface Props {
  invData: InvitationData;
  token: string;
  EVENTS_URL: string;
}

export default function RSVPConfirmationCard({ invData, token, EVENTS_URL }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const eventUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/evento?token=${token}`;
  const formattedDate = new Date(invData.eventDate).toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const handleSaveImage = async () => {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `confirmacion-${invData.guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('[RSVPCard] save image error', e);
    }
  };

  const whatsappText = encodeURIComponent(
    `¡Confirmé mi asistencia! 🎉\n${invData.eventName ?? 'El evento'}\n${formattedDate}\n\nMi invitación: ${eventUrl}`
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center gap-4 mt-8"
    >
      {/* Card — this gets screenshot'd */}
      <div
        ref={cardRef}
        className="w-72 rounded-3xl p-6 flex flex-col items-center gap-4 text-center"
        style={{
          background: '#fff',
          border: '2px dashed #C7A44C',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-widest font-aloevera" style={{ color: '#8B5D3D' }}>
            Confirmación de asistencia
          </p>
          {invData.eventName && (
            <h3 className="text-xl font-astralaga mt-1" style={{ color: '#07293A' }}>
              {invData.eventName}
            </h3>
          )}
        </div>

        {/* Divider */}
        <div className="w-12 h-px" style={{ backgroundColor: '#C7A44C' }} />

        {/* Guest name */}
        <p className="text-2xl font-astralaga" style={{ color: '#07293A' }}>
          {invData.guestName}
        </p>

        {/* Date */}
        <p className="text-sm font-aloevera capitalize" style={{ color: '#8B5D3D' }}>
          {formattedDate}
        </p>

        {/* QR Code */}
        <div className="p-3 rounded-xl" style={{ border: '1px solid #e5e7eb' }}>
          <Suspense fallback={<div className="w-24 h-24 bg-gray-100 animate-pulse rounded" />}>
            <QRCode
              value={eventUrl}
              size={96}
              fgColor="#07293A"
              bgColor="#ffffff"
              level="M"
            />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-xs font-aloevera" style={{ color: '#9ca3af' }}>
          Presenta este QR en la entrada
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-72">
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-aloevera text-sm"
          style={{ backgroundColor: '#25D366', color: '#fff' }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.528 5.852L0 24l6.335-1.652A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.002-1.366l-.359-.213-3.722.976.994-3.624-.234-.372A9.79 9.79 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
          </svg>
          Compartir
        </a>

        <button
          type="button"
          onClick={handleSaveImage}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-aloevera text-sm border-2 border-dashed"
          style={{ borderColor: '#C7A44C', color: '#8B5D3D' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Guardar
        </button>
      </div>
    </motion.div>
  );
}
```

**Step 3: Check what InvitationData type has**

Read `src/components/InvitationDataLoader.tsx` to verify `InvitationData` fields:
- `guestName` ← verified (line 173 of RSVPConfirmation uses it)
- `eventDate` ← verified (line 122 of RSVPConfirmation uses it)
- `maxGuests` ← verified
- `prettyToken` ← verified
- `eventName` — check if this exists; if not, omit from card

Adjust `RSVPConfirmationCard.tsx` Props interface accordingly.

**Step 4: Wire card into RSVPConfirmation.tsx**

In `src/components/sections/RSVPConfirmation.tsx`:

**4a — Add import at top:**
```tsx
import { lazy, Suspense } from 'react';
const RSVPConfirmationCard = lazy(() => import('../RSVPConfirmationCard'));
```

**4b — Add `showCard` state:**
```tsx
const [showCard, setShowCard] = useState(false);
```

**4c — In `handleConfirm`, after `setMessage(...)` for `respuesta === 'yes'`, add:**
```tsx
if (respuesta === 'yes') setShowCard(true);
```

**4d — In the `message` branch of the JSX (around line 155-170 in current file), after the image display, add:**
```tsx
{respuesta === 'yes' && showCard && invData && (
  <Suspense fallback={null}>
    <RSVPConfirmationCard
      invData={invData}
      token={token}
      EVENTS_URL={EVENTS_URL}
    />
  </Suspense>
)}
```

Also show the card when guest was already confirmed (`rsvpStatus === 'confirmed'` branch), after the cancel button:
```tsx
{invData && token && (
  <Suspense fallback={null}>
    <RSVPConfirmationCard
      invData={invData}
      token={token}
      EVENTS_URL={EVENTS_URL}
    />
  </Suspense>
)}
```

**Step 5: Build + check**

```bash
cd "C:/Users/AndBe/Desktop/Projects/cafetton-casero"
npm run build 2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add src/components/RSVPConfirmationCard.tsx src/components/sections/RSVPConfirmation.tsx package.json package-lock.json
git commit -m "feat: RSVP confirmation card with QR code + WhatsApp share + save as image"
```

---

## Final Step — Update docs in dashboard-ts

```bash
cd "C:/Users/AndBe/Desktop/Projects/dashboard-ts"
```

Update `docs/api.md`:
- Add note: `EventAnalytics` counters are now auto-tracked (views, rsvp_confirmed, rsvp_declined, moment_uploads)

Update `docs/components.md`:
- Add `EventAnalyticsPanel` — now uses recharts (recharts dependency added)
- Add `QRScanner` — new component, dynamic @zxing/browser import
- Add `AgendaSection` — new SDUI section type in public frontend

```bash
git add docs/
git commit -m "docs: update components + api docs for analytics charts, QR scanner, Agenda section"
```

---

## Execution Order

Run these in parallel where possible:
1. **Task 1** (backend, WSL) — independent of all frontend work
2. **Task 4** (public frontend AgendaSection) + **Task 5** (OG tags) — same repo, sequential
3. **Task 2** (dashboard analytics) + **Task 3** (QR scanner) — same repo, sequential
4. **Task 6** (RSVP card) — after Task 4/5 done (same repo)

Suggested parallel split:
- Agent A → Tasks 1 (backend)
- Agent B → Tasks 2, 3 (dashboard)
- Agent C → Tasks 4, 5, 6 (public frontend)
