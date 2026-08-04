import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const page = readFileSync(resolve(root, 'src/app/(app)/settings/profile/page.tsx'), 'utf8')
const feature = readFileSync(resolve(root, 'src/features/users/use-user-profile.ts'), 'utf8')

describe('profile feature boundary', () => {
  it('keeps remote profile data and mutations out of the route', () => {
    expect(page).toContain("@/features/users/use-user-profile")
    expect(page).not.toContain("@/lib/api'")
    expect(page).not.toContain("@/lib/fetcher'")
    expect(page).not.toContain("@/store/useStore'")
    expect(feature).toContain('useSWR<UserProfileResponse>')
    expect(feature).toContain('api.put<UserProfileResponse>')
    expect(feature).toContain('setProfile(optimisticProfile)')
  })
})
