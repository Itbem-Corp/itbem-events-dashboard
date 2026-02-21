# Full-Stack Feature Sprint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose EventAnalytics endpoint in Go backend, add organizer contact to PageSpec, make cafetton Footer dynamic, add WhatsApp share + dietary RSVP + toast system, wire analytics tab in dashboard.

**Architecture:**
- Backend adds 1 new protected route (`GET /api/events/:id/analytics`) and extends `PageSpecMeta` DTO with optional contact fields.
- cafetton reads contact from PageSpec → dynamic footer; adds share widget and dietary field in RSVP using Framer Motion for toasts (zero new dependencies).
- Dashboard adds `EventAnalyticsPanel` component wired to new endpoint.

**Tech Stack:** Go 1.24 + Echo v4 + GORM, Astro 5 + React 19 + Framer Motion 12, Next.js 15 + SWR + Motion

---

## Task 1: Backend — Read key files before touching anything

**Files to read:**
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\EventAnalyticsService.go`
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\PageSpecService.go`
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\dtos\PageSpec.go`
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\eventconfig\eventconfig.go`
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\routes\routes.go`

**Step 1: Read all files listed above**

**Step 2: Confirm these are true before proceeding**
- EventAnalyticsService has (or needs) a `GetByEventID(eventID uuid.UUID)` method
- PageSpecService builds `meta` from the Event model (confirm `OrganizerName`, `OrganizerPhone`, `OrganizerEmail` are available)
- EventConfig controller pattern shows how to parse `:id` UUID param and return JSON

---

## Task 2: Backend — Add GetEventAnalyticsByEventID to service

**Files:**
- Read+Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\EventAnalyticsService.go`

**Step 1: Open the file and check existing functions**

If `GetEventAnalyticsByEventID` already exists → skip to Task 3.
If only `GetEventAnalyticsByID` exists (analytics record ID) → add the following.

**Step 2: Add function to the service file**

Add after the existing `GetEventAnalyticsByID` function:

```go
// GetEventAnalyticsByEventID fetches the analytics record for a given event.
// EventAnalytics has a unique index on EventID so at most one record exists.
func GetEventAnalyticsByEventID(eventID uuid.UUID) (*models.EventAnalytics, error) {
	return defaultEventAnalyticsService.repo.FindOneByField("event_id", eventID)
}
```

> If `FindOneByField` does not exist on the repository interface, use GORM directly:

```go
func GetEventAnalyticsByEventID(eventID uuid.UUID) (*models.EventAnalytics, error) {
	var analytics models.EventAnalytics
	result := defaultEventAnalyticsService.repo.GetDB().
		Where("event_id = ?", eventID).
		First(&analytics)
	if result.Error != nil {
		return nil, result.Error
	}
	return &analytics, nil
}
```

> Check the repository interface (`repositories/ports/` or similar) to see what methods are available. Follow the same pattern as `GetEventConfigByEventID` if it exists.

**Step 3: Verify it compiles**
```bash
cd /var/www/itbem-events-backend && go build ./...
```
Expected: no errors.

---

## Task 3: Backend — EventAnalytics HTTP Controller

**Files:**
- Create: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\events\event_analytics_controller.go`

**Step 1: Create the controller file**

```go
package eventscontroller

import (
	"net/http"

	eventsService "events-stocks/services/events"
	"events-stocks/utils"
	"github.com/gofrs/uuid"
	"github.com/labstack/echo/v4"
)

// GetEventAnalytics godoc
// @Summary Get analytics for a specific event
// @Tags events
// @Produce json
// @Param id path string true "Event UUID"
// @Success 200 {object} models.EventAnalytics
// @Router /events/{id}/analytics [get]
func GetEventAnalytics(c echo.Context) error {
	idStr := c.Param("id")
	eventID, err := uuid.FromString(idStr)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event ID format", err.Error())
	}

	analytics, err := eventsService.GetEventAnalyticsByEventID(eventID)
	if err != nil {
		return utils.Error(c, http.StatusNotFound, "Analytics not found for this event", err.Error())
	}

	return utils.Success(c, http.StatusOK, "Analytics loaded", analytics)
}
```

> Check what package the other event controllers use (`package eventscontroller` or similar). Match it exactly.

**Step 2: Verify it compiles**
```bash
cd /var/www/itbem-events-backend && go build ./...
```

---

## Task 4: Backend — Register analytics route

**Files:**
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\routes\routes.go`

