import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/users/page.tsx'), 'utf8')

describe('Users primary controls', () => {
  it('ships the visible active toggle with the route instead of showing a post-list skeleton', () => {
    expect(source).toContain("import { UserActiveToggle } from '@/components/users/UserActiveToggle'")
    expect(source).not.toContain("import('@/components/users/UserActiveToggle')")
    expect(source).not.toContain('Cargando control de acceso')
  })

  it('keeps secondary user actions behind intent-loaded chunks', () => {
    expect(source).toContain("const loadUserFormModal = () => import('@/components/users/forms/user-form-modal')")
    expect(source).toContain("const loadDeleteUserModal = () => import('@/components/users/delete-user-modal')")
    expect(source).toContain("const loadUserListActionsMenu = () => import('@/components/users/user-list-actions-menu')")
  })
})
