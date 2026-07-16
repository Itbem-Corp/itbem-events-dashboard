import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

type Attempt = { count: number; resetAt: number }

const attempts = new Map<string, Attempt>()
const WINDOW_MS = 5 * 60 * 1000
const MAX_IDENTITY_ATTEMPTS = 7
const MAX_IP_ATTEMPTS = 25
const MAX_ENTRIES = 10_000

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 24)
}

function clientAddress(request: NextRequest): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  ).trim()
}

function consume(key: string, limit: number, now: number): number | null {
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return null
  }
  if (current.count >= limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  current.count += 1
  return null
}

function prune(now: number) {
  if (attempts.size < MAX_ENTRIES) return
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key)
  }
  if (attempts.size >= MAX_ENTRIES) {
    for (const key of attempts.keys()) {
      attempts.delete(key)
      if (attempts.size < MAX_ENTRIES / 2) break
    }
  }
}

// Best-effort BFF limiter. Cognito remains the distributed enforcement layer;
// this absorbs ordinary password spraying before it reaches Cognito.
export function consumeAuthAttempt(request: NextRequest, identity: string): number | null {
  const now = Date.now()
  prune(now)
  const address = digest(clientAddress(request))
  const ipRetry = consume(`ip:${address}`, MAX_IP_ATTEMPTS, now)
  const identityRetry = consume(
    `identity:${digest(identity.toLowerCase())}:${address}`,
    MAX_IDENTITY_ATTEMPTS,
    now
  )
  return Math.max(ipRetry ?? 0, identityRetry ?? 0) || null
}

export function clearAuthAttempts(request: NextRequest, identity: string) {
  attempts.delete(
    `identity:${digest(identity.toLowerCase())}:${digest(clientAddress(request))}`
  )
}