**Step 1: Read routes.go to find the protected events group**

Look for the block that registers event routes like:
```go
events.PUT("/:id", eventsController.UpdateEvent)
events.DELETE("/:id", eventsController.DeleteEvent)
events.GET("/:id/config", eventConfigController.GetEventConfig)
```

**Step 2: Add the analytics route after `/:id/config`**

```go
events.GET("/:id/analytics", eventsController.GetEventAnalytics)
```

**Step 3: Verify it compiles and no route conflicts**
```bash
cd /var/www/itbem-events-backend && go build ./...
```

**Step 4: Quick smoke test**
```bash
# Replace <token> with a real JWT and <event_uuid> with a valid event ID
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/events/<event_uuid>/analytics
# Expected: { "status": 200, "data": { "views": N, ... } }
```

**Step 5: Commit**
```bash
cd /var/www/itbem-events-backend
git add controllers/events/event_analytics_controller.go \
        services/events/EventAnalyticsService.go \
        routes/routes.go
git commit -m "feat(analytics): expose GET /api/events/:id/analytics endpoint"
```

---

## Task 5: Backend — Add organizer contact to PageSpec DTO

**Files:**
- Read+Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\dtos\PageSpec.go`
- Read+Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\PageSpecService.go`

**Step 1: Read PageSpec.go — confirm current shape**

Current shape should be:
```go
type PageSpecMeta struct {
    PageTitle string  `json:"pageTitle"`
    MusicUrl  *string `json:"musicUrl,omitempty"`
}
```

**Step 2: Add PageSpecContact struct and update PageSpecMeta**

In `dtos/PageSpec.go`, add `PageSpecContact` and update `PageSpecMeta`:

```go
// PageSpecContact — organizer contact info for public event footer.
// All fields omitempty so the object is absent when the event has no contact data.
type PageSpecContact struct {
    Name  string `json:"name,omitempty"`
    Phone string `json:"phone,omitempty"`
    Email string `json:"email,omitempty"`
}

type PageSpecMeta struct {
    PageTitle string           `json:"pageTitle"`
    MusicUrl  *string          `json:"musicUrl,omitempty"`
    Contact   *PageSpecContact `json:"contact,omitempty"`
}
```

**Step 3: Read PageSpecService.go — find where meta is built**

Find code that creates `PageSpecMeta{...}` — typically:
```go
meta := dtos.PageSpecMeta{
    PageTitle: event.Name,
    MusicUrl:  ...,
}
```

**Step 4: Include contact in meta build**

Replace the meta build with:
```go
var contact *dtos.PageSpecContact
if event.OrganizerName != "" || event.OrganizerPhone != "" || event.OrganizerEmail != "" {
    contact = &dtos.PageSpecContact{
        Name:  event.OrganizerName,
        Phone: event.OrganizerPhone,
        Email: event.OrganizerEmail,
    }
}

meta := dtos.PageSpecMeta{
    PageTitle: event.Name,
    MusicUrl:  musicUrl, // keep existing music url logic
    Contact:   contact,
}
```

> If the Event model uses `OrganizerPhone` → use that. If it uses `Phone` or a different field name → adapt. Check the model file to be sure.

**Step 5: Verify**
```bash
cd /var/www/itbem-events-backend && go build ./...
```

**Step 6: Smoke test PageSpec endpoint**
```bash
curl "http://localhost:8080/api/events/page-spec?token=<valid_token>"
# Expected: meta.contact present if event has organizer info
```

**Step 7: Commit**
```bash
git add dtos/PageSpec.go services/events/PageSpecService.go
git commit -m "feat(pagespec): include organizer contact in PageSpec meta"
```

