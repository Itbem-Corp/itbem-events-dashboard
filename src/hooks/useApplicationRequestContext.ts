'use client'

import type { ApplicationRequestContext } from '@/lib/request-context'
import { tenantCodeForHostname } from '@/lib/tenant-config'
import type { TenantCode } from '@/products/core/product-manifest'
import { useStore } from '@/store/useStore'
import { useMemo } from 'react'

const TENANT_CODES = new Set<TenantCode>(['eventiapp', 'itbem', 'cafettonhouse'])

export function useApplicationRequestContext(): ApplicationRequestContext {
  const activeTenantCode = useStore((state) => state.activeTenantCode)
  const sessionCode = useStore((state) => state.applicationSession?.application.code)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const organizationId = useStore((state) => state.currentClient?.id ?? null)
  const hostnameTenant = typeof window === 'undefined' ? null : tenantCodeForHostname(window.location.hostname)
  const tenantCode = hostnameTenant ?? activeTenantCode ?? (TENANT_CODES.has(sessionCode as TenantCode) ? (sessionCode as TenantCode) : 'eventiapp')

  return useMemo(
    () => ({ tenantCode, workspaceMode, organizationId }),
    [organizationId, tenantCode, workspaceMode]
  )
}
