import type { DeliveryRequest, DeliveryWorkItem } from './delivery-types'

export type ProjectWorkGroup = {
  request: DeliveryRequest
  tasks: DeliveryWorkItem[]
  completed: number
}

/** A request is an optional parent for several bounded tasks; direct tasks stay loose. */
export function groupProjectWork(requests: DeliveryRequest[], tasks: DeliveryWorkItem[]) {
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const grouped = new Map<string, DeliveryWorkItem[]>()
  const standalone: DeliveryWorkItem[] = []
  for (const task of tasks) {
    const requestId = task.request_id
    if (!requestId || !requestById.has(requestId)) {
      standalone.push(task)
      continue
    }
    grouped.set(requestId, [...(grouped.get(requestId) ?? []), task])
  }
  const mostRecentFirst = (left: DeliveryWorkItem, right: DeliveryWorkItem) =>
    new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  const groups: ProjectWorkGroup[] = requests
    .filter((request) => grouped.has(request.id))
    .map((request) => {
      const groupTasks = [...(grouped.get(request.id) ?? [])].sort(mostRecentFirst)
      return { request, tasks: groupTasks, completed: groupTasks.filter((task) => task.state === 'released').length }
    })
    .sort((left, right) => new Date(right.tasks[0].updated_at).getTime() - new Date(left.tasks[0].updated_at).getTime())
  return { groups, standalone: standalone.sort(mostRecentFirst) }
}
