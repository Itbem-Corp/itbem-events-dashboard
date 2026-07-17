import type { TenantCode } from '@/lib/tenant-config'
import { cafettonHouseManifest } from '@/products/cafettonhouse/manifest'
import type { ProductManifest } from '@/products/core/product-manifest'
import { eventiAppManifest } from '@/products/eventiapp/manifest'
import { itbemManifest } from '@/products/itbem/manifest'

export const PRODUCT_MANIFESTS = {
  eventiapp: eventiAppManifest,
  itbem: itbemManifest,
  cafettonhouse: cafettonHouseManifest,
} as const satisfies Record<TenantCode, ProductManifest>

export function getProductManifest(code: TenantCode): ProductManifest {
  return PRODUCT_MANIFESTS[code]
}
