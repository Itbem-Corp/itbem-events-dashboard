import {
  deliveryPlanStepsPath,
  parseDeliveryPlanSteps,
  type DeliveryPlanStepsSnapshot,
} from '@/features/automation/delivery-plan-steps'
import { describe, expect, it } from 'vitest'

const snapshot: DeliveryPlanStepsSnapshot = {
  plan_id: 'plan-1',
  plan_version: 3,
  items: [
    {
      id: 'step-1',
      plan_id: 'plan-1',
      plan_version: 3,
      step_key: 'prepare',
      order: 0,
      title: 'Preparar contexto',
      objective: 'Validar las fuentes de trabajo.',
      acceptance_criteria: ['El contexto está congelado.'],
      depends_on: [],
      status: 'ready',
      started_at: '2026-09-23T15:00:00Z',
      created_at: '2026-09-23T14:00:00Z',
      updated_at: '2026-09-23T15:00:00Z',
    },
  ],
  total: 1,
}

describe('delivery plan steps contract', () => {
  it('builds the read-only endpoint path with an encoded plan id', () => {
    expect(deliveryPlanStepsPath('plan/one')).toBe('/automation/plans/plan%2Fone/steps')
  })

  it('accepts the canonical snapshot and its expected plan version', () => {
    expect(parseDeliveryPlanSteps(snapshot, { planId: 'plan-1', planVersion: 3 })).toEqual(snapshot)
  })

  it('accepts bounded evidence requirements while retaining legacy plans without the field', () => {
    const withRequirement = {
      ...snapshot,
      items: [
        {
          ...snapshot.items[0],
          evidence_requirements: [
            {
              key: 'test_report',
              title: 'Reporte de pruebas',
              required: true,
              content_types: ['text/markdown'],
              max_bytes: 1024,
            },
          ],
        },
      ],
    }
    expect(parseDeliveryPlanSteps(withRequirement).items[0]?.evidence_requirements?.[0]?.key).toBe('test_report')
    expect(parseDeliveryPlanSteps(snapshot).items[0]?.evidence_requirements).toBeUndefined()
  })

  it('rejects malformed, duplicate, or out-of-bound evidence requirements', () => {
    const invalid = [
      [{ key: 'bad key', title: 'Reporte', required: true, content_types: ['text/plain'], max_bytes: 20 }],
      [
        { key: 'same', title: 'Uno', required: true, content_types: ['text/plain'], max_bytes: 20 },
        { key: 'same', title: 'Dos', required: false, content_types: ['text/plain'], max_bytes: 20 },
      ],
      [{ key: 'report', title: 'Reporte', required: true, content_types: ['text/html'], max_bytes: 20 }],
      [{ key: 'report', title: 'Reporte', required: true, content_types: ['text/plain'], max_bytes: 1_048_577 }],
      [
        {
          key: 'report',
          title: 'Reporte',
          required: true,
          content_types: ['text/plain'],
          max_bytes: 20,
          object_key: 'private/path',
        },
      ],
    ]
    for (const evidence_requirements of invalid) {
      expect(() =>
        parseDeliveryPlanSteps({
          ...snapshot,
          items: [{ ...snapshot.items[0], evidence_requirements }],
        })
      ).toThrow('formato esperado')
    }
  })

  it('rejects responses from another plan or version', () => {
    expect(() => parseDeliveryPlanSteps(snapshot, { planId: 'plan-2' })).toThrow('otra versión del plan')
    expect(() => parseDeliveryPlanSteps(snapshot, { planVersion: 2 })).toThrow('otra versión del plan')
  })

  it('rejects step rows that do not belong to the snapshot plan version', () => {
    expect(() =>
      parseDeliveryPlanSteps({
        ...snapshot,
        items: [{ ...snapshot.items[0], plan_version: 1 }],
      })
    ).toThrow('mezcla pasos de versiones distintas')
  })

  it('rejects malformed step rows rather than silently showing incomplete state', () => {
    expect(() =>
      parseDeliveryPlanSteps({ ...snapshot, items: [{ ...snapshot.items[0], depends_on: 'prepare' }] })
    ).toThrow('formato esperado')
  })
})
