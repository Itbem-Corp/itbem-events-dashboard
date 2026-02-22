# Event Self-Healing System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect and repair broken/missing event data transparently when an admin opens an event, with no visible interruption.

**Architecture:** Backend `POST /events/:id/repair` endpoint validates and fixes event data atomically. Frontend `useEventHealthCheck` hook detects issues, triggers repair, and shows a subtle toast. An `EventErrorBoundary` catches render crashes. A `sanitizeEvent()` utility provides immediate in-memory defaults.

**Tech Stack:** Go/Echo/GORM (backend), React/Next.js/SWR/TypeScript (frontend), Sonner toasts

---

### Task 1: Backend — Create RepairService

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/events/RepairService.go`

**Step 1: Write the RepairService**

```go
package events

import (
	"fmt"
	"time"

	"events-stocks/models"
	"events-stocks/repositories/eventanalyticsrepository"
	"events-stocks/repositories/eventconfigrepository"
	"events-stocks/repositories/eventsrepository"
	"events-stocks/utils"
	"github.com/gofrs/uuid"
	"gorm.io/gorm"
)

type RepairResult struct {
	Repaired bool     `json:"repaired"`
	Fixes    []string `json:"fixes"`
	Warnings []string `json:"warnings"`
}

func RepairEvent(db *gorm.DB, eventID uuid.UUID) (*RepairResult, error) {
	result := &RepairResult{}

	// Load event with preloads
	var event models.Event
	if err := db.Preload("EventType").Preload("EventConfig").Preload("EventConfig.DesignTemplate").
		First(&event, "id = ?", eventID).Error; err != nil {
		return nil, fmt.Errorf("event not found: %w", err)
	}

	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// ── Tier 1: Missing records ──────────────────────────────────────────

	// 1a. EventConfig missing
	var configCount int64
	tx.Model(&models.EventConfig{}).Where("id = ?", eventID).Count(&configCount)
	if configCount == 0 {
		cfg := &models.EventConfig{ID: eventID}
		if err := tx.Create(cfg).Error; err == nil {
			result.Fixes = append(result.Fixes, "created missing event_config")
		}
	}

	// 1b. EventAnalytics missing
	var analyticsCount int64
	tx.Model(&models.EventAnalytics{}).Where("event_id = ?", eventID).Count(&analyticsCount)
	if analyticsCount == 0 {
		a := &models.EventAnalytics{EventID: eventID}
		if err := tx.Create(a).Error; err == nil {
			result.Fixes = append(result.Fixes, "created missing event_analytics")
		}
	}

	// 1c. EventType FK invalid
	if event.EventType.ID == uuid.Nil {
		var firstType models.EventType
		if err := tx.First(&firstType).Error; err == nil {
			tx.Model(&event).Update("event_type_id", firstType.ID)
			result.Fixes = append(result.Fixes, fmt.Sprintf("reassigned event_type to '%s'", firstType.Name))
		}
	}

	// ── Tier 2: Invalid field values ─────────────────────────────────────

	updates := map[string]interface{}{}

	if event.Identifier == "" {
		if event.Name != "" {
			newSlug := utils.Slugify(event.Name)
			if newSlug == "" {
				newSlug = "event"
			}
			candidate := newSlug
			for i := 2; eventsrepository.IdentifierExists(candidate); i++ {
				candidate = fmt.Sprintf("%s-%d", newSlug, i)
			}
			updates["identifier"] = candidate
			result.Fixes = append(result.Fixes, fmt.Sprintf("regenerated identifier: '%s'", candidate))
		} else {
			result.Warnings = append(result.Warnings, "event name is empty — cannot generate identifier")
		}
	}

	if event.Name == "" {
		result.Warnings = append(result.Warnings, "event name is empty — cannot auto-repair")
	}

	if event.Timezone == "" {
		updates["timezone"] = "America/Mexico_City"
		result.Fixes = append(result.Fixes, "set timezone to 'America/Mexico_City'")
	}

	if event.EventDateTime.IsZero() || event.EventDateTime.Year() <= 1970 {
		future := time.Now().AddDate(0, 0, 30)
		updates["event_date_time"] = future
		result.Fixes = append(result.Fixes, "set event_date_time to now+30d placeholder")
	}

	if event.Language == "" {
		updates["language"] = "es"
		result.Fixes = append(result.Fixes, "set language to 'es'")
	}

	if len(updates) > 0 {
		tx.Model(&event).Updates(updates)
	}

	// ── Tier 3: Inconsistent relations ───────────────────────────────────

	// 3a. Config design_template_id points to nonexistent template
	var config models.EventConfig
	if err := tx.Preload("DesignTemplate").First(&config, "id = ?", eventID).Error; err == nil {
		if config.DesignTemplateID != nil && *config.DesignTemplateID != uuid.Nil {
			var tplCount int64
			tx.Model(&models.DesignTemplate{}).Where("id = ?", *config.DesignTemplateID).Count(&tplCount)
			if tplCount == 0 {
				tx.Model(&config).Update("design_template_id", nil)
				result.Fixes = append(result.Fixes, "cleared orphaned design_template_id")
			}
		}
	}

	// 3b. Guests with zero-UUID guest_status_id
	var pendingStatus models.GuestStatus
	if err := tx.Where("UPPER(code) = ?", "PENDING").First(&pendingStatus).Error; err == nil {
		zeroUUID := uuid.Nil
		res := tx.Model(&models.Guest{}).
			Where("event_id = ? AND guest_status_id = ?", eventID, zeroUUID).
			Update("guest_status_id", pendingStatus.ID)
		if res.RowsAffected > 0 {
			result.Fixes = append(result.Fixes, fmt.Sprintf("fixed %d guests with zero guest_status_id", res.RowsAffected))
		}
	}

	// 3c. Invitations with max_guests = 0
	res := tx.Table("invitations").
		Where("event_id = ? AND max_guests = 0", eventID).
		Update("max_guests", 1)
	if res.RowsAffected > 0 {
		result.Fixes = append(result.Fixes, fmt.Sprintf("set max_guests=1 on %d invitations", res.RowsAffected))
	}

	// ── Tier 4: Stuck moments ────────────────────────────────────────────

	thirtyMinAgo := time.Now().Add(-30 * time.Minute)
	oneHourAgo := time.Now().Add(-1 * time.Hour)

	res = tx.Model(&models.Moment{}).
		Where("event_id = ? AND processing_status = ? AND updated_at < ?", eventID, "processing", thirtyMinAgo).
		Update("processing_status", "failed")
	if res.RowsAffected > 0 {
		result.Fixes = append(result.Fixes, fmt.Sprintf("marked %d stuck 'processing' moments as 'failed'", res.RowsAffected))
	}

	res = tx.Model(&models.Moment{}).
		Where("event_id = ? AND processing_status = ? AND created_at < ?", eventID, "pending", oneHourAgo).
		Update("processing_status", "failed")
	if res.RowsAffected > 0 {
		result.Fixes = append(result.Fixes, fmt.Sprintf("marked %d stuck 'pending' moments as 'failed'", res.RowsAffected))
	}

	// ── Commit ───────────────────────────────────────────────────────────

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("repair transaction failed: %w", err)
	}

	result.Repaired = len(result.Fixes) > 0
	return result, nil
}
```

**Step 2: Commit**

```bash
git add services/events/RepairService.go
git commit -m "feat: add RepairEvent service for self-healing event data"
```

---

### Task 2: Backend — Create RepairController and register route

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/events/repair_controller.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Create the controller**

```go
package events

