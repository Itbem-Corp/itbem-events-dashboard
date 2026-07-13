import { runtimeCaching as defaultRuntimeCaching } from '@ducanh2912/next-pwa'
import { describe, expect, it } from 'vitest'

import {
  dashboardRuntimeCaching,
  isDashboardRuntimeCacheable,
} from '../../../src/lib/pwa-runtime-caching.mjs'

describe('dashboardRuntimeCaching', () => {
  it('removes default caches that can contain authenticated data', () => {
    expect(defaultRuntimeCaching.some((entry) => entry?.options?.cacheName === 'apis')).toBe(true)
    expect(defaultRuntimeCaching.some((entry) => entry?.options?.cacheName === 'cross-origin')).toBe(true)
    expect(defaultRuntimeCaching.some((entry) => entry?.options?.cacheName === 'next-image')).toBe(true)

    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'apis')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'cross-origin')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'next-image')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'next-data')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'pages')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'pages-rsc')).toBe(false)
    expect(dashboardRuntimeCaching.some((entry) => entry?.options?.cacheName === 'pages-rsc-prefetch')).toBe(false)
  })

  it('does not cache sensitive dashboard or backend API responses', () => {
    expect(isDashboardRuntimeCacheable('/api/auth/token')).toBe(false)
    expect(isDashboardRuntimeCacheable('/api/og')).toBe(false)
    expect(isDashboardRuntimeCacheable('https://api.eventiapp.com.mx/api/events')).toBe(false)
    expect(isDashboardRuntimeCacheable('https://api.eventiapp.com.mx/api/users/all')).toBe(false)
    expect(isDashboardRuntimeCacheable('/events')).toBe(false)
    expect(isDashboardRuntimeCacheable('/events/event-1?_rsc=private')).toBe(false)
    expect(isDashboardRuntimeCacheable('/_next/data/build-id/events.json')).toBe(false)
  })

  it('does not cache Next image optimizer responses for signed backend media', () => {
    const signedCoverUrl = encodeURIComponent(
      'https://api.eventiapp.com.mx/api/events/event-1/cover?X-Amz-Signature=secret'
    )

    expect(isDashboardRuntimeCacheable(`/_next/image?url=${signedCoverUrl}&w=1080&q=75`)).toBe(false)
  })

  it('keeps static dashboard assets cacheable', () => {
    expect(isDashboardRuntimeCacheable('/_next/static/chunks/app.js')).toBe(true)
    expect(isDashboardRuntimeCacheable('https://cdn.eventiapp.com.mx/events/cover.webp')).toBe(true)
  })
})
