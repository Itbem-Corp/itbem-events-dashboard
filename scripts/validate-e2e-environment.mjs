import { pathToFileURL } from 'node:url'

export const requiredE2EEnvironmentKeys = [
  'E2E_BACKEND_URL',
  'PRODUCTION_BACKEND_URL',
  'COGNITO_AWS_REGION',
  'COGNITO_USER_POOL_ID',
  'COGNITO_EVENTIAPP_CLIENT_ID',
  'COGNITO_DOMAIN',
  'TEST_EMAIL',
  'TEST_PASSWORD',
]

function requiredValue(env, name) {
  const value = env[name]?.trim() ?? ''
  if (!value) throw new Error(`Missing required E2E configuration: ${name}`)
  return value
}

function normalizedHTTPSOrigin(value, name) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials, query, or fragment`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** @param {Readonly<Record<string, string | undefined>>} env */
export function validateE2EEnvironment(env = process.env) {
  for (const name of requiredE2EEnvironmentKeys) requiredValue(env, name)

  const e2eBackend = normalizedHTTPSOrigin(env.E2E_BACKEND_URL, 'E2E_BACKEND_URL')
  const productionBackend = normalizedHTTPSOrigin(env.PRODUCTION_BACKEND_URL, 'PRODUCTION_BACKEND_URL')
  if (e2eBackend.toLowerCase() === productionBackend.toLowerCase()) {
    throw new Error('E2E_BACKEND_URL must target an isolated non-production backend')
  }

  return { e2eBackend, productionBackend }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateE2EEnvironment()
  console.log('Authenticated E2E configuration is isolated from production')
}
