# Production Bug Fixes — CSP + Domain + Moments Upload

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 production issues: wrong subdomain in QR/Studio URLs, cover image blocked by CSP, studio iframe blocked by CSP, and moments upload flow broken due to wrong domain in QR.

**Architecture:** All code changes are in `next.config.mjs` (CSP header policy). The domain issue requires a Vercel env var update (`NEXT_PUBLIC_ASTRO_URL`). No new files needed.

**Tech Stack:** Next.js 15, Tailwind, CSP headers via `next.config.mjs`

---

## Root Causes Summary

| Bug | Cause | Fix location |
|-----|-------|-------------|
| Wrong domain in QR + Studio URLs | `NEXT_PUBLIC_ASTRO_URL` in Vercel set to `https://eventiapp.com.mx` (no www) | Vercel env var (no code change) |
| Cover image not visible in event header | `img-src *.amazonaws.com` only matches 1 subdomain level; S3 URLs like `bucket.s3.us-east-1.amazonaws.com` are silently blocked | `next.config.mjs` |
| Studio iframe may be blocked | No `frame-src` directive → falls back to `default-src 'self'` → blocks external iframes | `next.config.mjs` |
| Moments upload QR broken | QR URL uses wrong domain (same root cause as #1) + `share_uploads_enabled` must be `true` | Vercel env var + dashboard toggle |

---

## Task 1: Fix CSP in next.config.mjs

**Files:**
- Modify: `next.config.mjs`

**Current broken CSP (relevant lines):**
```js
`img-src 'self' data: blob: https://*.amazonaws.com https://*.cloudfront.net`,
`connect-src 'self' ${backendUrl} https://*.amazonaws.com https://*.cloudfront.net`,
// frame-src: MISSING → falls back to default-src 'self' → blocks iframe
```

**Problem:** `*.amazonaws.com` matches only ONE subdomain level (e.g. `s3.amazonaws.com`) but NOT multi-level S3 hostnames:
- `bucket.s3.amazonaws.com` ❌ (2 levels)
- `bucket.s3.us-east-1.amazonaws.com` ❌ (3 levels)
- `d1234.cloudfront.net` ✅ (1 level — already works)

**Step 1: Update next.config.mjs**

Replace the `async headers()` section with this updated version:

```js
async headers() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080'
  const astroUrl = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'

  // AWS sources: cover all S3 URL patterns (path-style, virtual-hosted, regional)
  const awsSources = [
    'https://*.amazonaws.com',         // catch-all single-level (s3.amazonaws.com)
    'https://*.s3.amazonaws.com',      // bucket.s3.amazonaws.com
    'https://*.s3.us-east-1.amazonaws.com',
    'https://*.s3.us-west-2.amazonaws.com',
    'https://*.cloudfront.net',
  ].join(' ')

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${awsSources}`,
    "font-src 'self'",
    `connect-src 'self' ${backendUrl} ${awsSources}`,
    `frame-src 'self' ${astroUrl}`,   // allows Studio preview iframe
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
```

**Step 2: Build check**

```bash
npm run build
```
Expected: Zero TypeScript errors, build succeeds.

**Step 3: Verify CSP output locally**

```bash
npm run dev
# In browser DevTools → Network → any page response → check Content-Security-Policy header
# Should contain: img-src ... *.s3.amazonaws.com ... frame-src 'self' http://localhost:4321
```

**Step 4: Commit**

```bash
git add next.config.mjs
git commit -m "fix: expand CSP to allow S3 multi-level hostnames and studio iframe frame-src"
```

---

## Task 2: Vercel environment variable (manual step — no code)

**This is NOT a code change. Must be done in the Vercel dashboard.**

1. Go to Vercel → Project → Settings → Environment Variables
2. Find `NEXT_PUBLIC_ASTRO_URL`
3. Change value from `https://eventiapp.com.mx` → `https://www.eventiapp.com.mx`
4. Also verify `NEXT_PUBLIC_BACKEND_URL` is `https://api.eventiapp.com.mx` (or whatever the production backend URL is)
5. Redeploy (or trigger from GitHub push)

**Why this fixes multiple issues at once:**
- QR codes in moments-wall → correct www domain
- Studio preview URL bar + published URL copy → correct www domain
- Share panel QR → correct www domain
- RSVP WhatsApp links → correct www domain
- Invitation tracker links → correct www domain
- Moments upload QR URL → correct www domain

---

## Task 3: Verify moments upload toggle (manual check)

The moments upload page (`/events/:identifier/upload`) only works when the event has `share_uploads_enabled: true`.

1. Open an event in the dashboard → Momentos tab
2. Check that the "Subida QR activa" toggle is enabled (blue/indigo)
3. If it's gray → click "Habilitar subida QR" to enable it
4. The QR code in the modal will now point to the correct upload URL (after Vercel env var fix)

---

## Verification Checklist (after deploy)

- [ ] Cover image loads in event header banner
- [ ] Studio iframe loads the public frontend preview
- [ ] QR code in Momentos tab shows `www.eventiapp.com.mx` in the URL
- [ ] Studio URL bar shows `www.eventiapp.com.mx`
- [ ] Share panel QR shows `www.eventiapp.com.mx`
- [ ] Scanning the moments QR takes guests to the upload page
- [ ] Guests can upload photos/videos on the upload page
- [ ] `npm run build` passes with zero errors
