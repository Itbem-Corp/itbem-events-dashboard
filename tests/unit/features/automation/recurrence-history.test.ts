import {
  parseRecurrenceEventPage,
  parseRecurrenceOccurrencePage,
  recurrenceScheduleEventsPath,
  recurrenceScheduleOccurrencesPath,
} from '@/features/automation/recurrence-schedules'
import { describe, expect, it } from 'vitest'

const scheduleID = '123e4567-e89b-42d3-a456-426614174000'
const workItemID = '123e4567-e89b-42d3-a456-426614174001'
const baseOccurrence = {
  id: '123e4567-e89b-42d3-a456-426614174002',
  schedule_id: scheduleID,
  schedule_revision: 3,
  occurrence_key: 'a'.repeat(64),
  scheduled_for: '2026-09-28T15:00:00Z',
  local_occurrence: '2026-09-28T09:00',
  time_zone: 'America/Mexico_City',
  status: 'materialized',
  work_item_id: workItemID,
  failure_code: null,
  created_at: '2026-09-28T15:00:01Z',
  materialized_at: '2026-09-28T15:00:02Z',
}

describe('recurrence occurrence and event history contract', () => {
  it('builds schedule-scoped endpoints with bounded limit/offset pagination', () => {
    expect(recurrenceScheduleOccurrencesPath('project/a', scheduleID, { limit: 50, offset: 100 })).toBe(
      `/automation/projects/project%2Fa/schedules/${scheduleID}/occurrences?limit=50&offset=100`,
    )
    expect(recurrenceScheduleEventsPath('project-1', scheduleID)).toBe(
      `/automation/projects/project-1/schedules/${scheduleID}/events?limit=25&offset=0`,
    )
    expect(() => recurrenceScheduleOccurrencesPath('project-1', scheduleID, { limit: 101 })).toThrow('limit')
    expect(() => recurrenceScheduleEventsPath('project-1', scheduleID, { offset: 10_001 })).toThrow('offset')
  })

  it('parses only allow-listed occurrence data and preserves server pagination', () => {
    const page = parseRecurrenceOccurrencePage({
      status: 200,
      message: 'ok',
      data: { items: [baseOccurrence], limit: 1, offset: 0, next_offset: 1 },
    }, scheduleID)

    expect(page.items[0]).toMatchObject({
      id: baseOccurrence.id,
      schedule_id: scheduleID,
      status: 'materialized',
      work_item_id: workItemID,
    })
    expect(page.items[0]).not.toHaveProperty('occurrence_key')
    expect(page).toMatchObject({ limit: 1, offset: 0, next_offset: 1 })
    expect(() => parseRecurrenceOccurrencePage({ items: [baseOccurrence], limit: 1, offset: 1 }, scheduleID, { limit: 1, offset: 0 })).toThrow('requested pagination')
    expect(() => parseRecurrenceOccurrencePage({ items: [{ ...baseOccurrence, schedule_id: workItemID }], limit: 1, offset: 0 }, scheduleID)).toThrow('scope mismatch')
  })

  it('rejects invalid pagination and inconsistent materialization fields', () => {
    expect(() => parseRecurrenceOccurrencePage({ items: [baseOccurrence], limit: 2, offset: 0, next_offset: 2 }, scheduleID)).toThrow('pagination')
    expect(() => parseRecurrenceOccurrencePage({ items: [{ ...baseOccurrence, work_item_id: null }], limit: 1, offset: 0 }, scheduleID)).toThrow('materialized')
  })

  it('drops raw actor_subject and unrelated event fields from the parsed API identity', () => {
    const rawEvent = {
      id: '123e4567-e89b-42d3-a456-426614174003',
      schedule_id: scheduleID,
      occurrence_id: null,
      work_item_id: workItemID,
      event_type: 'occurrence_materialized',
      occurred_at: '2026-09-28T15:00:02Z',
      actor_subject: 'private-subject-claim',
      arbitrary_provider_detail: 'must not escape the parser',
    }
    const page = parseRecurrenceEventPage({ items: [rawEvent], limit: 25, offset: 0 }, scheduleID)

    expect(page.items[0]).toMatchObject({ event_type: 'occurrence_materialized', work_item_id: workItemID })
    expect(JSON.stringify(page)).not.toContain('private-subject-claim')
    expect(JSON.stringify(page)).not.toContain('arbitrary_provider_detail')
  })
})
