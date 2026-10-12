import { describe, expect, it } from 'vitest'

import { MAX_UPLOADS_PER_GUEST, uploadLimitError } from '@/lib/event-upload-limit'

// EVT-73: 900 was silently cut to 500.
describe('upload limit validation', () => {
  it('accepts 0 through the maximum', () => {
    expect(uploadLimitError(0)).toBeNull()
    expect(uploadLimitError(30)).toBeNull()
    expect(uploadLimitError(MAX_UPLOADS_PER_GUEST)).toBeNull()
  })

  it('explains the maximum and rejects negatives, decimals and empty values', () => {
    expect(uploadLimitError(900)).toBe('El máximo es 500 archivos por invitado.')
    expect(uploadLimitError(-1)).toMatch(/entre 0 y 500/)
    expect(uploadLimitError(2.5)).toMatch(/entero/)
    expect(uploadLimitError(Number.NaN)).toMatch(/entre 0 y 500/)
  })
})
