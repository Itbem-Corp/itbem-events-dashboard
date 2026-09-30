import type { DeliveryWorkItem } from './delivery-types'

type Snapshots = DeliveryWorkItem['context_snapshots']

/** A task's frozen sources cannot be silently replaced with the project's newer map. */
export function frozenRepositoryTopologyIssue(snapshots: Snapshots): string | null {
  if (!snapshots?.length) return null
  const repositories = snapshots.filter((source) => source.kind === 'repository')
  if (repositories.length <= 1) return null
  const primaryCount = repositories.filter((source) => source.metadata?.repository_role === 'primary').length
  if (primaryCount === 1) return null
  if (primaryCount > 1) return `Esta tarea congeló ${primaryCount} repositorios principales. Para planificar varios repositorios debe haber sólo uno.`
  return 'Esta tarea congeló varios repositorios sin uno principal. Elige un repositorio principal para el nuevo encargo.'
}
