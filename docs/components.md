# Components

## Layout Hierarchy

```
src/components/sidebar-layout.tsx   ← two-column: fixed sidebar + mobile drawer
src/components/stacked-layout.tsx   ← vertical stack: header + content
  └── ApplicationLayout (application-layout.tsx)
        ├── SidebarHeader  — org/client switcher
        ├── SidebarBody → SidebarSection → SidebarItem (Motion active indicator)
        └── SidebarFooter  — avatar + user name + AccountDropdownMenu

src/components/auth-layout.tsx      ← centered card for login/register
src/components/session/SessionBootstrap.tsx  ← invisible, bootstraps profile
```

## Standard Page Pattern

Every `(app)` page:

```tsx
'use client'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useStore } from '@/store/useStore'

export default function FeaturePage() {
  const { currentClient } = useStore()
  const { data, isLoading, mutate } = useSWR<Feature[]>(
    currentClient ? `/features?client_id=${currentClient.id}` : null,
    fetcher
  )
  const [modal, setModal] = useState<{ type: 'create'|'edit'|'delete'|null; target: Feature|null }>
    ({ type: null, target: null })

  if (isLoading) return <Skeleton />

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* header: title + primary action button */}
      {/* table or card list */}
      {/* Dialog modals: create · edit */}
      {/* Alert modal: delete confirmation */}
    </div>
  )
}
```

## CRUD Modal State (grouped — one useState per page)

```tsx
const [modal, setModal] = useState<{
  type: 'create' | 'edit' | 'delete' | null
  target: Model | null
}>({ type: null, target: null })
```

## Core UI Primitives

All live in `src/components/` (Headless UI based unless noted).

### Button (`button.tsx`)
```tsx
<Button color="indigo">Primary</Button>   // solid (default)
<Button outline>Secondary</Button>
<Button plain href="/path">← Link</Button>
```
Colors: `indigo zinc green pink red orange amber yellow lime emerald teal sky blue violet purple fuchsia rose white dark`

### Input (`input.tsx`)
```tsx
<InputGroup><SearchIcon /><Input type="search" placeholder="Search..." /></InputGroup>
```
Types: `email number password search tel text url date datetime-local month week time`

### Textarea (`textarea.tsx`)
```tsx
<Textarea resizable rows={4} />
```

### Select (`select.tsx`) — native HTML select, custom styled
```tsx
<Select name="type"><option value="AGENCY">Agency</option></Select>
```

### Listbox (`listbox.tsx`) — styled single-select dropdown
```tsx
<Listbox value={val} onChange={setVal}>
  <ListboxOption value="WEDDING"><ListboxLabel>Wedding</ListboxLabel></ListboxOption>
</Listbox>
```

### Combobox (`combobox.tsx`) — searchable select, supports virtual scroll
```tsx
<Combobox options={options} value={val} onChange={setVal} displayValue={(o) => o.name} />
```

### Checkbox (`checkbox.tsx`)
```tsx
<CheckboxField><Checkbox name="active" /><Label>Active</Label></CheckboxField>
```

### Radio (`radio.tsx`)
```tsx
<RadioGroup value={val} onChange={setVal}>
  <RadioField><Radio value="A" /><Label>Option A</Label></RadioField>
</RadioGroup>
```

### Switch (`switch.tsx`) — toggle
```tsx
<SwitchField><Switch checked={val} onChange={setVal} /><Label>Enable</Label></SwitchField>
```

### Dialog (`dialog.tsx`) — modal, sizes: `xs sm md lg xl 2xl 3xl 4xl 5xl`
```tsx
<Dialog open={open} onClose={setOpen} size="lg">
  <DialogTitle>Title</DialogTitle>
  <DialogBody>{/* fields */}</DialogBody>
  <DialogActions>
    <Button plain onClick={() => setOpen(false)}>Cancel</Button>
    <Button color="indigo" type="submit">Save</Button>
  </DialogActions>
</Dialog>
```

