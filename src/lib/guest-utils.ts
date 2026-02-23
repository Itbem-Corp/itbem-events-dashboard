import type { Guest } from '@/models/Guest'

/**
 * Returns the effective RSVP status for a guest, normalized to uppercase.
 * Priority: rsvp_status > status.code > 'PENDING'
 */
export function getEffectiveStatus(g: Guest): 'CONFIRMED' | 'DECLINED' | 'PENDING' {
  const raw = (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase()
  if (raw === 'CONFIRMED') return 'CONFIRMED'
  if (raw === 'DECLINED') return 'DECLINED'
  return 'PENDING'
}

/**
 * Exports an array of objects to a CSV file and triggers download.
 */
export function exportCSV(
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
