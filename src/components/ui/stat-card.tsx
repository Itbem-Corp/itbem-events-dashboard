import { Divider } from '@/components/divider'
import { Badge } from '@/components/badge'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
}

export function StatCard({ title, value, change }: StatCardProps) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString('es-MX') : value

  return (
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium sm:text-sm/6">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold tabular-nums sm:text-2xl/8">{formattedValue}</div>
      {change && (
        <div className="mt-3 text-sm/6 sm:text-xs/6">
          <Badge color={change.startsWith('+') ? 'lime' : 'pink'}>{change}</Badge>{' '}
          <span className="text-ink-muted">vs semana anterior</span>
        </div>
      )}
    </div>
  )
}
