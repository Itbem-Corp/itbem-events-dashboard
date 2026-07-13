import { runtimeCaching as defaultRuntimeCaching } from '@ducanh2912/next-pwa'

// Dashboard pages and RSC/data payloads are personalized. Keeping them in a
// shared service-worker cache can show stale state after mutations or session
// changes, while also duplicating Next/SWR's in-memory navigation cache.
const SENSITIVE_CACHE_NAMES = new Set([
  'apis',
  'cross-origin',
  'next-image',
  'next-data',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
])
const DASHBOARD_ORIGIN = 'https://dashboard.eventiapp.local'

function matchesPattern(pattern, context) {
  if (typeof pattern === 'function') return Boolean(pattern(context))
  if (!(pattern instanceof RegExp)) return false

  pattern.lastIndex = 0
  const matches = pattern.test(context.url.href) || pattern.test(context.url.pathname + context.url.search)
  pattern.lastIndex = 0
  return matches
}

function isPersonalizedNavigation(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc')
}

function withSensitiveUrlGuard(entry) {
  if (!entry?.urlPattern) return entry
  const urlPattern = entry.urlPattern
  return {
    ...entry,
    urlPattern: (context) => !isPersonalizedNavigation(context.url) && matchesPattern(urlPattern, context),
  }
}

export const dashboardRuntimeCaching = defaultRuntimeCaching
  .filter((entry) => !SENSITIVE_CACHE_NAMES.has(entry?.options?.cacheName))
  .map(withSensitiveUrlGuard)

function requestForUrl(url, method = 'GET') {
  return new Request(url.href, { method })
}

function patternMatches(pattern, url, method) {
  return matchesPattern(pattern, {
    request: requestForUrl(url, method),
    url,
    sameOrigin: url.origin === DASHBOARD_ORIGIN,
  })
}

export function isDashboardRuntimeCacheable(input, method = 'GET') {
  const url = new URL(String(input), DASHBOARD_ORIGIN)
  return dashboardRuntimeCaching.some((entry) => patternMatches(entry.urlPattern, url, method))
}
