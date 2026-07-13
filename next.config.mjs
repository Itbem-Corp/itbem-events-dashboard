import bundleAnalyzer from '@next/bundle-analyzer'
import withPWAInit from '@ducanh2912/next-pwa'
import { dashboardRuntimeCaching } from './src/lib/pwa-runtime-caching.mjs'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const withPWA = withPWAInit({
  dest: 'public',
  // Authenticated pages remain under Next/SWR cache control. The service
  // worker only retains immutable/static assets, never personalized screens.
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: dashboardRuntimeCaching,
  },
})

function normalizeBaseUrl(value, fallback) {
  const raw = (value ?? fallback).trim() || fallback
  return raw.replace(/\/+$/, '')
}

function normalizeBackendBaseUrl(value, fallback) {
  return normalizeBaseUrl(value, fallback).replace(/\/api$/i, '')
}

function backendRemotePattern() {
  const backendUrl = new URL(normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, 'http://localhost:8080'))
  return {
    protocol: backendUrl.protocol.replace(':', ''),
    hostname: backendUrl.hostname,
    ...(backendUrl.port ? { port: backendUrl.port } : {}),
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The development indicator portal overlaps the fixed mobile navigation and
  // can intercept taps. Compilation state is already visible in the terminal.
  devIndicators: false,
  images: {
    remotePatterns: [
      backendRemotePattern(),
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      // CDN subdomains (cdn.eventiapp.com.mx, cdn-staging.eventiapp.com.mx)
      { protocol: 'https', hostname: '**.eventiapp.com.mx' },
    ],
  },

  async headers() {
    // Include the backend API URL in connect-src so browser API calls are allowed.
    // In production this is set to https://api.eventiapp.com.mx via Vercel env vars.
    const backendUrl = normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, 'http://localhost:8080')
    const astroUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_ASTRO_URL, 'https://www.eventiapp.com.mx')

    // Cover all S3 URL patterns: single-level (s3.amazonaws.com), virtual-hosted
    // (bucket.s3.amazonaws.com), and regional (bucket.s3.us-east-1.amazonaws.com).
    // CSP wildcards only match ONE subdomain level, so we must list each pattern.
    const awsSources = [
      'https://*.amazonaws.com',
      'https://*.s3.amazonaws.com',
      'https://*.s3.us-east-1.amazonaws.com',
      'https://*.s3.us-east-2.amazonaws.com',
      'https://*.s3.us-west-2.amazonaws.com',
      'https://*.cloudfront.net',
      // CDN (cdn.eventiapp.com.mx, cdn-staging.eventiapp.com.mx)
      'https://*.eventiapp.com.mx',
    ].join(' ')

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${backendUrl} ${awsSources}`,
      `media-src 'self' blob: ${backendUrl} ${awsSources}`,
      "font-src 'self'",
      `connect-src 'self' ${backendUrl} ${awsSources}`,
      `frame-src 'self' ${astroUrl}`,
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          { key: 'Content-Security-Policy', value: csp },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

// Both plugins extend Webpack configuration. Applying their wrappers while
// running `next dev --turbopack` makes Next treat the project as partially
// Webpack-configured even though both features are disabled, which adds noise
// and avoidable setup work to the local compiler.
const analyzedConfig = process.env.ANALYZE === 'true' ? withBundleAnalyzer(nextConfig) : nextConfig
const configuredNextConfig = process.env.NODE_ENV === 'production' ? withPWA(analyzedConfig) : analyzedConfig

export default configuredNextConfig