import (
	"net/http"

	"events-stocks/configuration"
	eventsService "events-stocks/services/events"
	"events-stocks/utils"
	"github.com/gofrs/uuid"
	"github.com/labstack/echo/v4"
)

// RepairEvent validates and fixes event data integrity issues.
// Route: POST /api/events/:id/repair (protected)
func RepairEvent(c echo.Context) error {
	idParam := c.Param("id")
	eventID, err := uuid.FromString(idParam)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
	}

	db := configuration.GetDB()
	result, err := eventsService.RepairEvent(db, eventID)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Repair failed", err.Error())
	}

	return utils.Success(c, http.StatusOK, "Event repair complete", result)
}
```

**Step 2: Register the route**

In `routes/routes.go`, add to the protected group (after `protected.DELETE("/events/:id", events.DeleteEvent)`):

```go
protected.POST("/events/:id/repair", events.RepairEvent)
```

**Step 3: Verify the backend compiles**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 4: Commit**

```bash
git add controllers/events/repair_controller.go routes/routes.go
git commit -m "feat: add POST /events/:id/repair endpoint"
```

---

### Task 3: Frontend — Create sanitizeEvent utility

**Files:**
- Create: `src/lib/sanitize-event.ts`

**Step 1: Write the sanitizer**

```typescript
import type { Event } from '@/models/Event'

