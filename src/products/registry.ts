import { cafettonHouseManifest } from '@/products/cafettonhouse/manifest'
import { assertProductManifestContract } from '@/products/core/product-contract'
import type { ProductManifest, TenantCode } from '@/products/core/product-manifest'
import { eventiAppManifest } from '@/products/eventiapp/manifest'
import { itbemManifest } from '@/products/itbem/manifest'

export const PRODUCT_MANIFESTS = {
  eventiapp: eventiAppManifest,
  itbem: itbemManifest,
  cafettonhouse: cafettonHouseManifest,
} as const satisfies Record<TenantCode, ProductManifest>

assertProductManifestContract(PRODUCT_MANIFESTS)

export function getProductManifest(code: TenantCode): ProductManifest {
  return PRODUCT_MANIFESTS[code]
}