---

## Task 6: cafetton — Update PageMeta types

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\engine\types.ts`

**Step 1: Read the current types.ts**

Current `PageMeta`:
```typescript
export interface PageMeta {
  pageTitle: string;
  musicUrl?: string;
}
```

**Step 2: Add PageContact interface and extend PageMeta**

Add above `PageMeta`:
```typescript
export interface PageContact {
  name?: string;
  phone?: string;
  email?: string;
}
```

Update `PageMeta`:
```typescript
export interface PageMeta {
  pageTitle: string;
  musicUrl?: string;
  contact?: PageContact;
}
```

**Step 3: Verify TypeScript compiles**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | head -20
```
Expected: no type errors on the changed file.

---

## Task 7: cafetton — Dynamic Footer component

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\common\Footer.tsx`
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\engine\EventPage.tsx`

**Step 1: Rewrite Footer.tsx to accept optional contact props**

Replace the entire file with:

```tsx
"use client";

import { motion } from "framer-motion";
import type { PageContact } from "../engine/types";

interface FooterProps {
  contact?: PageContact;
}

export default function Footer({ contact }: FooterProps = {}) {
  const phone = contact?.phone ?? "9999988610";
  const email = contact?.email ?? "contacto.eventiapp@itbem.com";
  const showName = contact?.name && contact.name.trim() !== "";

  return (
    <motion.footer
      className="relative bg-white border-t mt-16 py-10 text-gray-600 text-sm overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        {/* Logo eventiapp */}
        <img
          src="/backgrounds/vectores-03.svg"
          alt="eventiapp 2025 by itbem"
          className="w-[160px] sm:w-[200px] md:w-[240px]"
          loading="lazy"
          decoding="async"
        />

        {showName && (
          <p className="font-aloevera text-dark text-lg font-semibold">
            {contact!.name}
          </p>
        )}

        {/* WhatsApp */}
        <a
          href={`https://wa.me/${phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
          aria-label={`Contactar por WhatsApp: ${phone}`}
        >
          <img
            src="/backgrounds/vectores-04.svg"
            alt=""
            className="w-12 h-12"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <span className="text-black font-aloevera text-xl">{phone}</span>
        </a>

        {/* Email */}
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
          aria-label={`Enviar correo a ${email}`}
        >
          <img
            src="/backgrounds/vectores-05.svg"
            alt=""
            className="w-12 h-12"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <span className="text-black font-aloevera text-md">{email}</span>
        </a>
      </div>
    </motion.footer>
  );
}
```

**Step 2: Update EventPage.tsx to pass contact to Footer**

Open `src/components/engine/EventPage.tsx`.

Find:
```tsx
import Footer from '../common/Footer';
```
Already imported — good.

Find the return JSX where `<Footer />` is rendered:
```tsx
<div className="overflow-x-hidden">
  <Footer />
</div>
```

Replace with:
```tsx
<div className="overflow-x-hidden">
  <Footer contact={spec.meta.contact} />
</div>
```

**Step 3: Verify types compile**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | head -30
```

**Step 4: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/common/Footer.tsx \
        src/components/engine/EventPage.tsx \
        src/components/engine/types.ts
git commit -m "feat(footer): dynamic organizer contact from PageSpec"
```

---

## Task 8: cafetton — Toast notification system

**Files:**
- Create: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\common\Toast.tsx`
- Create: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\hooks\useToast.ts`

**Step 1: Create `src/hooks/useToast.ts`**

```typescript
import { useState, useCallback } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
```

**Step 2: Create `src/components/common/Toast.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastItem } from "../../hooks/useToast";

interface ToastListProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const colorMap = {
  success: "bg-green-50 border-green-400 text-green-800",
  error: "bg-red-50 border-red-400 text-red-800",
  info: "bg-amber-50 border-gold text-dark",
};

const iconMap = {
  success: "✓",
  error: "✕",
  info: "i",
};

