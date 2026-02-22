# Invitations Endpoint + MomentWall Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Expose the existing invitations infrastructure as REST endpoints, add a resend-tracking button in the dashboard, and build a public MomentWall section in cafetton where guests can view and upload photos.

**Architecture:**
- Backend adds `GET /api/events/:id/invitations` (protected) + `POST /api/invitations/:id/resend` (protected) for the dashboard, and `GET /api/events/:identifier/moments` (public) + `POST /api/events/:identifier/moments` (public) for the cafetton MomentWall.
- Dashboard InvitationTracker already exists and works from guest data — only enhancement needed is the resend button using `guest.invitation_id`.
- cafetton gets a new `MomentWall` SDUI section that fetches approved moments and lets guests upload new ones.

**Tech Stack:**
- Backend: Go, Echo v4, GORM, PostgreSQL, Redis (WSL path `//wsl.localhost/Ubuntu/var/www/itbem-events-backend`)
- Dashboard: Next.js 15, SWR, Sonner toasts (`C:\Users\AndBe\Desktop\Projects\dashboard-ts`)
- cafetton: Astro 5, React 19, Framer Motion (`C:\Users\AndBe\Desktop\Projects\cafetton-casero`)

---

## Context for implementers

### Backend patterns (read `docs/backend-agent.md` for full context)

**Controller singleton pattern:**
```go
var svc *someService.SomeService
func InitSomeController(s *someService.SomeService) { svc = svc }
```
In `server.go` at line ~174: `Init` calls happen before `routes.ConfigurarRutas`.

**Error helpers:**
```go
utils.Error(c, http.StatusBadRequest, "message", err.Error())
utils.Success(c, http.StatusOK, "message", data)
```

**Repository pattern for custom DB queries:**
```go
import "events-stocks/configuration"
var list []models.SomeModel
err := configuration.DB.Where("field = ?", value).Find(&list).Error
```

**Route groups in `routes/routes.go`:**
- `public := e.Group("/api")` — no auth, 20 req/s rate limiter
- `protected := e.Group("/api")` — Cognito JWT required, 60 req/s rate limiter
- `sensitiveRateLimiter()` — ~10 req/min, used for RSVP and invite endpoints

**Ports interface** (`services/ports/ports.go`): all repositories must satisfy their interface. Adding a method requires updating both the interface AND the concrete repo struct.

---

## RAMA A — Invitations

---

### Task A1: ListInvitationsByEventID in repo + port + service

