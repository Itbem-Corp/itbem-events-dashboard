import { productSupportsFeature, productSupportsPath } from '@/products/core/product-manifest'
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
})
