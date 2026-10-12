import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Root account guards mirror the backend', () => {
  const users = read('src/app/(app)/users/page.tsx')

  it('hides Eliminar for Root 1 rows (backend answers 409 protected account)', () => {
    expect(users).toContain('canDelete={isPrimaryRoot && !isPrimaryRootAccount(user)}')
  })

  it('hides the Desactivar toggle for Root 1 rows, including root_level 1 with is_root false', () => {
    expect(users).toContain('{!user.is_root && !isPrimaryRootAccount(user) && (')
  })

  it('uses one primary-root rule for the caller and the rows', () => {
    expect(users).toContain('const isPrimaryRoot = isPrimaryRootAccount(currentUser)')
  })
})

describe('Root 2 team management copy', () => {
  const clients = read('src/app/(app)/clients/page.tsx')

  it('no longer says Root 2 cannot touch teams', () => {
    expect(clients).not.toContain('sin cambiar su jerarquía ni equipos')
    expect(clients).toContain('gestionar los equipos por debajo del Propietario')
  })
})

describe('Member-management 403s', () => {
  it('the global 403 toast uses the Spanish member-denial copy when it matches', () => {
    const api = read('src/lib/api.ts')
    expect(api).toContain('memberAccessDenialMessage(error) ??')
  })

  it('the members modal does not repeat the 403 toast the interceptor already showed', () => {
    const modal = read('src/components/clients/client-members-modal.tsx')
    expect(modal).toContain("if (apiErrorStatus(err) === 403) return")
    expect(modal).toContain("toastMemberError(err, 'Error al enviar la invitación')")
  })
})
