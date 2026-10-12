import bundleAnalyzer from '@next/bundle-analyzer'
import withPWAInit from '@ducanh2912/next-pwa'
import { fileURLToPath } from 'node:url'
import { dashboardRuntimeCaching } from './src/lib/pwa-runtime-caching.mjs'
import { buildImageRemotePatterns } from './src/lib/image-remote-hosts.mjs'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep tracing scoped to this checkout. Without an explicit root, Next can
  // select a sibling worktree's lockfile and produce non-reproducible traces.
  outputFileTracingRoot: projectRoot,
  // Allows CI/validation builds to coexist with a local `next dev` process on
  // Windows, where the development trace keeps the default .next directory locked.
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  // The development indicator portal overlaps the fixed mobile navigation and
  // can intercept taps. Compilation state is already visible in the terminal.
  devIndicators: false,
  // Repository-owned agent guidance is reviewed source. Do not let `next dev`
  // append generated instructions and leave an otherwise clean worktree dirty.
  agentRules: false,
  images: {
    // Backend origin + production media hosts, plus NEXT_PUBLIC_IMAGE_REMOTE_HOSTS
    // (e.g. the local S3 emulator). <SafeImage> reads the same list and renders
    // any other host unoptimized instead of crashing.
    remotePatterns: buildImageRemotePatterns({
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
      extraHosts: process.env.NEXT_PUBLIC_IMAGE_REMOTE_HOSTS,
    }),
  },

  // The retired orders module answers with a permanent redirect so old
  // bookmarks land on the events list instead of a 404.
  async redirects() {
    return [
      { source: '/orders', destination: '/events', permanent: true },
      { source: '/orders/:path*', destination: '/events', permanent: true },
    ]
  },

  async headers() {
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
