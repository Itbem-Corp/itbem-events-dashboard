import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function pageSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('intent-based modal mounting', () => {
  it('keeps client modals unmounted until their matching action opens', () => {
    const source = pageSource('src/app/(app)/clients/page.tsx')

    expect(source).toContain('{isFormOpen && (')
    expect(source).toMatch(/\{isDeleteOpen\s*&&\s*\(\s*<DeleteClientModal/)
    expect(source).toContain('{isMembersOpen && selectedClient && (')
    expect(source).toContain('preload(clientTypesPath(), fetcher)')
  })

  it('keeps user and event modals unmounted until intent', () => {
    const users = pageSource('src/app/(app)/users/page.tsx')
    const events = pageSource('src/app/(app)/events/page.tsx')

    expect(users).toMatch(/\{isFormOpen\s*&&\s*\(\s*<UserFormModal/)
    expect(users).toMatch(/\{isDeleteOpen\s*&&\s*\(\s*<DeleteUserModal/)
    expect(events).toMatch(/\{isFormOpen\s*&&\s*\(\s*<EventFormModal/)
    expect(events).toContain('{isDuplicateOpen && eventToDuplicate && (')
    expect(events).toContain('{eventToDelete && (')
  })

  it('keeps profile and event cover editors unmounted until intent', () => {
    const profile = pageSource('src/app/(app)/settings/profile/page.tsx')
    const eventDetail = pageSource('src/app/(app)/events/[id]/page.tsx')

    expect(profile).toContain('{isAvatarEditorOpen && (')
    expect(eventDetail).toContain('{coverEditorOpen && (')
  })
})
