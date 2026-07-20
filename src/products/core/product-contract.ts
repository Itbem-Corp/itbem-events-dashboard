import type { ProductFeature, ProductManifest, TenantCode } from '@/products/core/product-manifest'

type ProductManifestRegistry = Readonly<Record<TenantCode, ProductManifest>>

const PRODUCT_CODES: readonly TenantCode[] = ['eventiapp', 'itbem', 'cafettonhouse']
const MODULE_FEATURES = new Set<ProductFeature>(['home', 'events', 'users', 'organizations', 'metrics'])

/**
 * Fails fast when a new product definition is internally inconsistent. This
 * protects the hostname -> Cognito -> API -> product-surface contract before a
 * deployment can make an incomplete tenant publicly reachable.
 */
export function assertProductManifestContract(manifests: ProductManifestRegistry): void {
  const hostnames = new Set<string>()
  const localHostnames = new Set<string>()
  const apiHostnames = new Set<string>()

  for (const code of PRODUCT_CODES) {
    const manifest = manifests[code]
    if (!manifest) throw new Error(`Missing product manifest for ${code}`)
    if (manifest.code !== code) throw new Error(`Product registry key ${code} does not match manifest code ${manifest.code}`)
    if (!manifest.identity.name || !manifest.identity.productLabel || !manifest.identity.accent) {
      throw new Error(`${code} must define complete product identity`)
    }
    if (!manifest.deployment.hostname || !manifest.deployment.apiHostname || !manifest.deployment.clientIdEnv) {
      throw new Error(`${code} must define a hostname, API hostname, and Cognito client environment key`)
    }
    if (!manifest.deployment.hostnames.includes(manifest.deployment.hostname)) {
      throw new Error(`${code} primary hostname must be listed in hostnames`)
    }
    if (manifest.deployment.organizationCode !== code) {
      throw new Error(`${code} must use its own organization code`)
    }

    for (const hostname of manifest.deployment.hostnames) {
      if (hostnames.has(hostname)) throw new Error(`Production hostname ${hostname} belongs to more than one product`)
      hostnames.add(hostname)
    }
    for (const hostname of manifest.deployment.localHostnames) {
      if (localHostnames.has(hostname)) throw new Error(`Local hostname ${hostname} belongs to more than one product`)
      localHostnames.add(hostname)
    }
    if (apiHostnames.has(manifest.deployment.apiHostname)) {
      throw new Error(`API hostname ${manifest.deployment.apiHostname} belongs to more than one product`)
    }
    apiHostnames.add(manifest.deployment.apiHostname)

    if (!manifest.features.includes('home') || !manifest.backendModules.includes('home')) {
      throw new Error(`${code} must include the home module`)
    }
    for (const moduleName of manifest.backendModules) {
      if (MODULE_FEATURES.has(moduleName) && !manifest.features.includes(moduleName)) {
        throw new Error(`${code} backend module ${moduleName} must have a matching product feature`)
      }
    }
    for (const route of manifest.routes) {
      if (!route.path.startsWith('/')) throw new Error(`${code} route ${route.path} must be absolute`)
      if (!manifest.features.includes(route.feature)) {
        throw new Error(`${code} route ${route.path} requires missing feature ${route.feature}`)
      }
    }

    // Event operations is a deliberately exclusive workflow. New products may
    // share platform capabilities, but they must not accidentally expose the
    // EventiApp surface merely by receiving a broad backend capability.
    if (code !== 'eventiapp' && (manifest.features.includes('events') || manifest.backendModules.includes('events'))) {
      throw new Error(`${code} cannot expose the EventiApp event module`)
    }
  }
}
