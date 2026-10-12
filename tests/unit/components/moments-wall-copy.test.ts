import { describe, expect, it } from 'vitest'

import { describeMomentProcessingError, formatBytes } from '@/components/events/moments-wall'

describe('moments wall copy helpers', () => {
  it('never formats missing sizes as NaN', () => {
    expect(formatBytes(undefined)).toBeNull()
    expect(formatBytes(0)).toBeNull()
    expect(formatBytes(Number.NaN)).toBeNull()
    expect(formatBytes(250)).toBe('1 KB')
    expect(formatBytes(150_000)).toBe('150 KB')
    expect(formatBytes(2_500_000)).toBe('2.5 MB')
  })

  it('maps raw processing errors to Spanish', () => {
    expect(describeMomentProcessingError('media processing queue unavailable')).toBe(
      'El servicio de procesamiento no estaba disponible. Puedes reintentarlo.'
    )
    expect(describeMomentProcessingError('image: unknown format')).toMatch(/no es una foto o video válido/)
    expect(describeMomentProcessingError('NoSuchKey: key not found')).toMatch(/No encontramos el archivo original/)
    expect(describeMomentProcessingError('')).toBe('No pudimos procesar este archivo.')
    expect(describeMomentProcessingError('weird internal thing')).toBe('No pudimos procesar este archivo.')
  })
})
