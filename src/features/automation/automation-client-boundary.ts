import type { Client } from '@/models/Client'

/**
 * The shared client directory contains organizations owned by multiple
 * products. Automation is intentionally narrower: only the ITBEM product can
 * create an ITBEM delivery workspace. Keep the decision in one small helper
 * so forms, previews, and tests cannot drift from the server boundary.
 */
export function isAutomationClient(client: Pick<Client, 'code'>): boolean {
  return client.code.trim().toLowerCase() === 'itbem'
}

export function automationClientOption(client: Pick<Client, 'code'>): {
  selectable: boolean
  reason?: string
} {
  if (isAutomationClient(client)) return { selectable: true }
  return {
    selectable: false,
    reason: 'Producto protegido: esta organización no puede abrir automatizaciones ITBEM.',
  }
}
