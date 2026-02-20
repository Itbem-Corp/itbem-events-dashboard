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
