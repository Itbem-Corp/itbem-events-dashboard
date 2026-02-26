import bundleAnalyzer from '@next/bundle-analyzer'
import withPWAInit from '@ducanh2912/next-pwa'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      // CDN subdomains (cdn.eventiapp.com.mx, cdn-staging.eventiapp.com.mx)
      { protocol: 'https', hostname: '**.eventiapp.com.mx' },
    ],
  },

  async headers() {
    // Include the backend API URL in connect-src so browser API calls are allowed.
    // In production this is set to https://api.eventiapp.com.mx via Vercel env vars.
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080'
    const astroUrl = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'

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
      `img-src 'self' data: blob: ${awsSources}`,
      `media-src 'self' blob: ${awsSources}`,
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
            value: 'camera=(), microphone=(), geolocation=()',
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

export default withPWA(withBundleAnalyzer(nextConfig))
