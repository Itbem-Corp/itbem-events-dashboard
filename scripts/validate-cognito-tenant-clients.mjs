import { pathToFileURL } from 'node:url'

export const tenantClientEnvironmentKeys = [
  'COGNITO_EVENTIAPP_CLIENT_ID',
  'COGNITO_ITBEM_CLIENT_ID',
  'COGNITO_CAFETTONHOUSE_CLIENT_ID',
]

/** @param {Readonly<Record<string, string | undefined>>} env */
export function validateTenantClientIds(env = process.env) {
  const values = tenantClientEnvironmentKeys.map(name => {
    const value = env[name]?.trim() ?? ''
    if (!/^[a-z0-9]{26}$/.test(value)) {
      throw new Error(`${name} must be a valid Cognito app client ID`)
    }
    return value
  })
  if (new Set(values).size !== values.length) {
    throw new Error('Each tenant must use a distinct Cognito app client')
  }
  return Object.fromEntries(tenantClientEnvironmentKeys.map((name, index) => [name, values[index]]))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateTenantClientIds()
  console.log('Tenant Cognito client IDs are valid and distinct')
}
