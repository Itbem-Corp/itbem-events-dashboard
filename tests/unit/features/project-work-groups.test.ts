import { groupProjectWork } from '@/features/automation/project-work-groups'
import type { DeliveryRequest, DeliveryWorkItem } from '@/features/automation/delivery-types'
import { describe, expect, it } from 'vitest'

const request = { id: 'request-1', title: 'Nueva experiencia', status: 'planned' } as DeliveryRequest
const task = (id: string, requestId?: string, state = 'planning') => ({
  id, request_id: requestId, state, updated_at: `2026-09-${id === 'task-2' ? '24' : '23'}T12:00:00Z`,
}) as DeliveryWorkItem

describe('groupProjectWork', () => {
  it('keeps linked tasks under their request and direct tasks loose', () => {
    const result = groupProjectWork([request], [task('task-1', request.id, 'released'), task('task-2', request.id), task('task-3')])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].tasks.map((item) => item.id)).toEqual(['task-2', 'task-1'])
    expect(result.groups[0].completed).toBe(1)
    expect(result.standalone.map((item) => item.id)).toEqual(['task-3'])
  })

  it('does not lose a task whose source request is unavailable', () => {
    expect(groupProjectWork([], [task('task-1', 'removed-request')]).standalone).toHaveLength(1)
  })
})
