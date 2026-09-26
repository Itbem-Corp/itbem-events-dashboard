import {
  parseCreatedRecurrenceSchedule,
  parseRecurrenceSchedule,
  parseRecurrenceSchedulePage,
  recurrenceFrequencyLabel,
  recurrenceScheduleActionPath,
  recurrenceSchedulesCollectionPath,
  recurrenceSchedulesPath,
  type RecurrenceRule,
} from '@/features/automation/recurrence-schedules'
import { describe, expect, it } from 'vitest'

const schedule = {
  id: 'schedule-1',
  project_id: 'project-1',
  name: 'Revisión semanal',
  status: 'active',
  template: {
    title: 'Revisar dependencias',
    description: 'Preparar una revisión con evidencia.',
    expected_outcome: 'Una propuesta en Planeación.',
    context_source_ids: ['source-1'],
    primary_repository_source_id: 'source-1',
    included_scope: ['Dependencias directas'],
    excluded_scope: ['No publicar'],
    acceptance_criteria: ['La lista queda documentada'],
    budget_microusd: 50_000,
    budget_alert_percent: 80,
    max_concurrency: 1,
  },
  recurrence: {
    frequency: 'weekly',
    interval: 1,
    weekdays: ['mon', 'wed'],
    local_time: '09:00',
    time_zone: 'America/Mexico_City',
    starts_on: '2026-09-28',
    misfire_policy: 'coalesce',
  },
  next_run_at: '2026-09-28T15:00:00Z',
  next_run_local: '2026-09-28T09:00:00-06:00',
  last_run_at: null,
  revision: 2,
  created_at: '2026-09-25T12:00:00Z',
  updated_at: '2026-09-25T12:00:00Z',
  secret_blob: 'must not be retained',
}

describe('recurrence schedule contract', () => {
  it('parses the API entity while retaining only allow-listed schedule fields', () => {
    const parsed = parseRecurrenceSchedule(schedule, 'project-1')
    expect(parsed.status).toBe('active')
    expect(parsed.template.context_source_ids).toEqual(['source-1'])
    expect(parsed.recurrence.weekdays).toEqual(['mon', 'wed'])
    expect(JSON.stringify(parsed)).not.toContain('secret_blob')
    expect(JSON.stringify(parsed)).not.toContain('must not be retained')
  })

  it('reads the enveloped page and created entity and keeps the project scope', () => {
    expect(parseRecurrenceSchedulePage({ status: 200, message: 'ok', data: { items: [schedule], limit: 25, offset: 0, next_offset: 25 } }, 'project-1')).toEqual({
      items: [parseRecurrenceSchedule(schedule, 'project-1')],
      limit: 25,
      offset: 0,
      next_offset: 25,
    })
    expect(parseCreatedRecurrenceSchedule({ status: 201, message: 'created', data: { schedule } }, 'project-1').id).toBe('schedule-1')
    expect(() => parseRecurrenceSchedulePage({ status: 200, message: 'ok', data: { items: [schedule], limit: 25, offset: 0 } }, 'project-2')).toThrow('scope mismatch')
  })

  it('rejects malformed recurrence rules instead of fabricating UI state', () => {
    const malformed = { ...schedule, recurrence: { ...schedule.recurrence, misfire_policy: 'skip' } }
    expect(() => parseRecurrenceSchedule(malformed)).toThrow('misfire_policy')
  })

  it('builds project-scoped, cursor-paginated endpoints', () => {
    expect(recurrenceSchedulesCollectionPath('project/one')).toBe('/automation/projects/project%2Fone/schedules')
    expect(recurrenceSchedulesPath('project-1', 125)).toBe('/automation/projects/project-1/schedules?limit=25&offset=125')
    expect(recurrenceSchedulesPath('project-1')).toBe('/automation/projects/project-1/schedules?limit=25&offset=0')
    expect(recurrenceScheduleActionPath('project-1', 'schedule-1', 'pause')).toBe('/automation/projects/project-1/schedules/schedule-1/pause')
    expect(recurrenceScheduleActionPath('project-1', 'schedule-1', 'resume')).toBe('/automation/projects/project-1/schedules/schedule-1/resume')
  })

  it('summarizes the configured weekly cadence', () => {
    expect(recurrenceFrequencyLabel({
      frequency: 'weekly', interval: 2, weekdays: ['mon', 'fri'], local_time: '09:00', time_zone: 'UTC', starts_on: '2026-09-28', misfire_policy: 'coalesce',
    })).toBe('Semanal cada 2 · lun., vie.')
  })

  it('requires a valid month day and formats monthly cadence', () => {
    const monthlyRule: RecurrenceRule = {
      frequency: 'monthly', interval: 1, month_day: 15, local_time: '09:00', time_zone: 'UTC', starts_on: '2026-09-28', misfire_policy: 'coalesce',
    }
    const monthly = {
      ...schedule,
      recurrence: monthlyRule,
    }
    expect(recurrenceFrequencyLabel(monthlyRule)).toBe('Mensual · día 15')
    expect(() => parseRecurrenceSchedule({ ...monthly, recurrence: { ...monthly.recurrence, month_day: 32 } })).toThrow('month_day')
  })
})