**Context:** The `InvitationRepository` interface (`services/ports/ports.go` line ~72) only has `ListInvitations()`. We need `ListByEventID`. The concrete repo is in `repositories/invitationrepository/InvitationRepository.go`.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/ports/ports.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/repositories/invitationrepository/InvitationRepository.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/invitations/InvitationService.go`

**Step 1: Add method to InvitationRepository interface in ports.go**

Find `InvitationRepository interface {` and add ONE line before the closing brace:
```go
ListByEventID(eventID uuid.UUID) ([]models.Invitation, error)
```

Full updated interface:
```go
type InvitationRepository interface {
    CreateInvitation(m *models.Invitation) error
    UpdateInvitation(m *models.Invitation) error
    DeleteInvitation(id uuid.UUID) error
    GetInvitationByID(id uuid.UUID) (*models.Invitation, error)
    GetInvitationByIDLite(id uuid.UUID) (*models.Invitation, error)
    ListInvitations() ([]models.Invitation, error)
    ListByEventID(eventID uuid.UUID) ([]models.Invitation, error)
}
```

**Step 2: Add package-level function + InvitationRepo method in invitationrepository/InvitationRepository.go**

Append to the end of the file (before the closing package/EOF):
```go
// ListInvitationsByEventID returns all invitations for a specific event,
// preloading only the guest (no full Event chain — caller already knows the event).
func ListInvitationsByEventID(eventID uuid.UUID) ([]models.Invitation, error) {
    var list []models.Invitation
    err := configuration.DB.
        Where("invitations.event_id = ?", eventID).
        Find(&list).Error
    return list, err
}

func (r *InvitationRepo) ListByEventID(eventID uuid.UUID) ([]models.Invitation, error) {
    return ListInvitationsByEventID(eventID)
}
```

**Step 3: Add package-level function + struct method in services/invitations/InvitationService.go**

In the section near the other package-level functions (near `ListInvitations`), add:
```go
func ListInvitationsByEventID(eventID uuid.UUID) ([]models.Invitation, error) {
    return _invitationSvc.ListInvitationsByEventID(eventID)
}
```

Add the struct method to `InvitationService`:
```go
func (s *InvitationService) ListInvitationsByEventID(eventID uuid.UUID) ([]models.Invitation, error) {
    return s.repo.ListByEventID(eventID)
}
```

**Step 4: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Expected: no errors. If you get "does not implement" errors, check all interface methods are present on InvitationRepo.

**Step 5: Commit**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add services/ports/ports.go repositories/invitationrepository/InvitationRepository.go services/invitations/InvitationService.go
git commit -m "feat(invitations): add ListByEventID to repo, port, and service"
```

---

### Task A2: GET /api/events/:id/invitations controller + route

**Context:** Protected route. Parses `:id` as UUID (event UUID, NOT identifier). Returns all invitations for the event.

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/invitations/event_invitations_controller.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Create controller file**

Full content of `controllers/invitations/event_invitations_controller.go`:
```go
package invitations

import (
    "errors"
    invitationsService "events-stocks/services/invitations"
    "events-stocks/utils"
    "github.com/gofrs/uuid"
    "github.com/labstack/echo/v4"
    "gorm.io/gorm"
    "net/http"
)

// GET /api/events/:id/invitations
func ListByEvent(c echo.Context) error {
    idStr := c.Param("id")
    eventID, err := uuid.FromString(idStr)
    if err != nil {
        return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
    }

    list, err := invitationsService.ListInvitationsByEventID(eventID)
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Success(c, http.StatusOK, "No invitations found", []interface{}{})
        }
        return utils.Error(c, http.StatusInternalServerError, "Error fetching invitations", err.Error())
    }

    return utils.Success(c, http.StatusOK, "Invitations loaded", list)
}
```

Note: Import path for invitation service is `invitationsService "events-stocks/services/invitations"` — check existing invitation controller to confirm the alias used in the package.

**Step 2: Check how existing invitation controllers import the service**

Read `controllers/invitations/invitation_controller.go` to see the exact import alias used. Match it. If the file uses `invitationsSvc` or similar package-level var, this new file is in the same package so it shares the controller's `invitationSvc` singleton.

Actually — look at the invitation controller. It has `var invitationSvc *invService.InvitationService`. The new file is in `package invitations` so it CAN use that same var. Update the controller to use the package-level service functions instead (safer).

**Revised Step 1:** Use package-level service functions (no `invitationSvc` var needed):
```go
package invitations

import (
    "errors"
    invitationsService "events-stocks/services/invitations"
    "events-stocks/utils"
    "github.com/gofrs/uuid"
    "github.com/labstack/echo/v4"
    "gorm.io/gorm"
    "net/http"
)

// GET /api/events/:id/invitations
func ListByEvent(c echo.Context) error {
    idStr := c.Param("id")
    eventID, err := uuid.FromString(idStr)
    if err != nil {
        return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
    }

    list, err := invitationsService.ListInvitationsByEventID(eventID)
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Success(c, http.StatusOK, "No invitations found", []interface{}{})
        }
        return utils.Error(c, http.StatusInternalServerError, "Error fetching invitations", err.Error())
    }

    return utils.Success(c, http.StatusOK, "Invitations loaded", list)
}
```

**Step 3: Register route in routes.go**

Find the protected events routes section (near line 136 where `protected.GET("/events/:id/analytics", ...)` was added in Sprint 1). Add:
```go
protected.GET("/events/:id/invitations", invitations.ListByEvent)
```

**Step 4: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 5: Commit**
```bash
git add controllers/invitations/event_invitations_controller.go routes/routes.go
git commit -m "feat(invitations): add GET /events/:id/invitations endpoint"
```

---

### Task A3: ResendInvitation — service + controller + route

**Context:** When a dashboard user re-sends an invitation manually (via WhatsApp or email), we want to log this in `InvitationLog`. The service creates a log entry and updates `InvitationSent = true`. Actual message dispatch (WA/email API) is NOT in scope — the dashboard already opens `wa.me` links client-side.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/ports/ports.go` — NO change needed (InvitationLogRepository already has `CreateInvitationLog`)
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/invitations/InvitationService.go`
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/invitations/resend_controller.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Add ResendInvitation struct method to InvitationService**

```go
// ResendInvitation marks the invitation as re-sent and logs the action.
// Actual message delivery (WhatsApp/email API) is handled client-side.
func (s *InvitationService) ResendInvitation(invitationID uuid.UUID) error {
    inv, err := s.repo.GetInvitationByIDLite(invitationID)
    if err != nil {
        return err
    }

    now := time.Now()
    var logs []models.InvitationLog

    if inv.EnableWhatsApp {
        logs = append(logs, models.InvitationLog{
            InvitationID: invitationID,
            Channel:      "whatsapp",
            Action:       "resent",
            Status:       "success",
            Timestamp:    now,
        })
    }
    if inv.EnableEmail {
        logs = append(logs, models.InvitationLog{
            InvitationID: invitationID,
            Channel:      "email",
            Action:       "resent",
            Status:       "success",
            Timestamp:    now,
        })
    }
    // If neither channel is enabled, still log as generic resent
    if len(logs) == 0 {
        logs = append(logs, models.InvitationLog{
            InvitationID: invitationID,
            Channel:      "manual",
            Action:       "resent",
            Status:       "success",
            Timestamp:    now,
        })
    }

    if err := s.logRepo.CreateManyInvitationLogs(logs); err != nil {
        return err
    }

    // Mark invitation as sent
    inv.InvitationSent = true
    return s.repo.UpdateInvitation(inv)
}
```

Also add the package-level function near the other package-level functions:
```go
func ResendInvitation(invitationID uuid.UUID) error {
    return _invitationSvc.ResendInvitation(invitationID)
}
```

**Step 2: Verify InvitationLog model fields**

Read `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/models/InvitationLog.go`. Confirm: `InvitationID`, `Channel`, `Action`, `Status`, `Timestamp` are the correct field names. Adjust code above if they differ.

**Step 3: Create resend controller**

Full content of `controllers/invitations/resend_controller.go`:
```go
package invitations

import (
    "errors"
    invitationsService "events-stocks/services/invitations"
    "events-stocks/utils"
    "github.com/gofrs/uuid"
    "github.com/labstack/echo/v4"
    "gorm.io/gorm"
    "net/http"
)

// POST /api/invitations/:id/resend
func ResendInvitation(c echo.Context) error {
    idStr := c.Param("id")
    invitationID, err := uuid.FromString(idStr)
    if err != nil {
        return utils.Error(c, http.StatusBadRequest, "Invalid invitation ID", err.Error())
    }

    if err := invitationsService.ResendInvitation(invitationID); err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Error(c, http.StatusNotFound, "Invitation not found", err.Error())
        }
        return utils.Error(c, http.StatusInternalServerError, "Error logging resend", err.Error())
    }

    return utils.Success(c, http.StatusOK, "Invitation marked as resent", nil)
}
```

**Step 4: Register route in routes.go**

In the protected group, after the invitations routes or near `/events/:id/invitations`:
```go
protected.POST("/invitations/:id/resend", invitations.ResendInvitation)
```

**Step 5: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 6: Commit**
```bash
git add services/invitations/InvitationService.go controllers/invitations/resend_controller.go routes/routes.go
git commit -m "feat(invitations): add POST /invitations/:id/resend endpoint"
```

---

### Task A4: Dashboard — InvitationTracker resend button

**Context:** `InvitationTracker` at `src/components/events/invitation-tracker.tsx` is complete and well-built. The only change: add a "Reenviar" button in `GuestInvitationRow` that calls `POST /invitations/:id/resend` using `guest.invitation_id`. The button lives alongside the existing WhatsApp / email buttons.

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\invitation-tracker.tsx`

**Step 1: Read the current file** (lines 215-252: the actions section of GuestInvitationRow)

**Step 2: Add resend handler and import api**

Add import at the top of the file:
```tsx
import { api } from '@/lib/api'
```

In `GuestInvitationRow`, add `ArrowPathIcon` to the Heroicons import (it's `@heroicons/react/20/solid`):
```tsx
import { ..., ArrowPathIcon } from '@heroicons/react/20/solid'
```

Add a `resend` function inside `GuestInvitationRow`:
```tsx
const [resending, setResending] = useState(false)

const resend = async () => {
  if (!guest.invitation_id || resending) return
  setResending(true)
  try {
    await api.post(`/invitations/${guest.invitation_id}/resend`)
    toast.success('Resend registrado')
  } catch {
    toast.error('Error al registrar el reenvío')
  } finally {
    setResending(false)
  }
}
```

**Step 3: Add the button in the actions div** (after the email button, before the closing `</div>`):
```tsx
{guest.invitation_id && (
  <button
    onClick={resend}
    disabled={resending}
    className="p-1.5 rounded-lg text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
    aria-label="Registrar reenvío"
    title="Registrar reenvío de invitación"
  >
    <ArrowPathIcon className={`size-4 ${resending ? 'animate-spin' : ''}`} />
  </button>
)}
```

**Step 4: Also update the imports** — `useState` is already imported. Confirm `api` is imported. Confirm `ArrowPathIcon` is added to the Heroicons import.

**Step 5: Build check**
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

**Step 6: Update docs/api.md** — add `POST /invitations/:id/resend` and `GET /events/:id/invitations` to the Endpoint Reference table.

**Step 7: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
git add src/components/events/invitation-tracker.tsx docs/api.md
git commit -m "feat(dashboard): add resend button to InvitationTracker"
```

---

## RAMA B — MomentWall

---

### Task B1: Add EventID to Moment model + ListByEventID to repo/port/service

**Context:** `Moment` model currently has no `EventID` field — moments link to events only through `InvitationID → Invitation → EventID`. Adding `EventID *uuid.UUID` (nullable) allows direct querying. GORM AutoMigrate adds the column non-destructively on next startup.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/models/Moment.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/ports/ports.go`
- Find and modify: the concrete moment repository (likely `repositories/momentrepository/MomentRepository.go`)
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/moments/MomentService.go`

**Step 1: Read the current Moment model**

Read `models/Moment.go`. Confirm current fields. Then add `EventID *uuid.UUID` with proper GORM tags:
```go
EventID      *uuid.UUID     `gorm:"type:uuid;index" json:"event_id,omitempty"`
```

Add it after `ID` field, before `InvitationID`.

**Step 2: Add ListByEventID to MomentRepository interface in ports.go**

Find `MomentRepository interface {` and add:
```go
ListByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error)
```

Full updated interface:
```go
type MomentRepository interface {
    CreateMoment(m *models.Moment) error
    UpdateMoment(m *models.Moment) error
    DeleteMoment(id uuid.UUID) error
    GetMomentByID(id uuid.UUID) (*models.Moment, error)
    ListMoments() ([]models.Moment, error)
    ListByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error)
}
```

**Step 3: Find and read the concrete moment repository**

Look for `repositories/momentrepository/`. Read the file. It likely has `MomentRepo struct{}`. Add:

Package-level function:
```go
func ListMomentsByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error) {
    var list []models.Moment
    query := configuration.DB.Where("event_id = ?", eventID)
    if approvedOnly {
        query = query.Where("is_approved = ?", true)
    }
    err := query.Order("created_at DESC").Find(&list).Error
    return list, err
}
```

Method on MomentRepo:
```go
func (r *MomentRepo) ListByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error) {
    return ListMomentsByEventID(eventID, approvedOnly)
}
```

**Step 4: Add to MomentService**

In `services/moments/MomentService.go`, add package-level function:
```go
func ListMomentsByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error) {
    return _momentSvc.ListMomentsByEventID(eventID, approvedOnly)
}
```

Add struct method:
```go
func (s *MomentService) ListMomentsByEventID(eventID uuid.UUID, approvedOnly bool) ([]models.Moment, error) {
    return s.repo.ListByEventID(eventID, approvedOnly)
}
```

**Step 5: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 6: Commit**
```bash
git add models/Moment.go services/ports/ports.go repositories/momentrepository/ services/moments/MomentService.go
git commit -m "feat(moments): add EventID field + ListByEventID query"
```

---

### Task B2: Add event_id + identifier to PageSpecMeta

**Context:** cafetton's MomentWall section needs to know the event identifier to fetch moments. The PageSpec already flows to cafetton — adding `event_id` and `identifier` to meta is the cleanest way to expose this.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/dtos/PageSpec.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/events/PageSpecService.go`

**Step 1: Update PageSpecMeta in dtos/PageSpec.go**

Find `PageSpecMeta struct {` and add two fields:
```go
type PageSpecMeta struct {
    PageTitle  string           `json:"pageTitle"`
    MusicUrl   *string          `json:"musicUrl,omitempty"`
    Contact    *PageSpecContact `json:"contact,omitempty"`
    EventID    string           `json:"eventId,omitempty"`
    Identifier string           `json:"identifier,omitempty"`
}
```

**Step 2: Populate in PageSpecService.go**

Find where `PageSpecMeta` is constructed (near where `Contact` was added in Sprint 1). Add:
```go
meta := dtos.PageSpecMeta{
    PageTitle:  event.Name,
    MusicUrl:   event.MusicUrl,   // check exact field name
    Contact:    contact,
    EventID:    event.ID.String(),
    Identifier: event.Identifier,
}
```

**Step 3: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 4: Commit**
```bash
git add dtos/PageSpec.go services/events/PageSpecService.go
git commit -m "feat(pagespec): add eventId and identifier to meta"
```

---

### Task B3: UploadAndGetURL helper on ResourceService

**Context:** The public moment upload needs to put a file on S3 and get back a URL. `ResourceService.sanitizeAndOptimizeUpload` (lowercase) is unexported. We add a new exported method `UploadToMomentsFolder` that handles the full flow.

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/resources/Resources.go`

**Step 1: Read the current ResourceService**

Read `services/resources/Resources.go` lines 1-100 to understand the struct fields and `sanitizeAndOptimizeUpload` signature.

**Step 2: Add UploadToMomentsFolder method**

After `UploadAndCreateResource`, append:
```go
// UploadToMomentsFolder uploads a guest moment photo to S3 and returns the storage path.
// Does NOT create a Resource record — the path is stored in Moment.ContentURL.
func (rs *ResourceService) UploadToMomentsFolder(
    file multipart.File,
    header *multipart.FileHeader,
) (string, error) {
    optimized, filename, contentType, err := rs.sanitizeAndOptimizeUpload(file, header, "")
    if err != nil {
        return "", err
    }

    momentsPath := "moments"
    err = bucketrepository.UploadRawBytesSimple(optimized, filename, contentType, momentsPath, rs.Bucket, rs.Provider)
    if err != nil {
        return "", fmt.Errorf("failed to upload moment: %w", err)
    }

    return fmt.Sprintf("%s/%s", momentsPath, filename), nil
}
```

Note: `bucketrepository.UploadRawBytesSimple` signature: `(data []byte, filename, contentType, uploadPath, bucket, provider string) error`. Verify by reading `repositories/bucketrepository/` if needed.

**Step 3: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```

**Step 4: Commit**
```bash
git add services/resources/Resources.go
git commit -m "feat(resources): add UploadToMomentsFolder for guest moment uploads"
```

---

### Task B4: Public moments controller + routes

**Context:** Two new public endpoints. The controller needs access to 3 things: `momentSvc`, `accessTokenRepo` (to validate pretty_token), and `resourceSvc` (to upload to S3). We add a `InitPublicMomentsController` alongside the existing `InitMomentsController`.

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/public_moments.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/server.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

**Step 1: Find the event repository lookup by identifier**

We need to find an event by its `Identifier` field (not UUID). Check `repositories/eventsrepository/` or `services/events/EventService.go` for a `GetByIdentifier` or similar function. If it doesn't exist, we'll query directly with `configuration.DB.Where("identifier = ?", identifier).First(&event)`.

Read `repositories/eventsrepository/EventsRepository.go` to confirm.

**Step 2: Create public_moments.go**

Full content:
```go
package moments

import (
    "errors"
    "events-stocks/configuration"
    "events-stocks/models"
    momentsService "events-stocks/services/moments"
    "events-stocks/services/ports"
    resourcesService "events-stocks/services/resources"
    "events-stocks/utils"
    "github.com/gofrs/uuid"
    "github.com/labstack/echo/v4"
    "gorm.io/gorm"
    "net/http"
)

var (
    publicTokenRepo ports.AccessTokenRepository
    publicResSvc    *resourcesService.ResourceService
)

// InitPublicMomentsController wires the extra dependencies needed for public endpoints.
func InitPublicMomentsController(
    tokenRepo ports.AccessTokenRepository,
    resSvc *resourcesService.ResourceService,
) {
    publicTokenRepo = tokenRepo
    publicResSvc = resSvc
}

// getEventByIdentifier resolves an event UUID from the public identifier string.
func getEventByIdentifier(identifier string) (*models.Event, error) {
    var event models.Event
    err := configuration.DB.Where("identifier = ?", identifier).First(&event).Error
    if err != nil {
        return nil, err
    }
    return &event, nil
}

// GET /api/events/:identifier/moments
// Public endpoint — returns approved moments for the event.
func ListPublicMoments(c echo.Context) error {
    identifier := c.Param("identifier")
    if identifier == "" {
        return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
    }

    event, err := getEventByIdentifier(identifier)
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Error(c, http.StatusNotFound, "Event not found", "")
        }
        return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
    }

    list, err := momentsService.ListMomentsByEventID(event.ID, true) // true = approvedOnly
    if err != nil {
        return utils.Error(c, http.StatusInternalServerError, "Error loading moments", err.Error())
    }

    return utils.Success(c, http.StatusOK, "Moments loaded", list)
}

// POST /api/events/:identifier/moments
// Public endpoint — guests upload a photo. Requires valid pretty_token.
func CreatePublicMoment(c echo.Context) error {
    identifier := c.Param("identifier")
    if identifier == "" {
        return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
    }

    // Validate pretty_token
    prettyToken := c.FormValue("pretty_token")
    if prettyToken == "" {
        return utils.Error(c, http.StatusUnauthorized, "Missing invitation token", "")
    }

    token, err := publicTokenRepo.GetByPrettyToken(prettyToken)
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Error(c, http.StatusUnauthorized, "Invalid invitation token", "")
        }
        return utils.Error(c, http.StatusInternalServerError, "Error validating token", err.Error())
    }

    // Resolve event
    event, err := getEventByIdentifier(identifier)
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return utils.Error(c, http.StatusNotFound, "Event not found", "")
        }
        return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
    }

    // Get file
    file, header, err := c.Request().FormFile("file")
    if err != nil {
        return utils.Error(c, http.StatusBadRequest, "Missing file", err.Error())
    }
    defer file.Close()

    // Upload to S3
    contentPath, err := publicResSvc.UploadToMomentsFolder(file, header)
    if err != nil {
        return utils.Error(c, http.StatusUnprocessableEntity, "Error uploading file", err.Error())
    }

    description := c.FormValue("description")

    eventID := event.ID
    moment := models.Moment{
        EventID:      &eventID,
        InvitationID: token.InvitationID,
        ContentURL:   contentPath,
        Description:  description,
        IsApproved:   false, // pending moderation
    }

    if err := momentsService.CreateMoment(&moment); err != nil {
        return utils.Error(c, http.StatusInternalServerError, "Error saving moment", err.Error())
    }

    return utils.Success(c, http.StatusCreated, "Moment submitted for review", moment)
}
```

**IMPORTANT:** The `uuid.UUID` import (`github.com/gofrs/uuid`) may not be used directly in this file — remove it from imports if so. Run `go build` and fix any "imported and not used" errors.

**Step 3: Add InitPublicMomentsController call to server.go**

After the existing controller init block (line ~180), add:
```go
momentsController.InitPublicMomentsController(accessTokenRepo, resourceSvc)
```

Import for `momentsController` already exists as `"events-stocks/controllers/moments"`. Check the import alias — it might be `momentsController` or just `moments`. Use the same one.

**Step 4: Add public routes to routes.go**

In the public group section, after existing public routes:
```go
public.GET("/events/:identifier/moments", moments.ListPublicMoments)

momentsUploadGroup := public.Group("/events/:identifier/moments")
momentsUploadGroup.Use(sensitiveRateLimiter())
momentsUploadGroup.POST("", moments.CreatePublicMoment)
```

This applies the sensitive rate limiter (~10/min) to uploads but not to the GET list.

**Step 5: Build check**
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Fix any import or type errors.

**Step 6: Commit**
```bash
git add controllers/moments/public_moments.go server.go routes/routes.go services/resources/Resources.go
git commit -m "feat(moments): add public GET/POST /events/:identifier/moments endpoints"
```

---

### Task B5: cafetton — types.ts + PageMeta update

**Context:** cafetton's `src/components/engine/types.ts` defines all SDUI types. We need to add `MomentWall` as a valid section type and add `eventId`/`identifier` to `PageMeta`.

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\engine\types.ts`

**Step 1: Read the current types.ts**

Read the full file. Find `PageMeta` and the section type union.

**Step 2: Add to PageMeta**

Find:
```typescript
export interface PageMeta {
  pageTitle: string;
  musicUrl?: string;
  contact?: PageContact;
}
```

Add two optional fields:
```typescript
export interface PageMeta {
  pageTitle: string;
  musicUrl?: string;
  contact?: PageContact;
  eventId?: string;
  identifier?: string;
}
```

**Step 3: Add MomentWall to section component_type union**

Find where section types are defined (a union type or enum like `'CountdownHeader' | 'GraduationHero' | ...`). Add `'MomentWall'` to the union. If it's just a `string` type, no change needed.

**Step 4: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/engine/types.ts
git commit -m "feat(types): add MomentWall section type + eventId/identifier to PageMeta"
```

---

### Task B6: cafetton — MomentWall.tsx component

**Context:** Full SDUI section component. Fetches approved moments from the public backend endpoint, shows them in a responsive grid, opens a lightbox on click, and has an upload button that opens a modal. Uses Framer Motion (already a dep) for the lightbox overlay.

The section receives the full `PageSpec` as context. From `spec.meta.identifier`, we build the API URL.

**Files:**
- Create: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\sections\MomentWall.tsx`

**Step 1: Read EventPage.tsx to understand how sections receive props**

Read `src/components/engine/EventPage.tsx`. Find how section components are rendered and what props they receive. Typically: `spec: PageSpec` + `section: PageSection`.

**Step 2: Understand the backend URL**

The backend base URL in cafetton comes from an env variable. Check how other components (like RSVPConfirmation.tsx) build the backend URL. Usually `import.meta.env.PUBLIC_BACKEND_URL` or similar.

**Step 3: Create MomentWall.tsx**

Full component (adjust import paths to match cafetton's conventions):
```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Moment {
  id: string
  content_url: string
  description: string
  created_at: string
}

interface Props {
  identifier: string   // event identifier for API calls
  prettyToken?: string // guest's pretty_token for uploads (from URL or context)
  title?: string       // section config title
  subtitle?: string    // section config subtitle
}

const BACKEND = import.meta.env.PUBLIC_BACKEND_URL ?? ''

export default function MomentWall({ identifier, prettyToken, title, subtitle }: Props) {
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<Moment | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const fetchMoments = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/events/${identifier}/moments`)
      if (!res.ok) return
      const json = await res.json()
      setMoments(json.data ?? [])
    } catch {
      // fail silently — MomentWall is optional
    } finally {
      setLoading(false)
    }
  }, [identifier])

  useEffect(() => { fetchMoments() }, [fetchMoments])

  // Close lightbox on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!prettyToken) return
    const form = e.currentTarget
    const fileInput = form.elements.namedItem('file') as HTMLInputElement
    const descInput = form.elements.namedItem('description') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('pretty_token', prettyToken)
    fd.append('description', descInput.value)

    try {
      const res = await fetch(`${BACKEND}/api/events/${identifier}/moments`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message ?? 'Error al subir')
      }
      setUploadSuccess(true)
      setShowUpload(false)
      setTimeout(() => setUploadSuccess(false), 3000)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir la foto')
    } finally {
      setUploading(false)
    }
  }

  const getImageUrl = (contentUrl: string) => {
    if (contentUrl.startsWith('http')) return contentUrl
    // If it's a path like "moments/filename.jpg", construct S3 URL
    // Adjust this based on how other images in cafetton build their URLs
    return `${BACKEND}/storage/${contentUrl}`
  }

  return (
    <section className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold">{title ?? 'Momentos'}</h2>
          {subtitle && <p className="mt-2 text-gray-500">{subtitle}</p>}
        </div>

        {/* Upload success toast */}
        <AnimatePresence>
          {uploadSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mb-6 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center"
            >
              ¡Foto enviada! Aparecerá aquí cuando sea aprobada.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload button (only if guest has a token) */}
        {prettyToken && (
          <div className="mb-8 text-center">
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-6 py-3 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Subir foto
            </button>
          </div>
        )}

        {/* Moments grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">
            Aún no hay momentos compartidos.
          </p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {moments.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setLightbox(m)}
                className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                <img
                  src={getImageUrl(m.content_url)}
                  alt={m.description || 'Momento del evento'}
                  className="w-full object-cover hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="relative max-w-3xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={getImageUrl(lightbox.content_url)}
                alt={lightbox.description || 'Momento'}
                className="w-full max-h-[80vh] object-contain rounded-xl"
              />
              {lightbox.description && (
                <p className="mt-3 text-center text-white/70 text-sm">{lightbox.description}</p>
              )}
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                aria-label="Cerrar"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => !uploading && setShowUpload(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Subir foto</h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Foto <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="file"
                    type="file"
                    accept="image/*"
                    required
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (opcional)
                  </label>
                  <input
                    name="description"
                    type="text"
                    placeholder="Un momento especial…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                {uploadError && (
                  <p className="text-sm text-red-600">{uploadError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => !uploading && setShowUpload(false)}
                    disabled={uploading}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Subiendo…' : 'Subir'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
```

**Important:** The `getImageUrl` function assumes a URL pattern. Read how other cafetton components build image URLs (check PhotoGrid.tsx or similar) and match that pattern exactly.

**Important:** The `prettyToken` prop comes from the invitation token in the URL. Check how RSVPConfirmation.tsx accesses the guest's token — use the same mechanism to pass it to MomentWall.

**Step 4: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/sections/MomentWall.tsx
git commit -m "feat(cafetton): add MomentWall section component"
```

---

### Task B7: cafetton — Register MomentWall in EventPage section renderer

**Context:** EventPage.tsx has a switch/map that renders section components based on `section.component_type`. We add `MomentWall` to it.

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\engine\EventPage.tsx`

**Step 1: Read EventPage.tsx fully**

Find the section rendering logic. It's likely a switch statement or object map like:
```tsx
{section.component_type === 'CountdownHeader' && <CountdownHeader ... />}
```
or:
```tsx
const SECTION_MAP = { CountdownHeader: CountdownHeader, ... }
```

**Step 2: Add import**

```tsx
import MomentWall from '../sections/MomentWall'
```

**Step 3: Add to the section renderer**

If using conditional render:
```tsx
{section.component_type === 'MomentWall' && (
  <MomentWall
    identifier={spec.meta.identifier ?? ''}
    prettyToken={prettyToken}  // however prettyToken is currently threaded
    title={section.config?.title as string}
    subtitle={section.config?.subtitle as string}
  />
)}
```

Find where `prettyToken` or `token` is available in EventPage.tsx — it comes from the URL query param used to load the spec. Pass it through.

**Step 4: Build check**
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npm run build 2>&1 | tail -20
```
Fix any TypeScript errors.

**Step 5: Commit**
```bash
git add src/components/engine/EventPage.tsx
git commit -m "feat(cafetton): register MomentWall in EventPage section renderer"
```

---

## Task C: Docs update

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\api.md`
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\components.md`

**Step 1: Update docs/api.md**

In the Events endpoint table, add:
| GET | `/events/:id/invitations` | List all invitations for an event (protected) |

In a new "Invitations (protected)" section or in the existing Invitations table:
| POST | `/invitations/:id/resend` | Log a manual resend of an invitation |

Add a new "Public Moments" section:
| GET | `/events/:identifier/moments` | Public: list approved moments for an event |
| POST | `/events/:identifier/moments` | Public: submit guest photo (multipart: file, pretty_token, description?) |

**Step 2: Update docs/components.md**

Add entry for the updated InvitationTracker (now has resend button) and new MomentWall section in cafetton.

**Step 3: Commit**
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
git add docs/api.md docs/components.md
git commit -m "docs: update api.md and components.md for Sprint 2 features"
```

---

## Verification checklist

Before marking complete, verify:

- [ ] `go build ./...` passes in backend with zero errors
- [ ] `GET /api/events/:id/invitations` returns 200 with auth token, 401 without
- [ ] `POST /api/invitations/:id/resend` creates InvitationLog entry in DB
- [ ] `GET /api/events/:identifier/moments` returns 200 without auth
- [ ] `POST /api/events/:identifier/moments` returns 401 with invalid token, 201 with valid token + file
- [ ] `npm run build` passes in dashboard-ts
- [ ] InvitationTracker resend button spins and calls backend when clicked
- [ ] `npm run build` passes in cafetton-casero
- [ ] MomentWall renders skeleton → grid when moments exist
- [ ] Upload modal opens, submits, shows success message
