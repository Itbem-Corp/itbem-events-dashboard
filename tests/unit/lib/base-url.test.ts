import { describe, expect, it } from 'vitest'
import { normalizeBackendBaseUrl, normalizeBaseUrl } from '@/lib/base-url'

describe('normalizeBaseUrl', () => {
  it('removes one or more trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.example.com///', 'http://localhost:8080')).toBe(
      'https://api.example.com'
    )
  })

  it('keeps a base URL without trailing slashes unchanged', () => {
    expect(normalizeBaseUrl('https://api.example.com', 'http://localhost:8080')).toBe(
      'https://api.example.com'
    )
  })

  it('uses fallback for empty values', () => {
    expect(normalizeBaseUrl(undefined, 'http://localhost:8080')).toBe('http://localhost:8080')
    expect(normalizeBaseUrl('', 'http://localhost:8080')).toBe('http://localhost:8080')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  http://localhost:8080/  ', 'http://fallback.test')).toBe(
      'http://localhost:8080'
    )
  })

  it('normalizes backend URLs that already include the /api route prefix', () => {
    expect(normalizeBackendBaseUrl('https://api.example.com/api', 'http://localhost:8080')).toBe(
      'https://api.example.com'
    )
    expect(normalizeBackendBaseUrl('https://api.example.com/API///', 'http://localhost:8080')).toBe(
      'https://api.example.com'
    )
  })

  it('preserves backend deployment subpaths while stripping only the API route prefix', () => {
    expect(normalizeBackendBaseUrl('https://staging.example.com/eventi-api/api', 'http://localhost:8080')).toBe(
      'https://staging.example.com/eventi-api'
    )
  })

  it('does not strip non-route API-like suffixes from backend URLs', () => {
    expect(normalizeBackendBaseUrl('https://api.example.com/custom-api', 'http://localhost:8080')).toBe(
      'https://api.example.com/custom-api'
    )
  })
})