/**
 * Applies safe in-memory defaults to an event object.
 * This runs synchronously before render — it does NOT persist changes.
 * The backend repair endpoint handles persistence.
 */
export function sanitizeEvent(event: Event): Event {
  return {
    ...event,
    timezone: event.timezone || 'America/Mexico_City',
    language: event.language || 'es',
    identifier: event.identifier || event.id,
  }
}

/** List of issues detected in the event data that warrant a backend repair call. */
export interface EventIssue {
  field: string
  issue: string
}

/**
 * Analyzes an event for data integrity problems.
 * Returns an array of issues — if empty, no repair is needed.
 */
export function detectEventIssues(event: Event): EventIssue[] {
  const issues: EventIssue[] = []

  if (!event.identifier) {
    issues.push({ field: 'identifier', issue: 'empty' })
  }
  if (!event.timezone) {
    issues.push({ field: 'timezone', issue: 'empty' })
  }
  if (!event.event_date_time || event.event_date_time.startsWith('0001')) {
    issues.push({ field: 'event_date_time', issue: 'zero or missing' })
  }
  if (!event.language) {
    issues.push({ field: 'language', issue: 'empty' })
  }
  if (event.event_type_id && !event.event_type) {
    issues.push({ field: 'event_type', issue: 'FK present but relation not loaded' })
  }
  if (!event.config) {
    issues.push({ field: 'config', issue: 'missing event_config' })
  }

  return issues
}
```

**Step 2: Commit**

```bash
git add src/lib/sanitize-event.ts
git commit -m "feat: add sanitizeEvent utility and issue detector"
```

---

### Task 4: Frontend — Create useEventHealthCheck hook

**Files:**
- Create: `src/hooks/useEventHealthCheck.ts`

**Step 1: Write the hook**

```typescript
'use client'

import { useRef, useEffect, useState } from 'react'
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'
import { detectEventIssues } from '@/lib/sanitize-event'

interface RepairResult {
  repaired: boolean
  fixes: string[]
  warnings: string[]
}

export function useEventHealthCheck(event: Event | undefined) {
  const hasRun = useRef(false)
  const [isRepairing, setIsRepairing] = useState(false)

  useEffect(() => {
    if (!event || hasRun.current) return
    hasRun.current = true

    const issues = detectEventIssues(event)
    if (issues.length === 0) return

    setIsRepairing(true)

    api.post<{ data: RepairResult }>(`/events/${event.id}/repair`)
      .then((res) => {
        const result = res.data?.data ?? res.data
        if (result?.repaired) {
          // Revalidate all event-related SWR keys
          mutate(`/events/${event.id}`)
          mutate(`/events/${event.id}/config`)
          mutate(`/events/${event.id}/analytics`)
          mutate(`/moments?event_id=${event.id}`)

          const count = result.fixes?.length ?? 0
          toast.success(
            `Datos del evento optimizados (${count} corrección${count !== 1 ? 'es' : ''})`,
            { duration: 4000 }
          )

          if (result.warnings?.length) {
            for (const w of result.warnings) {
              toast.warning(w, { duration: 6000 })
            }
          }
        }
      })
      .catch(() => {
        // Repair is best-effort — don't interrupt the user
        console.warn('[HealthCheck] Repair call failed for event', event.id)
      })
      .finally(() => {
        setIsRepairing(false)
      })
  }, [event])

  return { isRepairing }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useEventHealthCheck.ts
git commit -m "feat: add useEventHealthCheck hook for transparent data repair"
```

---

### Task 5: Frontend — Create EventErrorBoundary

**Files:**
- Create: `src/components/events/event-error-boundary.tsx`

**Step 1: Write the error boundary**

```typescript
'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  eventId?: string
}

