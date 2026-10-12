import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const studio = read('src/app/(app)/events/[id]/studio/page.tsx')
const checkin = read('src/app/(app)/events/[id]/checkin/page.tsx')

describe('Studio and check-in tell a failed permission check from a denial', () => {
  it.each([
    ['studio', studio, 'No pudimos verificar tu acceso a Studio'],
    ['check-in', checkin, 'No pudimos verificar tu acceso a check-in'],
  ])('%s: unavailable -> Reintentar, not_found -> Evento no encontrado, 403 -> lock card', (_name, source, title) => {
    expect(source).toContain('capabilityErrorKind(capabilitiesError)')
    expect(source).toContain(title)
    expect(source).toContain('onRetry={() => void retryCapabilities()}')
    expect(source).toContain("capabilitiesErrorKind === 'not_found'")
    expect(source).toContain('<EventNotFoundCard />')
    expect(source).toContain('if (capabilitiesError || !can')
  })
})

describe('check-in writes through the door endpoint', () => {
  it('uses PATCH /guests/bulk/status for Llegó, QR and undo, never PUT /guests/:id', () => {
    expect(checkin).toContain('api.patch(bulkGuestStatusPath(), buildCheckinPayload(eventId, guest.id, confirmedStatus))')
    expect(checkin).toContain('api.patch(bulkGuestStatusPath(), buildCheckinPayload(id, match.id, confirmedStatus))')
    expect(checkin).toContain('api.patch(bulkGuestStatusPath(), buildUndoCheckinPayload(eventId, guest.id))')
    expect(checkin).not.toContain('api.put(')
    expect(checkin).not.toContain('guestPath(')
  })

  it('shows Desmarcar only for a door check-in and explains the 409', () => {
    expect(checkin).toContain('const undoable = isConfirmed && canUndoCheckin(guest)')
    expect(checkin).toContain('UNDO_CHECKIN_CONFLICT_MESSAGE')
  })

  it('does not promise partial email or phone search', () => {
    expect(checkin).toContain('Buscar por nombre o mesa, o correo / teléfono completos…')
    expect(checkin).not.toContain('Buscar por nombre, correo, teléfono o mesa…')
  })
})
