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
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