interface State {
  hasError: boolean
}

export class EventErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EventErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-24 text-center">
          <p className="text-sm text-red-400 mb-4">
            Algo salió mal al mostrar este evento.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

**Step 2: Commit**

```bash
git add src/components/events/event-error-boundary.tsx
git commit -m "feat: add EventErrorBoundary component"
```

---

### Task 6: Frontend — Integrate hook, boundary, and sanitizer into event detail page

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx`

**Step 1: Add imports (top of file, after existing imports)**

Add after the existing imports around line 28:

```typescript
import { EventErrorBoundary } from '@/components/events/event-error-boundary'
import { useEventHealthCheck } from '@/hooks/useEventHealthCheck'
import { sanitizeEvent } from '@/lib/sanitize-event'
```

**Step 2: Add hook call and sanitization**

After line 231 (`const event = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent`), add:

```typescript
const safeEvent = event ? sanitizeEvent(event) : undefined
```

Add after the `guestStatuses` SWR call (after line 252):

```typescript
// Self-healing: detect and repair data issues transparently
useEventHealthCheck(event)
```

**Step 3: Replace `event` with `safeEvent` in the render**

After the loading/error guards:
- Change line 388: `if (error || !event)` → `if (error || !safeEvent)`
- After line 394 (after the error guard), all references to `event` in the render section should use `safeEvent` instead.

However, to minimize diff size: rename `safeEvent` usage — add after the error guard:

```typescript
// After the error guard, use the sanitized version for rendering
const ev = safeEvent!
```

Then use `ev` in the render. But this is a large refactor — instead, simpler approach: just wrap the return in `EventErrorBoundary` and use `safeEvent` as the render source. Since `safeEvent` is derived from `event`, the simplest change is:

Replace:
```typescript
const event = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent
```
With:
```typescript
const rawUnwrapped = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent
const event = rawUnwrapped ? sanitizeEvent(rawUnwrapped) : undefined
```

And wrap the return JSX with `<EventErrorBoundary>`:

Replace:
```typescript
return (
    <PageTransition>
```
With:
```typescript
return (
    <EventErrorBoundary eventId={id}>
    <PageTransition>
```

And close it at the end:
```typescript
    </PageTransition>
    </EventErrorBoundary>
  )
```

**Step 4: Commit**

```bash
git add src/app/(app)/events/[id]/page.tsx
git commit -m "feat: integrate self-healing hook, sanitizer, and error boundary into event detail"
```

---

### Task 7: Frontend — Fix checkin page array unwrap bug

**Files:**
- Modify: `src/app/(app)/events/[id]/checkin/page.tsx:145-148`

**Step 1: Fix the array unwrap**

Replace:
```typescript
const { data: event } = useSWR<Event>(
    id ? `/events/${id}` : null,
    fetcher
  )
```
With:
```typescript
const { data: rawEvent } = useSWR<Event | Event[]>(
    id ? `/events/${id}` : null,
    fetcher
  )
  const event = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent
```

**Step 2: Commit**

```bash
git add src/app/(app)/events/[id]/checkin/page.tsx
git commit -m "fix: add array unwrap for event data in checkin page"
```

---

### Task 8: Frontend — Fix event-share-panel status fallback

**Files:**
- Modify: `src/components/events/event-share-panel.tsx:76-81`

**Step 1: Fix the status check**

Replace:
```typescript
  const confirmedWithEmail = guests.filter(
    (g) => g.status?.code === 'CONFIRMED' && g.email
  )
  const pendingWithEmail = guests.filter(
    (g) => g.status?.code === 'PENDING' && g.email
  )
```
With:
```typescript
  const confirmedWithEmail = guests.filter(
    (g) => (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === 'CONFIRMED' && g.email
  )
  const pendingWithEmail = guests.filter(
    (g) => (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === 'PENDING' && g.email
  )
```

**Step 2: Commit**

```bash
git add src/components/events/event-share-panel.tsx
git commit -m "fix: use rsvp_status fallback in event-share-panel guest filters"
```

---

### Task 9: Frontend — Fix event-analytics-panel NaN in capacity bar

**Files:**
- Modify: `src/components/events/event-analytics-panel.tsx:206-207`

**Step 1: Fix the capacity calculation**

Replace:
```typescript
  const maxGuests = guests[0]?.max_guests
  const capacityTotal = typeof maxGuests === 'number' && maxGuests > 0 ? maxGuests : estimatedAttendees
```
With:
```typescript
  const capacityTotal = Math.max(estimatedAttendees, 1)
```

This removes the broken `guests[0]?.max_guests` read (which always returns undefined) and ensures we never divide by zero.

**Step 2: Commit**

```bash
git add src/components/events/event-analytics-panel.tsx
git commit -m "fix: prevent NaN in capacity bar by removing broken max_guests read"
```

---

### Task 10: Frontend — Fix event-cover-upload PUT spread

**Files:**
- Modify: `src/components/events/event-cover-upload.tsx:61-66`

**Step 1: Fix the PUT payload**

Replace:
```typescript
  const handleRemoveCover = async () => {
    try {
      await api.put(`/events/${event.id}`, {
        ...event,
        cover_image_url: '',
      })
```
With:
```typescript
  const handleRemoveCover = async () => {
    try {
      await api.put(`/events/${event.id}`, {
        name: event.name,
        identifier: event.identifier,
        cover_image_url: '',
      })
```

**Step 2: Commit**

```bash
git add src/components/events/event-cover-upload.tsx
git commit -m "fix: send only required fields in cover remove PUT to avoid relation clobber"
```

---

### Task 11: Frontend — Fix filename sanitization in invitation-tracker

**Files:**
- Modify: `src/components/events/invitation-tracker.tsx:441`

**Step 1: Fix the CSV filename**

Replace:
```typescript
  a.download = `invitaciones-${event.name.replace(/\s+/g, '-').toLowerCase()}.csv`
```
With:
```typescript
  a.download = `invitaciones-${event.name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.csv`
```

**Step 2: Commit**

```bash
git add src/components/events/invitation-tracker.tsx
git commit -m "fix: sanitize unsafe characters in CSV download filename"
```

---

### Task 12: Frontend — Fix moments-wall file extension edge case

**Files:**
- Modify: `src/components/events/moments-wall.tsx:93`

**Step 1: Fix the extension extraction in the Lightbox download handler**

Replace:
```typescript
      const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg'
```
With:
```typescript
      const match = url.match(/\.(\w{2,5})(?:\?|$)/)
      const ext = match?.[1] ?? 'jpg'
```

**Step 2: Apply the same fix in handleDownloadZip (line 555)**

Replace:
```typescript
            const ext = resolveUrl(m).split('.').pop()?.split('?')[0] ?? 'jpg'
```
With:
```typescript
            const extMatch = resolveUrl(m).match(/\.(\w{2,5})(?:\?|$)/)
            const ext = extMatch?.[1] ?? 'jpg'
```

**Step 3: Commit**

```bash
git add src/components/events/moments-wall.tsx
git commit -m "fix: robust file extension extraction for moment downloads"
```

---

### Task 13: Verify everything compiles

**Step 1: Build the frontend**

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 2: Build the backend**

```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

Expected: Compiles with no errors.

**Step 3: Final commit if any fixes needed**

---

### Task 14: Run existing tests

**Step 1: Run frontend tests**

```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npm run test
```

Expected: All existing tests pass.

**Step 2: Fix any broken tests and commit**
