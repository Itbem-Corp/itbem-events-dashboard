import {
  DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE,
  deliveryPlanStepActivityActionLabel,
  deliveryPlanStepActivityPath,
  deliveryPlanStepActivityPhaseLabel,
  parseDeliveryPlanStepActivity,
  type DeliveryPlanStepActivityPage,
} from '@/features/automation/delivery-plan-step-activity'
import { describe, expect, it } from 'vitest'

const expected = { planId: 'plan/1', planVersion: 4, stepId: 'step 2' }

const page: DeliveryPlanStepActivityPage = {
  plan_id: 'plan/1',
  plan_version: 4,
  step_id: 'step 2',
  items: [
    {
      id: 'activity-1',
      sequence: 14,
      action: 'tool_completed',
      phase: 'completed',
      tool_name: 'read_file',
      automation_task_id: 'task-1',
      run_id: 'run-1',
      worker_id: 'worker-1',
      agent_key: 'agent-1',
      machine_id: 'machine-1',
      agent_instance_id: 'f9e53a6f-9cda-4e84-88d4-bbac93addd11',
      details: null,
      inference: null,
      duration_ms: 1_250,
      summary: 'La herramienta terminó correctamente.',
      occurred_at: '2026-09-23T10:00:00Z',
    },
  ],
  next_cursor: 'older + page',
}

