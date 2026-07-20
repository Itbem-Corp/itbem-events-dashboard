'use client'

import { issueOrganizationContext } from '@/features/workspace/issue-organization-context'
import { useStore } from '@/store/useStore'
import { useEffect } from 'react'

const RENEW_EARLY_MS = 45_000
const RETRY_DELAY_MS = 30_000

export function organizationContextRefreshDelay(expiresAt: string | null | undefined, now = Date.now()): number {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN
  if (!Number.isFinite(expiry)) return 0
  return Math.max(expiry - now - RENEW_EARLY_MS, 0)
}

export function useOrganizationContextRenewal() {
  const applicationSession = useStore((state) => state.applicationSession)
  const organizationId = useStore((state) => state.currentClient?.id ?? null)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const expiresAt = useStore((state) => state.organizationContext?.expiresAt)
  const setCredential = useStore((state) => state.setOrganizationContextCredential)

  useEffect(() => {
    if (!applicationSession || workspaceMode !== 'organization' || !organizationId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const renew = () => {
      void issueOrganizationContext(organizationId)
        .then((credential) => {
          if (!cancelled) setCredential(credential)
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(renew, RETRY_DELAY_MS)
        })
    }

    const delay = organizationContextRefreshDelay(expiresAt)
    if (delay === 0) renew()
    else timer = setTimeout(renew, delay)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [applicationSession, expiresAt, organizationId, setCredential, workspaceMode])
}
