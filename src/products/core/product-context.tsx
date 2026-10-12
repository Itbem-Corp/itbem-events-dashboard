'use client'

import type { ProductManifest, ProductShellPolicy } from '@/products/core/product-manifest'
import { createContext, useContext, type ReactNode } from 'react'

const ProductContext = createContext<ProductManifest | undefined>(undefined)

/**
 * Makes the active product manifest available to shell components. It is
 * mounted once by the authenticated layout (AppLayoutClient), which already
 * resolves the product from the hostname on the server.
 */
export function ProductProvider({ product, children }: { product: ProductManifest; children: ReactNode }) {
  return <ProductContext.Provider value={product}>{children}</ProductContext.Provider>
}

/** The active product, or undefined outside the provider (today's behaviour). */
export function useProductManifest(): ProductManifest | undefined {
  return useContext(ProductContext)
}

/** Shortcut for the optional shell policy; undefined means today's behaviour. */
export function useProductShell(): ProductShellPolicy | undefined {
  return useContext(ProductContext)?.shell
}
