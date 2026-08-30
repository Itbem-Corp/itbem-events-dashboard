import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

type BridgeContext = {
  params: Promise<{ path: string[] }>
}

const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'idempotency-key',
  'if-none-match',
  'last-event-id',
  'x-application-code',
  'x-organization-context',
  'x-organization-id',
  'x-workspace-mode',
] as const

const RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-type',
  'etag',
  'last-event-id',
  'last-modified',
  'retry-after',
] as const

function apiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:8080'
  return `${configured.replace(/\/+$/, '').replace(/\/api$/i, '')}/api`
}

function forwardedHeaders(request: NextRequest) {
  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

function responseHeaders(upstream: Response) {
  const headers = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

async function proxy(request: NextRequest, context: BridgeContext) {
  const { path } = await context.params
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/')
  const target = new URL(`${apiBaseUrl()}/${encodedPath}`)
  target.search = request.nextUrl.search

  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: forwardedHeaders(request),
      body,
      cache: 'no-store',
      redirect: 'manual',
      ...(body ? { duplex: 'half' } : {}),
    })
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    })
  } catch {
    return Response.json(
      { status: 502, message: 'La puerta local de automatización no está disponible.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
