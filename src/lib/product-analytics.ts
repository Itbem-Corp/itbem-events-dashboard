'use client'

import { track } from '@vercel/analytics'

export const PRODUCT_FUNNEL_SCHEMA_VERSION = 1

export type SeededDesignTemplate = 'editorial-romance' | 'contemporary-night' | 'warm-celebration'

export interface ProductFunnelProperties {
  event_created: {
    has_capacity: boolean
    has_organizer: boolean
  }
  event_published: {
    trigger: 'active_toggle'
  }
  event_unpublished: {
    trigger: 'active_toggle'
  }
  design_saved: {
    template_kind: SeededDesignTemplate | 'custom'
    palette_override: boolean
    font_override: boolean
  }
  invitation_handoff: {
    channel: 'resend' | 'whatsapp'
  }
  checkin_completed: {
    method: 'manual' | 'qr'
  }
}

export type ProductFunnelEvent = keyof ProductFunnelProperties

type AnalyticsValue = string | number | boolean
type AnalyticsProperties = Record<string, AnalyticsValue>

const EVENT_PROPERTY_ALLOWLIST: {
  [Event in ProductFunnelEvent]: readonly (keyof ProductFunnelProperties[Event])[]
} = {
  event_created: ['has_capacity', 'has_organizer'],
  event_published: ['trigger'],
  event_unpublished: ['trigger'],
  design_saved: ['template_kind', 'palette_override', 'font_override'],
  invitation_handoff: ['channel'],
  checkin_completed: ['method'],
}

const ENUM_VALUES: Partial<Record<ProductFunnelEvent, Record<string, readonly string[]>>> = {
  event_published: { trigger: ['active_toggle'] },
  event_unpublished: { trigger: ['active_toggle'] },
  design_saved: {
    template_kind: ['editorial-romance', 'contemporary-night', 'warm-celebration', 'custom'],
  },
  invitation_handoff: { channel: ['resend', 'whatsapp'] },
  checkin_completed: { method: ['manual', 'qr'] },
}

/**
 * Builds the provider payload from a per-event allowlist. The typed call sites
 * prevent accidental drift, while this runtime boundary drops extra fields
 * even if an untyped caller tries to pass a token, URL, name, or identifier.
 */
export function buildProductAnalyticsProperties<Event extends ProductFunnelEvent>(
  event: Event,
  properties: ProductFunnelProperties[Event]
): AnalyticsProperties {
  const source = properties as Record<string, unknown>
  const safe: AnalyticsProperties = {
    schema_version: PRODUCT_FUNNEL_SCHEMA_VERSION,
    surface: 'dashboard',
  }

  for (const key of EVENT_PROPERTY_ALLOWLIST[event] as readonly string[]) {
    const value = source[key]
    if (typeof value === 'boolean') {
      safe[key] = value
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value
      continue
    }
    if (typeof value !== 'string') continue

    const allowedValues = ENUM_VALUES[event]?.[key]
    if (allowedValues?.includes(value)) safe[key] = value
  }

  return safe
}

// Product analytics is best-effort: telemetry must never block a customer action.
export function trackProductEvent<Event extends ProductFunnelEvent>(
  event: Event,
  properties: ProductFunnelProperties[Event]
): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') return
  try {
    track(event, buildProductAnalyticsProperties(event, properties))
  } catch {
    // Analytics is non-critical and intentionally silent.
  }
}
