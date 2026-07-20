import { productSupportsFeature, productSupportsPath } from '@/products/core/product-manifest'
import { assertProductManifestContract } from '@/products/core/product-contract'
import { getProductManifest } from '@/products/registry'
import { describe, expect, it } from 'vitest'

describe('product manifests', () => {
  it('keeps event operations exclusive to EventiApp', () => {
    expect(productSupportsFeature(getProductManifest('eventiapp'), 'events')).toBe(true)
    expect(productSupportsFeature(getProductManifest('itbem'), 'events')).toBe(false)
    expect(productSupportsFeature(getProductManifest('cafettonhouse'), 'events')).toBe(false)
  })

  it('blocks event routes for products that do not own that module', () => {
    expect(productSupportsPath(getProductManifest('eventiapp'), '/events/wedding-1/guests')).toBe(true)
    expect(productSupportsPath(getProductManifest('itbem'), '/events')).toBe(false)
    expect(productSupportsPath(getProductManifest('cafettonhouse'), '/events/wedding-1')).toBe(false)
  })

  it('keeps shared organization features available only where declared', () => {
    expect(productSupportsPath(getProductManifest('itbem'), '/clients')).toBe(true)
    expect(productSupportsPath(getProductManifest('cafettonhouse'), '/users')).toBe(true)
    expect(productSupportsPath(getProductManifest('eventiapp'), '/clients')).toBe(false)
  })

  it('uses each manifest as the backend module source of truth', () => {
    expect(getProductManifest('eventiapp').backendModules).toEqual(['home', 'events', 'metrics'])
    expect(getProductManifest('itbem').backendModules).toEqual(['home', 'users', 'organizations', 'metrics'])
    expect(getProductManifest('cafettonhouse').backendModules).toEqual(['home', 'users', 'organizations', 'metrics'])
  })

  it('keeps brand and deployment settings inside each product boundary', () => {
    const eventiapp = getProductManifest('eventiapp')
    const itbem = getProductManifest('itbem')

    expect(eventiapp.identity.name).toBe('EventiApp')
    expect(eventiapp.deployment.apiHostname).toBe('api.eventiapp.com.mx')
    expect(itbem.identity.accent).toBe('#22d3ee')
    expect(itbem.deployment.clientIdEnv).toBe('COGNITO_ITBEM_CLIENT_ID')
  })

  it('rejects a deployment contract that would merge product entry points', () => {
    const manifests = structuredClone({
      eventiapp: getProductManifest('eventiapp'),
      itbem: getProductManifest('itbem'),
      cafettonhouse: getProductManifest('cafettonhouse'),
    })
    manifests.itbem.deployment.hostname = manifests.eventiapp.deployment.hostname
    manifests.itbem.deployment.hostnames = [manifests.eventiapp.deployment.hostname]

    expect(() => assertProductManifestContract(manifests)).toThrow(/belongs to more than one product/)
  })
})
