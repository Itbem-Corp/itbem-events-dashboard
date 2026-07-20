import catalog from '@/products/catalog.json'

import type { ProductManifest, TenantCode } from '@/products/core/product-manifest'

export type ProductCatalogEntry = Pick<ProductManifest, 'identity' | 'deployment'>

/**
 * Deployment identity is intentionally data-only so runtime presentation,
 * production smoke checks, and tenant security policies can share one contract.
 */
export const PRODUCT_CATALOG = catalog as Record<TenantCode, ProductCatalogEntry>

export function productCatalogEntry(code: TenantCode): ProductCatalogEntry {
  return PRODUCT_CATALOG[code]
}