export default function ToastList({ toasts, onRemove }: ToastListProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 shadow-lg
              font-aloevera text-sm max-w-xs text-center cursor-pointer
              ${colorMap[toast.type]}`}
            onClick={() => onRemove(toast.id)}
            role="status"
          >
            <span className="font-bold text-base">{iconMap[toast.type]}</span>
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 3: Verify types**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | grep -E "error|Error" | head -10
```

---

## Task 9: cafetton — Dietary preferences in RSVP

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\sections\RSVPConfirmation.tsx`

**Step 1: Read RSVPConfirmation.tsx first**

It currently has:
- `respuesta` state (yes/no)
- `numPersonas` state
- `handleConfirm` that POSTs `{ pretty_token, status, method, guest_count }`

**Step 2: Add dietary state and UI**

Add this state after `numPersonas`:
```tsx
const [dietary, setDietary] = useState<string>('none');
const [dietaryOther, setDietaryOther] = useState<string>('');
```

**Step 3: Build dietary notes string in handleConfirm**

In `handleConfirm`, before the fetch, build the notes string:
```tsx
const dietaryNote =
  dietary === 'none'
    ? ''
    : dietary === 'other'
    ? dietaryOther.trim()
    : dietary;

// Add `notes` to the fetch body:
body: JSON.stringify({
  pretty_token: invData.prettyToken,
  status: respuesta === 'yes' ? 'confirmed' : 'declined',
  method: 'web',
  guest_count: respuesta === 'yes' ? numPersonas : 0,
  ...(dietaryNote ? { notes: dietaryNote } : {}),
}),
```

**Step 4: Add dietary UI — insert after the `numPersonas` select block**

Find the block:
```tsx
{respuesta === 'yes' && (
  <div className="mt-6 flex items-center justify-center gap-2">
    <p className="text-2xl font-aloevera text-gold">No. personas confirmadas:</p>
    ...
  </div>
)}
```

Add AFTER that closing `)}`:
```tsx
{respuesta === 'yes' && (
  <div className="mt-4 flex flex-col items-center gap-3">
    <p className="text-xl font-aloevera text-dark">¿Alguna restricción alimentaria?</p>
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { value: 'none', label: 'Ninguna' },
        { value: 'vegetariano', label: 'Vegetariano' },
        { value: 'vegano', label: 'Vegano' },
        { value: 'sin_gluten', label: 'Sin gluten' },
        { value: 'other', label: 'Otra' },
      ].map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setDietary(value)}
          className={cn(
            'px-4 py-2 rounded-xl font-aloevera text-sm border-2 border-dashed border-gold transition-colors',
            dietary === value ? 'bg-gold text-dark' : 'bg-white text-dark',
          )}
        >
          {label}
        </button>
      ))}
    </div>
    {dietary === 'other' && (
      <input
        type="text"
        value={dietaryOther}
        onChange={(e) => setDietaryOther(e.target.value)}
        placeholder="Escribe tu restricción..."
        className="border-2 border-dashed border-gold rounded-xl px-4 py-2 font-aloevera text-dark text-sm w-64 text-center"
        aria-label="Especifica tu restricción alimentaria"
      />
    )}
  </div>
)}
```

**Step 5: Integrate toasts into RSVPConfirmation**

Import at top of file:
```tsx
import { useToast } from '../../hooks/useToast';
import ToastList from '../common/Toast';
```

Add hook inside component:
```tsx
const { toasts, addToast, removeToast } = useToast();
```

In `handleConfirm`, replace `setMessage(...)` with `addToast(...)`:
```tsx
// Success:
addToast(
  respuesta === 'yes'
    ? '¡Asistencia confirmada!'
    : 'Respuesta registrada',
  'success',
);

// Error:
addToast(`Error: ${msg}`, 'error');
```

Add `<ToastList toasts={toasts} onRemove={removeToast} />` at the bottom of the section JSX, before the closing `</section>`.

**Step 6: Verify build**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 7: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/sections/RSVPConfirmation.tsx \
        src/components/common/Toast.tsx \
        src/hooks/useToast.ts
git commit -m "feat(rsvp): dietary preferences + toast notifications"
```