describe('delivery plan step activity API contract', () => {
  it('encodes plan, step, page size and opaque cursor', () => {
    expect(DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE).toBe(25)
    expect(deliveryPlanStepActivityPath(expected.planId, expected.stepId)).toBe(
      '/automation/plans/plan%2F1/steps/step%202/activity?limit=25'
    )
    expect(deliveryPlanStepActivityPath(expected.planId, expected.stepId, page.next_cursor)).toBe(
      '/automation/plans/plan%2F1/steps/step%202/activity?limit=25&cursor=older+%2B+page'
    )
  })

  it('accepts only well-formed activity for the expected plan version and step', () => {
    expect(parseDeliveryPlanStepActivity(page, expected)).toEqual(page)
    expect(() => parseDeliveryPlanStepActivity({ ...page, plan_id: 'other' }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
    expect(() => parseDeliveryPlanStepActivity({ ...page, plan_version: 3 }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
    expect(() => parseDeliveryPlanStepActivity({ ...page, step_id: 'other' }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
  })

  it('normalizes omitted optional tool, machine, and duration fields to null', () => {
    const {
      tool_name: _toolName,
      machine_id: _machineId,
      agent_instance_id: _instanceID,
      duration_ms: _durationMS,
      ...withoutOptionalFields
    } = page.items[0]!
    const parsed = parseDeliveryPlanStepActivity({ ...page, items: [withoutOptionalFields] }, expected)
    expect(parsed.items[0]).toMatchObject({
      tool_name: null,
      machine_id: null,
      agent_instance_id: null,
      duration_ms: null,
    })
  })

  it('accepts only canonical allow-listed accounting on terminal inference rows', () => {
    const inference = {
      receipt_id: 'cbe4dfd4-57e5-48aa-8e5d-229d77d50be4',
      provider: 'deepseek',
      model: 'deepseek-chat',
      status: 'accepted',
      input_tokens: 120,
      output_tokens: 32,
      cached_input_tokens: 18,
      cache_write_tokens: 4,
      reasoning_tokens: 7,
      total_tokens: 152,
      total_cost_microusd: 243,
      currency: 'USD',
      pricing_basis: 'official_api_price',
    }
    const inferenceActivity = {
      ...page.items[0],
      action: 'inference',
      phase: 'completed',
      inference,
    }
    const parsedInference = parseDeliveryPlanStepActivity({ ...page, items: [inferenceActivity] }, expected).items[0]
      ?.inference
    expect(parsedInference).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      status: 'accepted',
      input_tokens: 120,
      output_tokens: 32,
      cached_input_tokens: 18,
      cache_write_tokens: 4,
      reasoning_tokens: 7,
      total_tokens: 152,
      total_cost_microusd: 243,
      currency: 'USD',
      pricing_basis: 'official_api_price',
    })
    expect(parsedInference).not.toHaveProperty('receipt_id')
    expect(parseDeliveryPlanStepActivity({ ...page, items: [{ ...inferenceActivity, inference: null }] }, expected).items[0]?.inference).toBeNull()
    expect(() =>
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...page.items[0], action: 'tool_completed', inference }] },
        expected
      )
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...inferenceActivity, phase: 'started' }] },
        expected
      )
    ).toThrow('registro inválido')
    const untrustedLabels = {
      ...inference,
      provider: 'provider secret-canary',
      model: 'model\ncompletion-canary',
      status: 'private provider response',
      currency: 'bad currency',
      pricing_basis: 'provider supplied pricing details',
    }
    expect(
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...inferenceActivity, inference: untrustedLabels }] }, expected)
        .items[0]?.inference
    ).toMatchObject({
      provider: null,
      model: null,
      status: null,
      currency: null,
      pricing_basis: null,
    })
    for (const invalid of [
      { ...inference, receipt_id: 'not-an-id' },
      { ...inference, input_tokens: -1 },
      { ...inference, total_cost_microusd: 1.5 },
      { ...inference, completion: 'must never be accepted' },
      { ...inference, reasoning: 'private reasoning canary' },
    ]) {
      expect(() =>
        parseDeliveryPlanStepActivity({ ...page, items: [{ ...inferenceActivity, inference: invalid }] }, expected)
      ).toThrow('registro inválido')
    }
  })

  it('rejects malformed timestamps, sequence, duration, fields and cursors', () => {
    expect(() => parseDeliveryPlanStepActivity({ ...page, items: [{}] }, expected)).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...page.items[0], occurred_at: 'yesterday' }] }, expected)
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...page.items[0], sequence: 0 }] }, expected)
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...page.items[0], duration_ms: -1 }] }, expected)
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...page.items[0], agent_instance_id: 'worker-mx-01' }] },
        expected
      )
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...page.items[0], prompt: 'must not be returned' }] },
        expected
      )
    ).toThrow('campos no permitidos')
    expect(() => parseDeliveryPlanStepActivity({ ...page, next_cursor: 123 }, expected)).toThrow('formato esperado')
  })

  it('accepts only completed evidence checks as lowercase SHA-256 digests and strips non-evidence details', () => {
    const criterionSHA256 = 'a'.repeat(64)
    const reviewDiffSHA256 = 'b'.repeat(64)
    const evidence = {
      ...page.items[0],
      action: 'evidence',
      phase: 'completed',
      details: {
        acceptance_checks: [{ criterion_sha256: criterionSHA256, passed: true }],
        review_diff_sha256: reviewDiffSHA256,
      },
    }
    expect(parseDeliveryPlanStepActivity({ ...page, items: [evidence] }, expected).items[0]?.details).toEqual({
      acceptance_checks: [{ criterion_sha256: criterionSHA256, passed: true }],
      review_diff_sha256: reviewDiffSHA256,
    })

    const commandDetails = {
      executable_name: 'go',
      argument_count: 4,
      exit_code: 0,
      captured_output_bytes: 98,
    }
    expect(
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...page.items[0], action: 'command', details: commandDetails }] },
        expected
      ).items[0]?.details
    ).toEqual(commandDetails)
  })

  it('preserves bounded command, changed-file, and canonical resource metadata', () => {
    const commandDetails = {
      executable_name: 'pwsh',
      argument_count: 0,
      exit_code: 255,
      captured_output_bytes: 24_000,
      resource_references: ['workspace://repo-main/scripts/verify.ps1'],
    }
    const changedFileDetails = {
      changed_files: ['src/orders.ts', 'tests/orders.test.ts', 'src/foo-id_rsa-helper.ts'],
      resource_references: ['workspace://repo-main'],
    }
    const command = {
      ...page.items[0],
      action: 'validation',
      phase: 'failed',
      details: commandDetails,
    }
    const fileChange = {
      ...page.items[0],
      action: 'file_change',
      phase: 'completed',
      details: changedFileDetails,
    }

    expect(parseDeliveryPlanStepActivity({ ...page, items: [command] }, expected).items[0]?.details).toEqual(
      commandDetails
    )
    expect(parseDeliveryPlanStepActivity({ ...page, items: [fileChange] }, expected).items[0]?.details).toEqual(
      changedFileDetails
    )
  })

  it('preserves only paired, bounded dependency manifest metadata on completed evidence', () => {
    const dependencyDetails = {
      applied_dependency_manifest_sha256: 'e'.repeat(64),
      applied_dependency_patch_count: 64,
    }
    const evidence = {
      ...page.items[0],
      action: 'evidence',
      phase: 'completed',
      details: dependencyDetails,
    }
    expect(parseDeliveryPlanStepActivity({ ...page, items: [evidence] }, expected).items[0]?.details).toEqual(
      dependencyDetails
    )

    for (const invalidDetails of [
      { applied_dependency_manifest_sha256: 'E'.repeat(64), applied_dependency_patch_count: 1 },
      { applied_dependency_manifest_sha256: 'e'.repeat(64) },
      { applied_dependency_manifest_sha256: 'e'.repeat(64), applied_dependency_patch_count: 65 },
    ]) {
      expect(() =>
        parseDeliveryPlanStepActivity({ ...page, items: [{ ...evidence, details: invalidDetails }] }, expected)
      ).toThrow('registro inválido')
    }
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...evidence, phase: 'failed' }] }, expected)
    ).toThrow('registro inválido')
  })

  it('rejects invalid or non-allowlisted command, file, and resource metadata', () => {
    const validCommand = {
      executable_name: 'go',
      argument_count: 2,
      exit_code: 0,
      captured_output_bytes: 128,
    }
    const invalidCases = [
      { action: 'command', phase: 'completed', details: { ...validCommand, executable_name: 'go run' } },
      { action: 'command', phase: 'completed', details: { ...validCommand, argument_count: -1 } },
      { action: 'command', phase: 'completed', details: { ...validCommand, argument_count: 129 } },
      { action: 'command', phase: 'completed', details: { ...validCommand, exit_code: 256 } },
      { action: 'command', phase: 'completed', details: { ...validCommand, captured_output_bytes: 24_001 } },
      { action: 'command', phase: 'completed', details: { executable_name: 'go' } },
      {
        action: 'file_change',
        phase: 'completed',
        details: { changed_files: ['src/orders.ts', 'src/orders.ts'] },
      },
      { action: 'file_change', phase: 'completed', details: { changed_files: ['../.env.local'] } },
      { action: 'file_change', phase: 'completed', details: { changed_files: ['src/../orders.ts'] } },
      { action: 'file_change', phase: 'completed', details: { changed_files: ['src/private_key.json'] } },
      {
        action: 'file_change',
        phase: 'completed',
        details: { changed_files: Array.from({ length: 20 }, (_, index) => `src/${index}-${'a'.repeat(245)}.ts`) },
      },
      {
        action: 'file_read',
        phase: 'completed',
        details: { resource_references: ['workspace://repo-main', 'workspace://repo-main'] },
      },
      { action: 'file_read', phase: 'completed', details: { resource_references: [] } },
      { action: 'file_read', phase: 'completed', details: { resource_references: ['https://example.com'] } },
      { action: 'file_read', phase: 'completed', details: { resource_references: ['workspace://repo%2Fsecret'] } },
      { action: 'tool', phase: 'completed', details: { resource_references: ['workspace://repo-main'] } },
      { action: 'command', phase: 'started', details: validCommand },
      { action: 'command', phase: 'completed', details: { ...validCommand, stdout: 'raw output' } },
      { action: 'command', phase: 'completed', details: { ...validCommand, argv: ['private arg'] } },
      { action: 'command', phase: 'completed', details: { ...validCommand, prompt: 'private prompt' } },
      { action: 'command', phase: 'completed', details: { ...validCommand, reasoning: 'private reasoning' } },
    ]

    for (const invalid of invalidCases) {
      expect(() =>
        parseDeliveryPlanStepActivity(
          {
            ...page,
            items: [{ ...page.items[0], ...invalid }],
          },
          expected
        )
      ).toThrow('registro inválido')
    }
  })

  it('rejects malformed hashes, checks outside completed evidence, and arbitrary sensitive details', () => {
    const goodHash = 'c'.repeat(64)
    const baseEvidence = {
      ...page.items[0],
      action: 'evidence',
      phase: 'completed',
      details: { acceptance_checks: [{ criterion_sha256: goodHash, passed: false }] },
    }
    const invalidDetails = [
      { acceptance_checks: [{ criterion_sha256: 'C'.repeat(64), passed: true }] },
      { acceptance_checks: [{ criterion_sha256: 'short-hash', passed: true }] },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: 'yes' }] },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: true, criterion: 'plaintext criterion' }] },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: true }], review_diff_sha256: 'not-a-digest' },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: true }], command: 'private command' },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: true }], output: 'private output' },
      { acceptance_checks: [{ criterion_sha256: goodHash, passed: true }], reasoning: 'private reasoning' },
    ]

    for (const details of invalidDetails) {
      expect(() => parseDeliveryPlanStepActivity({ ...page, items: [{ ...baseEvidence, details }] }, expected)).toThrow(
        'registro inválido'
      )
    }
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...baseEvidence, phase: 'failed' }] }, expected)
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...baseEvidence, action: 'command' }] }, expected)
    ).toThrow('registro inválido')
  })

  it('accepts only bounded safe patch metadata on completed evidence', () => {
    const sha256 = 'd'.repeat(64)
    const patchArtifact = {
      repository_ref: 'workspace://repo-main',
      base_sha: 'a'.repeat(40),
      sha256,
      size_bytes: 4 * 1024 * 1024,
    }
    const evidence = {
      ...page.items[0],
      action: 'evidence',
      phase: 'completed',
      details: { patch_artifacts: [patchArtifact] },
    }
    expect(parseDeliveryPlanStepActivity({ ...page, items: [evidence] }, expected).items[0]?.details).toEqual({
      patch_artifacts: [patchArtifact],
    })

    const invalidArtifacts = [
      { ...patchArtifact, repository_ref: 'workspace://repo-main/subdir' },
      { ...patchArtifact, base_sha: 'A'.repeat(40) },
      { ...patchArtifact, base_sha: 'short' },
      { ...patchArtifact, sha256: 'F'.repeat(64) },
      { ...patchArtifact, size_bytes: 0 },
      { ...patchArtifact, size_bytes: 4 * 1024 * 1024 + 1 },
      { ...patchArtifact, object_key: 'private/object/key' },
      { ...patchArtifact, patch_bytes: 'private patch contents' },
    ]
    for (const artifact of invalidArtifacts) {
      expect(() =>
        parseDeliveryPlanStepActivity(
          { ...page, items: [{ ...evidence, details: { patch_artifacts: [artifact] } }] },
          expected
        )
      ).toThrow('registro inválido')
    }
    expect(() =>
      parseDeliveryPlanStepActivity(
        { ...page, items: [{ ...evidence, details: { patch_artifacts: [patchArtifact, patchArtifact] } }] },
        expected
      )
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...evidence, phase: 'failed' }] }, expected)
    ).toThrow('registro inválido')
    expect(() =>
      parseDeliveryPlanStepActivity({ ...page, items: [{ ...evidence, action: 'tool' }] }, expected)
    ).toThrow('registro inválido')
  })

  it('maps known labels to Spanish and keeps readable fallback labels', () => {
    expect(deliveryPlanStepActivityActionLabel('tool_completed')).toBe('Herramienta completada')
    expect(deliveryPlanStepActivityActionLabel('file_change')).toBe('Cambio de archivo')
    expect(deliveryPlanStepActivityActionLabel('unknown_safe_action')).toBe('Unknown Safe Action')
    expect(deliveryPlanStepActivityPhaseLabel('running')).toBe('En curso')
    expect(deliveryPlanStepActivityPhaseLabel('custom_phase')).toBe('Custom Phase')
  })
})
