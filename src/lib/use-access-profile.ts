'use client'

import { createAccessProfile, type AccessProfile } from '@/lib/access-profile'
import { useProductShell } from '@/products/core/product-context'
import { useStore } from '@/store/useStore'
import { useMemo } from 'react'

/**
 * The access profile for the current workspace, with the active product's
 * shell policy applied. Every screen reads its profile through this hook so
 * the shell policy cannot be forgotten at a call site. Outside a
 * ProductProvider the shell is undefined and the profile is today's.
 */
export function useAccessProfile(): AccessProfile {
  const session = useStore((state) => state.applicationSession)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const organizationId = useStore((state) => state.currentClient?.id)
  const portfolioSelected = useStore((state) => state.workspacePortfolio)
  const shell = useProductShell()

  return useMemo(
    () =>
      createAccessProfile({
        session,
        requestedMode: workspaceMode,
        organizationId,
        portfolioSelected,
        shell,
      }),
    [organizationId, portfolioSelected, session, shell, workspaceMode]
  )
}