---

## Task 10: cafetton — WhatsApp Share Widget

**Files:**
- Create: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\ShareWidget.tsx`
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\engine\EventPage.tsx`

**Step 1: Create ShareWidget.tsx**

```tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShareWidgetProps {
  eventTitle: string;
}

export default function ShareWidget({ eventTitle }: ShareWidgetProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Show widget only after user has scrolled past 300px
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `¡Mira mi invitación para ${eventTitle}! 🎉`;

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — silent fail
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed bottom-24 right-4 z-40 flex flex-col gap-2 items-end"
          aria-label="Compartir invitación"
        >
          {/* WhatsApp share */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleWhatsApp}
            className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2
              rounded-full shadow-lg font-aloevera text-sm"
            aria-label="Compartir por WhatsApp"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-current"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Compartir
          </motion.button>

          {/* Copy link */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-2 bg-white border-2 border-dashed border-gold
              text-dark px-4 py-2 rounded-full shadow-lg font-aloevera text-sm"
            aria-label="Copiar enlace de invitación"
          >
            {copied ? (
              <span>¡Copiado!</span>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copiar enlace
              </>
            )}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Add ShareWidget to EventPage.tsx**

Open `src/components/engine/EventPage.tsx`.

Add import:
```tsx
import ShareWidget from '../ShareWidget';
```

In the return JSX, after `{spec.meta.musicUrl && <MusicWidget ... />}` and before `<main>`, add:
```tsx
<ShareWidget eventTitle={spec.meta.pageTitle} />
```

**Step 3: Verify build**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 4: Commit**
```bash
git add src/components/ShareWidget.tsx \
        src/components/engine/EventPage.tsx
git commit -m "feat(share): WhatsApp share + copy link floating widget"
```

---

## Task 11: Dashboard — EventAnalyticsPanel component

**Files:**
- Create: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\event-analytics-panel.tsx`

**Step 1: Read the current event detail page**

Read: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\app\(app)\events\[id]\page.tsx`

Find the "Analíticas" tab content — it likely has placeholder or nothing.

**Step 2: Create event-analytics-panel.tsx**

```tsx
'use client'
import useSWR from 'swr'
import { motion } from 'motion/react'
import { fetcher } from '@/lib/fetcher'

interface EventAnalytics {
  id: string
  event_id: string
  views: number
  moment_comments: number
  moment_uploads: number
  rsvp_confirmed: number
  rsvp_declined: number
  created_at: string
  updated_at: string
}

interface Props {
  eventId: string
}

function StatCard({
  label,
  value,
  color,
  index,
}: {
  label: string
  value: number
  color: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-1"
    >
      <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value ?? 0}</span>
    </motion.div>
  )
}

