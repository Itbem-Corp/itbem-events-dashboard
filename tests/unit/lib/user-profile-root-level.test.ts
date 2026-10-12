// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { rootLevelLabel } from '@/features/users/root-level'
import { mergeProfileResponse } from '@/features/users/use-user-profile'
import type { UserProfileResponse } from '@/models/User'

const root2: UserProfileResponse = {
  id: 'u-1',
  email: 'soporte@example.com',
  first_name: 'Ana',
  last_name: 'Soporte',
  profile_image: '',
  is_active: true,
  is_root: true,
  root_level: 2,
}

describe('profile root level', () => {
  it('keeps root_level when the save response omits it', () => {
    const response = { ...root2, first_name: 'Ana María', root_level: undefined } as UserProfileResponse
    expect(mergeProfileResponse(root2, response)).toMatchObject({ first_name: 'Ana María', is_root: true, root_level: 2 })
  })

  it('takes the server value when it is present and ignores a different user', () => {
    expect(mergeProfileResponse(root2, { ...root2, root_level: 1 }).root_level).toBe(1)
    expect(mergeProfileResponse(root2, { ...root2, id: 'u-2', root_level: undefined }).root_level).toBeUndefined()
  })

  it('labels Root 1, Root 2 and non-roots in Spanish', () => {
    expect(rootLevelLabel(root2)).toBe('Root 2 · Soporte')
    expect(rootLevelLabel({ is_root: true, root_level: 1 })).toBe('Root 1 · Administrador principal')
    expect(rootLevelLabel({ is_root: true })).toBe('Root 1 · Administrador principal')
    expect(rootLevelLabel({ is_root: false, root_level: 2 })).toBeNull()
  })
})