### Alert (`alert.tsx`) — **use for delete confirmations, not Dialog**
```tsx
<Alert open={open} onClose={setOpen}>
  <AlertTitle>Delete Client?</AlertTitle>
  <AlertDescription>This action cannot be undone.</AlertDescription>
  <AlertActions>
    <Button plain onClick={() => setOpen(false)}>Cancel</Button>
    <Button color="red" onClick={handleDelete}>Delete</Button>
  </AlertActions>
</Alert>
```

### Dropdown (Headless UI) (`dropdown.tsx`) — rich menu with sections, shortcuts, submenus
```tsx
<Dropdown>
  <DropdownButton outline>Options</DropdownButton>
  <DropdownMenu anchor="bottom end">
    <DropdownItem onClick={handleEdit}>Edit</DropdownItem>
    <DropdownDivider />
    <DropdownItem onClick={handleDelete}>Delete</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

### DropdownMenu (Radix UI) (`ui/dropdown-menu.tsx`) — used in shadcn/ui style components
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button>...</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Use `dropdown.tsx` (Headless UI) for table row action menus. Use `ui/dropdown-menu.tsx` (Radix) only for shadcn-style components.**

### Badge (`badge.tsx`)
```tsx
<Badge color="green">Active</Badge>
<Badge color="pink">Inactive</Badge>
<Badge color="indigo">ROOT</Badge>
<Badge color="zinc">Closed</Badge>
```
Colors: all Tailwind color names supported.

### Avatar (`avatar.tsx`) — image or initials fallback, square or circular
```tsx
<Avatar src={user.profile_image} initials="JD" className="size-8" />
```

### UserAvatar (`ui/UserAvatar.tsx`) — wraps Avatar for User model
```tsx
<UserAvatar user={user} size="md" />  // sizes: sm md lg xl
```

### Table (`table.tsx`)
```tsx
<Table>
  <TableHead><TableRow><TableHeader>Name</TableHeader></TableRow></TableHead>
  <TableBody>
    {items.map(i => (
      <TableRow key={i.id} href={`/items/${i.id}`}>  {/* href = clickable row */}
        <TableCell>{i.name}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```
Props: `bleed` `dense` `grid` `striped`

### Pagination (`pagination.tsx`)
```tsx
<Pagination>
  <PaginationPrevious href="?page=1" />
  <PaginationList>
    <PaginationPage href="?page=1" current>1</PaginationPage>
    <PaginationGap />
    <PaginationPage href="?page=5">5</PaginationPage>
  </PaginationList>
  <PaginationNext href="?page=3" />
</Pagination>
```

### Fieldset + Field (`fieldset.tsx`) — form layout structure
```tsx
<Fieldset>
  <Legend>Section Title</Legend>
  <FieldGroup>
    <Field>
      <Label>Name</Label>
      <Input {...register('name')} />
      <ErrorMessage>{errors.name?.message}</ErrorMessage>
    </Field>
  </FieldGroup>
</Fieldset>
```

### Heading (`heading.tsx`)
```tsx
<Heading level={1}>Page Title</Heading>   // h1-h6
<Subheading level={2}>Section</Subheading>
```

### Text (`text.tsx`)
```tsx
<Text>Body paragraph</Text>
<TextLink href="/link">Styled link</TextLink>
<Strong>Bold</Strong>
<Code>inline code</Code>
```

### DescriptionList (`description-list.tsx`) — metadata display
```tsx
<DescriptionList>
  <DescriptionTerm>Created</DescriptionTerm>
  <DescriptionDetails>{format(date, 'PPP')}</DescriptionDetails>
</DescriptionList>
```

### Divider (`divider.tsx`)
```tsx
<Divider />        // solid
<Divider soft />   // subtle
```

### Link (`link.tsx`) — wraps Next.js Link with Headless UI data attributes
```tsx
<Link href="/events">Events</Link>
```

## Feature-Specific Components

### FileUpload (`ui/file-upload.tsx`)
```tsx
<FileUpload
  preview="avatar"               // avatar | user-avatar | image | video | file
  onDrop={(files) => handle(files[0])}
  accept={ACCEPT_PRESETS.images} // or .videos | .docs
  maxSize={25 * 1024 * 1024}     // 25MB default
/>
```
Used in settings/profile (avatar) and client form (logo). Sends as `FormData`.

### UserActiveToggle (`users/UserActiveToggle.tsx`)
```tsx
<UserActiveToggle user={user} onToggle={mutate} />
// Calls PUT /users/{id}/activate or PUT /users/{id}/deactivate
```

### ClientFormModal (`clients/forms/client-form-modal.tsx`)
- Create or edit client — name, client_type (dropdown), logo (FileUpload)
- Sends as `FormData` (multipart, for logo upload)
- `POST /clients` create · `PUT /clients/:id` edit

### DeleteClientModal (`clients/forms/delete-client-modal.tsx`)
- Alert-based confirmation. Calls `DELETE /clients/:id`.

### UserFormModal (`users/forms/user-form-modal.tsx`)
- Create (invite): email + first_name + last_name
- Edit: first_name + last_name only (email disabled)

### DeleteUserModal (`users/delete-user-modal.tsx`)
- Alert-based confirmation. Calls `DELETE /users/:id`.

### Stat (`src/app/stat.tsx`) — KPI card
- `change` prop: positive → `lime` badge · negative → `pink` badge

### UserHeader (`components/UserHeader.tsx`)
- Profile dropdown in navbar. Shows name/email, links to profile + logout.

---

## Guest Components

### GuestStatusBadge (`guests/guest-status-badge.tsx`)

Renders a colored `Badge` for a guest's RSVP status. Accepts either a full `GuestStatus` object or a raw code string.

```tsx
<GuestStatusBadge status={guest.status} />
// or with raw code:
<GuestStatusBadge code="CONFIRMED" />
```

Color mapping: `PENDING` → `amber` · `CONFIRMED` → `lime` · `DECLINED` → `pink` · unknown → `zinc`

### GuestFormModal (`guests/forms/guest-form-modal.tsx`)

Dialog modal for creating or editing a single guest. Validated with Zod + React Hook Form.

```tsx
<GuestFormModal
  isOpen={open}
  setIsOpen={setOpen}
  eventId={event.id}
  eventIdentifier={event.identifier}
  guest={guestToEdit}   // null/undefined for create
/>
```

- Fields: `first_name`, `last_name`, `email` (optional), `phone` (optional), `guests_count` (1–20), `table_number` (optional), `dietary_restrictions` (optional)
- Create: `POST /guests` with `event_id` · Edit: `PUT /guests/:id`
- Calls `mutate('/guests/:eventIdentifier')` after success

### GuestDeleteModal (`guests/guest-delete-modal.tsx`)

Alert-based confirmation for deleting a guest. Controlled by passing the `guest` prop (`null` = closed).

```tsx
<GuestDeleteModal
  guest={guestToDelete}   // null = closed
  eventIdentifier={event.identifier}
  onClose={() => setGuestToDelete(null)}
/>
```

Calls `DELETE /guests/:id` then `mutate('/guests/:eventIdentifier')`.

### GuestBatchModal (`guests/forms/guest-batch-modal.tsx`)

Large Dialog (`size="4xl"`) for bulk-importing multiple guests at once via a spreadsheet-style row editor.

```tsx
<GuestBatchModal
  isOpen={open}
  setIsOpen={setOpen}
  eventId={event.id}
  eventIdentifier={event.identifier}
/>
```

- Rows are added/removed dynamically with Motion `AnimatePresence` animations
- Inline validation: `first_name` and `last_name` required (min 2 chars); errors shown per cell
- Submits `POST /guests/batch` with an array payload; each row includes `event_id`
- On success all guests + their RSVP invitations are created atomically by the backend
- Calls `mutate('/guests/:eventIdentifier')` after success

---

## Event Detail Components

### MomentsWall (`events/moments-wall.tsx`)

Masonry-style photo/text wall for guest-submitted moments. Fetches via SWR with `GET /moments?event_id=:id`.

```tsx
<MomentsWall eventId={event.id} />
```

- Filterable by `all | pending | approved` using a segmented control
- Each `MomentCard` shows: status badge (Aprobado/Pendiente), media (image or italic message quote), guest name, date
- Actions inline per card: **Aprobar** (`PUT /moments/:id` with `is_approved: true`) · **Eliminar** (`DELETE /moments/:id`)
- Skeleton loader: 8 square placeholder cells in a 2–4 column responsive grid
- Uses Motion `layout` + `AnimatePresence` for card enter/exit animations

### RSVPTracker (`events/rsvp-tracker.tsx`)

RSVP status dashboard with animated progress bar and a full guest table. Receives pre-fetched guests (from the parent page's SWR call) — does NOT fetch independently.

```tsx
<RSVPTracker
  eventIdentifier={event.identifier}
  guests={guests}
  isLoading={isLoading}
/>
```

- Displays response rate (confirmed + declined / total) as an animated Motion progress bar
- Color-coded counts: confirmed (lime), pending (amber), declined (pink)
- Guest table sorted: pending first, then newest first
- Inline `InvitationStatusDot` sub-component shows 3-step progress: Enviada → Abierta → Respondida

### EventConfigPanel (`events/event-config-panel.tsx`)

Settings panel for event visibility and access. Fetches `GET /events/:id/config` via SWR.

```tsx
<EventConfigPanel eventId={event.id} eventIdentifier={event.identifier} />
```

- Toggle settings via `SettingRow` sub-component (icon + Switch):
  - **Evento público** (`is_public`)
  - **Mostrar lista de invitados** (`show_guest_list`)
  - **Permitir registro** (`allow_registration`)
- **Contraseña de acceso** — optional free-text field (`password_protection`)
- **URL pública** — read-only display with copy-to-clipboard; constructed as `NEXT_PUBLIC_FRONTEND_URL/e/:identifier`
- Save button only enabled when form is dirty (`isDirty` local state); calls `PUT /events/:id/config`
- Uses Motion staggered `y: 8` fade-in for each section card

### EventSectionsManager (`events/event-sections-manager.tsx`)

Drag-reorder-style manager for the sections that compose the event's public page. Fetches `GET /events/:id/sections`.

```tsx
<EventSectionsManager eventId={event.id} />
```

- Supported section types: `HERO` · `TEXT` · `GALLERY` · `MAP` · `SCHEDULE` · `MUSIC`
- Each `SectionRow` has:
  - Up/Down arrow controls → calls `PUT /sections/:id` on both swapped sections simultaneously via `Promise.all`
  - Eye toggle → `PUT /sections/:id` with `is_visible` flipped; hidden rows render at 60% opacity
  - Trash → `DELETE /sections/:id`
- `AddSectionPanel` inline form: type-selector grid + optional custom name → `POST /events/:id/sections`
- Skeleton loader: 4 placeholder rows
- Motion `layout` + `AnimatePresence` on the section list

### EventCoverUpload (`events/event-cover-upload.tsx`)

Drag-and-drop / click-to-upload cover image widget for an event. Uses the generic `/resources` endpoint.

```tsx
<EventCoverUpload event={event} />
```

- If event has no cover: shows dashed drop zone (16:9 aspect ratio), accepts `image/*`, max 10 MB
- If event has cover: shows the image with a hover overlay offering **Cambiar** (re-upload) and **Eliminar** (sets `cover_image_url` to `''` via `PUT /events/:id`)
- Upload: `POST /resources` as `FormData` with `file`, `owner_type: 'event'`, `owner_id`
- Calls `mutate('/events/:id')` after upload or removal
- Validation: rejects non-image MIME types and files over 10 MB before uploading

### EventSharePanel (`events/event-share-panel.tsx`)

Read-only sharing hub showing event public URLs, guest contact stats, and a mailto shortcut for pending invitees. Receives pre-fetched guests — no independent SWR calls.

```tsx
<EventSharePanel event={event} guests={guests} />
```

- **Links del evento**: página pública (`/e/:identifier`) + portal RSVP (`/rsvp/:identifier`), each with a copy button
- **Stats cards**: guests with email count · guests with phone count
- **Pendientes con correo** amber callout — visible only when there are pending guests with email; includes a mailto button that opens the default email client pre-filled with all pending emails, subject, and RSVP link
- **QR code hint** — informational card; no QR generation (links to external service)
- `PUBLIC_FRONTEND_URL` defaults to `process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://itbem.events'`

### EventAnalyticsPanel (`events/event-analytics-panel.tsx`)

KPI dashboard with recharts charts for event analytics. Fetches `GET /events/:id/analytics` and `GET /guests/:identifier` via SWR.

```tsx
<EventAnalyticsPanel eventId={event.id} eventIdentifier={event.identifier} />
```

- 4 KPI cards: Vistas · Confirmados · Declinaron · Tasa respuesta %
- Horizontal `BarChart` (recharts): RSVP funnel — Invitados / Respondieron / Confirmados / Declinaron
- Donut `PieChart` (recharts): guest composition by role (graduate/guest/vip/speaker/staff/host), color-coded
- Moments upload callout card — shown only when `moment_uploads > 0`
- Skeleton loader (grid of 4 + 2 tall placeholder blocks) while either SWR call is loading
- Named export: `export function EventAnalyticsPanel`
- Wired to 'analiticas' tab in event detail page

---

## Client Components

### ClientMembersModal (`clients/client-members-modal.tsx`)

Dialog for managing client team members (invite, change role, remove). Fetches `GET /clients/members?client_id=:id` only when open.

```tsx
<ClientMembersModal
  isOpen={open}
  onClose={() => setOpen(false)}
  clientId={client.id}
  clientName={client.name}
/>
```

- **Invite form** (`InviteForm` sub-component): toggled inline; email + role select → `POST /clients/invite`
  - Role options (excluding OWNER): `ADMIN` · `EDITOR` · `VIEWER`
- **Member list**: avatar + name + email + role badge
  - OWNER role badge shows a shield icon; edit/remove actions are hidden for OWNERs
  - Edit role: inline Select + OK/cancel → `PUT /clients/members/:userId?client_id=:id`
  - Remove: opens an embedded Alert confirmation → `DELETE /clients/members/:userId?client_id=:id`
- Roles color coding: `OWNER` → `indigo` · `ADMIN` → `blue` · `EDITOR` / `VIEWER` → `zinc`
- Calls `mutate('/clients/members?client_id=:id')` after every write

---

## New SDUI & Event Features (added)

### EventSectionsManager (redesigned)
`src/components/events/event-sections-manager.tsx`
- **SDUI section types** aligned with public frontend: CountdownHeader, GraduationHero, EventVenue, Reception, GraduatesList, PhotoGrid, RSVPConfirmation + classic HERO/TEXT/GALLERY/MAP/SCHEDULE/MUSIC
- **Config editor per type** — inline form that expands per section row (⚙ button)
- **Media manager per section** — image upload slots per SDUI type (📷 button), shows expected positions with progress
- **component_type + config** fields sent to backend
- Adds SDUI tab (components aligned with public frontend registry) vs Classic tab in add panel

### EventSectionResources
`src/components/events/event-section-resources.tsx`
- Per-section image upload with expected position slots per SDUI component_type
- Progress bar showing filled/total slots
- Inline preview, replace, delete per slot
- Uses `POST /resources` (multipart) and `DELETE /resources/:id`
- Fetches existing resources via `GET /resources/section/:sectionId`

### InvitationTracker
`src/components/events/invitation-tracker.tsx`
- New tab "Invitaciones" in event detail page
- Per-guest RSVP tracking: status, responded_at, method (web/app/host), guest_count
- Response rate progress bar + stat grid
- Filter by PENDING/CONFIRMED/DECLINED with counts
- Bulk WhatsApp send panel
- Per-guest actions: copy link, WhatsApp, email
- CSV export of invitation tracking data
- Pending badge counter on tab

### EventConfigPanel (expanded)
`src/components/events/event-config-panel.tsx`
- Now exposes ALL backend config fields:
  - Guest interaction: allow_uploads, allow_messages, notify_on_moment_upload
  - Scheduling: active_from, active_until
  - Custom messages: welcome_message, thank_you_message, moment_message, guest_signature_title
  - Section visibility toggles: show_countdown, show_rsvp, show_location, show_gallery, show_wall, show_contact, show_schedule

### Event Form (expanded)
`src/components/events/forms/event-form-modal.tsx`
- Added fields: second_address, music_url (URL validated)
- Description changed to textarea
- Address split into primary + secondary

### Event Detail Page
`src/app/(app)/events/[id]/page.tsx`
- New **"Invitaciones"** tab with InvitationTracker (pending count badge)
- **Vista previa** button — opens public frontend
- TABS: Resumen, Invitados, Invitaciones, RSVP, Momentos, Analíticas, Config

## Studio & Special Modes

### Event Studio (`/events/[id]/studio`)
- **File**: `src/app/(app)/events/[id]/studio/page.tsx`
- Full-screen editor (`fixed inset-0 z-50`) overlays the sidebar layout
- Split: 288px left sidebar (Secciones/Ajustes/Diseño panels) + iframe preview right
- Iframe: device toggle (desktop/tablet/mobile), browser chrome simulation for tablet/mobile, refreshes on any save
- **Secciones panel**: each row has expand (∨) / reorder (↑↓) / visibility toggle
  - Expand → `SectionConfigEditor` opens inline with fields per `component_type`:
    - `CountdownHeader`: heading + targetDate (datetime-local)
    - `GraduationHero`: title + years + school
    - `EventVenue`: intro text + date text + venueText + mapUrl
    - `Reception`: venueText + mapUrl
    - `GraduatesList`: closing text
    - `TEXT` / `HERO`: content / title + subtitle
    - `MAP`: mapUrl
    - `PhotoGrid` / `RSVPConfirmation` / `GALLERY`: no-config notice
    - fallback: raw JSON textarea
  - Save calls PUT `/sections/:id` with merged `config` JSONB, then refreshes preview
- **Ajustes panel**: 8 Switch toggles + welcome/thank-you message textareas — calls PUT `/events/:id/config`
- **Diseño panel**: shows active template + link to full design editor
- Publish button: sets `is_public: true` via PUT `/events/:id/config`; shows live URL chip + copy button

### Check-in Mode (`/events/[id]/checkin`)
- **File**: `src/app/(app)/events/[id]/checkin/page.tsx`
- Full-screen overlay (`fixed inset-0 z-50`) optimized for phone/tablet
- Auto-refreshes guest list every 10 seconds
- Filter: Todos / Esperados / Llegaron
- "Llegó" button calls PUT `/guests/:id` with `CONFIRMED` status_id
- Sticky header with search + progress bar + stats footer

## New Event Components

| Component | File | Description |
|---|---|---|
| `SeatingPlan` | `components/events/seating-plan.tsx` | Table-based guest seating view, inline table assignment |
| `EventDesignPicker` | `components/events/event-design-picker.tsx` | Design template, color palette, font set selector |
| `InvitationTracker` | `components/events/invitation-tracker.tsx` | Full invitation tracking with bulk WhatsApp, CSV export |

## Guest Form Enhancements
- Added fields: `role` (graduate/guest/host/vip/speaker/staff), `is_host` (boolean), `notes` (textarea), `max_guests` (number)
- **Perfil público** collapsible section (auto-opens on edit when data exists): `headline` (role/title), `bio` (short profile text), `signature` (dedication/closing phrase)
  - These fields feed the `GraduatesList` SDUI section on the public event page
  - Section auto-expands when editing a guest who already has profile data
- Uses `Controller` from react-hook-form for the Headless UI Checkbox