export function EventAnalyticsPanel({ eventId }: Props) {
  const { data: analytics, isLoading, error } = useSWR<EventAnalytics>(
    eventId ? `/events/${eventId}/analytics` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 h-24 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-red-400 text-sm p-4">
        Error al cargar analíticas. Intenta recargar la página.
      </p>
    )
  }

  if (!analytics) {
    return (
      <p className="text-zinc-500 text-sm p-4">
        Sin datos de analíticas todavía. Las métricas aparecen en cuanto el evento tenga visitas o RSVPs.
      </p>
    )
  }

  const total = analytics.rsvp_confirmed + analytics.rsvp_declined
  const responseRate = total > 0
    ? Math.round((analytics.rsvp_confirmed / total) * 100)
    : 0

  const stats = [
    { label: 'Vistas', value: analytics.views, color: 'text-sky-400' },
    { label: 'RSVP Confirmados', value: analytics.rsvp_confirmed, color: 'text-lime-400' },
    { label: 'RSVP Declinados', value: analytics.rsvp_declined, color: 'text-pink-400' },
    { label: 'Fotos subidas', value: analytics.moment_uploads, color: 'text-violet-400' },
    { label: 'Mensajes', value: analytics.moment_comments, color: 'text-amber-400' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} index={i} />
        ))}
      </div>

      {/* Response rate bar */}
      {total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3"
        >
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Tasa de respuesta RSVP</span>
            <span className="text-zinc-200 font-semibold">{responseRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-lime-500"
              initial={{ width: 0 }}
              animate={{ width: `${responseRate}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
            />
          </div>
          <p className="text-xs text-zinc-600">
            {analytics.rsvp_confirmed} confirmados · {analytics.rsvp_declined} declinados · {total} total
          </p>
        </motion.div>
      )}
    </div>
  )
}
```

**Step 3: Wire to event detail page**

Open: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\app\(app)\events\[id]\page.tsx`

Add import:
```tsx
import { EventAnalyticsPanel } from '@/components/events/event-analytics-panel'
```

Find the "Analíticas" tab content — something like:
```tsx
{activeTab === 'analytics' && (
  <div>
    {/* empty or mock content */}
  </div>
)}
```

Replace with:
```tsx
{activeTab === 'analytics' && (
  <EventAnalyticsPanel eventId={event.id} />
)}
```

> If the tab key is different (e.g., `'analiticas'` or another string), match it exactly.

**Step 4: Verify TypeScript and lint**
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npm run lint 2>&1 | head -30
```

**Step 5: Commit**
```bash
git add src/components/events/event-analytics-panel.tsx \
        src/app/\(app\)/events/\[id\]/page.tsx
git commit -m "feat(analytics): EventAnalyticsPanel component with real data"
```

---

## Task 12: Docs update

**Files to update:**
- `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\api.md` — add `GET /events/:id/analytics` entry
- `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\components.md` — add EventAnalyticsPanel
- `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\backend-agent.md` — mark analytics endpoint as validated
- `C:\Users\AndBe\Desktop\Projects\cafetton-casero\docs\api.md` — add contact fields to PageSpec
- `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\docs\ROUTES.md` — add analytics route

**Step 1: dashboard-ts/docs/api.md — add under Events section**
```markdown
| GET | `/events/:id/analytics` | Event analytics — views, RSVPs, moment counts |
```

**Step 2: dashboard-ts/docs/backend-agent.md — update Validated Contracts table**
```markdown
| `GET /api/events/:id/analytics` | 2026-02-21 | Protected. Returns EventAnalytics model. |
| Response envelope shape | 2026-02-21 | `{ data: T }` — fetcher unwraps with `r.data?.data ?? r.data` |
```

**Step 3: cafetton docs/api.md — add PageSpec contact section**
```markdown
### PageSpec meta.contact (new)
`meta.contact?: { name?, phone?, email? }` — sourced from Event.OrganizerName/Phone/Email.
Footer renders these dynamically; falls back to Eventiapp defaults if absent.
```

**Step 4: Commit docs**
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
git add docs/api.md docs/components.md docs/backend-agent.md
git commit -m "docs: update api.md and backend-agent.md for analytics endpoint"

cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add docs/api.md
git commit -m "docs: document PageSpec contact fields"
```

---

## Verification Checklist

Before calling this done:

- [ ] `go build ./...` passes in backend with zero errors
- [ ] `GET /api/events/:id/analytics` returns 200 with analytics object (test with curl + valid JWT)
- [ ] `GET /api/events/page-spec?token=X` includes `meta.contact` when event has organizer data
- [ ] `npm run build` passes in cafetton-casero with zero errors
- [ ] Footer shows dynamic contact from PageSpec (test with a real invitation token)
- [ ] WhatsApp share button appears after scrolling 300px, opens correct WA deep link
- [ ] Dietary options appear in RSVP form when "Claro, con gusto" is selected
- [ ] RSVP POST includes `notes` field when dietary !== 'none'
- [ ] Toast appears on RSVP success and error
- [ ] `npm run lint` passes in dashboard-ts
- [ ] EventAnalyticsPanel renders in Analíticas tab with real data
- [ ] All 3 repos have commits; docs updated in all 3 projects
