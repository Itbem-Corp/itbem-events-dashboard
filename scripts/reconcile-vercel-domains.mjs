import { pathToFileURL } from 'node:url'

export function configuredDomains(value) {
  const domains = [...new Set((value ?? '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean))]
  if (domains.length === 0) throw new Error('VERCEL_PRODUCTION_DOMAINS must contain at least one domain')
  for (const domain of domains) {
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
      throw new Error(`Invalid production domain: ${domain}`)
    }
  }
  return domains
}

async function responseBody(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function requireVerified(domain, result) {
  if (result.verified !== true) {
    throw new Error(`${domain}: attached but DNS ownership is not verified`)
  }
}

/**
 * @param {{
 *   env?: Readonly<Record<string, string | undefined>>,
 *   fetchImpl?: typeof fetch,
 *   logger?: { log: (...args: unknown[]) => void }
 * }} options
 */
export async function reconcileDomains({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'VERCEL_PRODUCTION_DOMAINS']) {
    if (!env[name]) throw new Error(`${name} is required`)
  }

  const domains = configuredDomains(env.VERCEL_PRODUCTION_DOMAINS)
  const encodedProject = encodeURIComponent(env.VERCEL_PROJECT_ID)
  const query = `teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`
  const headers = {
    Authorization: `Bearer ${env.VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  }

  for (const domain of domains) {
    const encodedDomain = encodeURIComponent(domain)
    const existing = await fetchImpl(
      `https://api.vercel.com/v9/projects/${encodedProject}/domains/${encodedDomain}?${query}`,
      { headers },
    )

    if (existing.ok) {
      const current = await responseBody(existing)
      requireVerified(domain, current)
      logger.log(`${domain}: attached and verified`)
      continue
    }
    if (existing.status !== 404) {
      const failure = await responseBody(existing)
      throw new Error(`${domain}: lookup failed (${existing.status}) ${failure.error?.message ?? failure.message ?? ''}`.trim())
    }

    const added = await fetchImpl(`https://api.vercel.com/v10/projects/${encodedProject}/domains?${query}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: domain }),
    })
    const result = await responseBody(added)
    if (!added.ok) {
      throw new Error(`${domain}: attach failed (${added.status}) ${result.error?.message ?? result.message ?? ''}`.trim())
    }
    requireVerified(domain, result)
    logger.log(`${domain}: attached and verified`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await reconcileDomains()
}
