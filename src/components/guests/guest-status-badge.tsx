'use client'

import { Badge } from '@/components/badge'
import { normalizeGuestStatusCode } from '@/lib/guest-utils'
import type { GuestStatus } from '@/models/GuestStatus'

const STATUS_COLORS: Record<string, 'amber' | 'lime' | 'pink' | 'zinc'> = {
  PENDING: 'amber',
  CONFIRMED: 'lime',
  DECLINED: 'pink',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Declinado',
}

interface GuestStatusBadgeProps {
  status?: GuestStatus
  code?: string
}

export function GuestStatusBadge({ status, code }: GuestStatusBadgeProps) {
  const statusCode = normalizeGuestStatusCode(status?.code ?? code)
  const color = STATUS_COLORS[statusCode] ?? 'zinc'
  const label = status?.label ?? status?.name ?? STATUS_LABELS[statusCode] ?? statusCode

  return <Badge color={color}>{label}</Badge>
}
