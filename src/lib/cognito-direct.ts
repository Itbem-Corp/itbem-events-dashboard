import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'

let client: CognitoIdentityProviderClient | null = null

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (!client) {
    client = new CognitoIdentityProviderClient({ region: process.env.COGNITO_AWS_REGION || 'us-east-1' })
  }
  return client
}

export function authRequestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false
  if (!origin) return process.env.NODE_ENV !== 'production'
  try {
    const originHost = new URL(origin).host.toLowerCase()
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
    const host = request.headers.get('host')?.trim().toLowerCase()
    const urlHost = new URL(request.url).host.toLowerCase()
    return [forwardedHost, host, urlHost].some((candidate) => candidate === originHost)
  } catch {
    return false
  }
}

