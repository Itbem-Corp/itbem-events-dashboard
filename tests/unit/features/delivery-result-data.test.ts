import { deliveryExecutionResult, deliveryPublicationResult, deliveryQAReport, deliveryReleaseDraft } from '@/features/automation/delivery-result-data'
import { describe, expect, it } from 'vitest'

describe('delivery execution result', () => {
  it('extracts implementation and QA evidence without trusting arbitrary values', () => {
    const result = deliveryExecutionResult({
      implementation: {
        summary: 'Applied an isolated patch',
        repository_execution_order: ['workspace://backend'],
        workspace: 'workspace://backend',
        worktree: 'workspace://backend#itbem-agent/task',
        branch: 'itbem-agent/task',
        diff_check_passed: true,
        validations: [{ command: ['go', 'test', './...'], passed: true, output: 'ok' }],
      },
      qa_execution: {
        repository_execution_order: ['workspace://backend', 'workspace://dashboard'],
        workspace: 'workspace://backend',
        tested_directory: 'isolated worktree',
        preview: { url: 'https://preview.example.test', passed: true, status: 200 },
        commands: [{ command: ['npm', 'run', 'test:e2e'], passed: false, output: 'one failure' }],
        screenshot: { command: ['npx', 'playwright'], passed: true },
        repository_runs: [
          {
            workspace: 'workspace://backend',
            branch: 'itbem-agent/task',
            tested_directory: 'reviewed isolated worktree',
            commands: [{ command: ['go', 'test', './...'], passed: true, output: 'ok' }],
          },
          {
            workspace: 'workspace://dashboard',
            branch: 'itbem-agent/task',
            tested_directory: 'reviewed isolated worktree',
            commands: [{ command: ['npm', 'run', 'test:e2e'], passed: false, output: 'one failure' }],
          },
        ],
      },
    })

    expect(result.implementation).toMatchObject({ branch: 'itbem-agent/task', diffCheckPassed: true })
    expect(result.implementation?.validations).toEqual([{ label: 'go test ./...', passed: true, output: 'ok' }])
    expect(result.implementation?.repositoryExecutionOrder).toEqual(['workspace://backend'])
    expect(result.qa?.preview).toEqual({ url: 'https://preview.example.test', passed: true, status: 200, error: undefined })
    expect(result.qa?.commands).toEqual([{ label: 'npm run test:e2e', passed: false, output: 'one failure' }])
    expect(result.qa?.repositoryRuns).toEqual([
      {
        workspace: 'workspace://backend',
        branch: 'itbem-agent/task',
        testedDirectory: 'reviewed isolated worktree',
        commands: [{ label: 'go test ./...', passed: true, output: 'ok' }],
      },
      {
        workspace: 'workspace://dashboard',
        branch: 'itbem-agent/task',
        testedDirectory: 'reviewed isolated worktree',
        commands: [{ label: 'npm run test:e2e', passed: false, output: 'one failure' }],
      },
    ])
    expect(result.qa?.repositoryExecutionOrder).toEqual(['workspace://backend', 'workspace://dashboard'])
    expect(result.qa?.screenshot).toEqual({ label: 'npx playwright', passed: true, output: undefined })
  })

  it('keeps each reviewed repository change set distinct', () => {
    const result = deliveryExecutionResult({
      implementation: {
        summary: 'Two reviewed worktrees',
        repository_execution_order: ['workspace://backend', 'workspace://dashboard'],
        change_sets: [
          {
            workspace: 'workspace://backend',
            worktree: 'workspace://backend#itbem-agent/task',
            branch: 'itbem-agent/task',
            github_repository: 'Itbem-Corp/backend',
            diff_check_passed: true,
            validations: [{ command: ['go', 'test', './...'], passed: true }],
          },
          {
            workspace: 'workspace://dashboard',
            worktree: 'workspace://dashboard#itbem-agent/task',
            branch: 'itbem-agent/task',
            github_repository: 'Itbem-Corp/dashboard',
            diff_check_passed: false,
            validations: [{ command: ['npm', 'run', 'test:e2e'], passed: false, output: 'failed' }],
          },
          { workspace: 'untrusted' },
        ],
      },
    })

    expect(result.implementation?.changeSets).toEqual([
      expect.objectContaining({ workspace: 'workspace://backend', githubRepository: 'Itbem-Corp/backend', diffCheckPassed: true }),
      expect.objectContaining({ workspace: 'workspace://dashboard', githubRepository: 'Itbem-Corp/dashboard', diffCheckPassed: false }),
    ])
    expect(result.implementation?.changeSets[1].validations).toEqual([
      { label: 'npm run test:e2e', passed: false, output: 'failed' },
    ])
    expect(result.implementation?.repositoryExecutionOrder).toEqual(['workspace://backend', 'workspace://dashboard'])
  })

  it('renders only bounded Stagehand browser evidence from the QA harness', () => {
    const result = deliveryExecutionResult({
      qa_execution: {
        semantic: {
          passed: true,
          report: {
            verdict: 'passed',
            summary: 'Approved browser cases passed.',
            extraction: { semantic_status: 'degraded' },
            browser_e2e: {
              mode: 'approved_test_flow',
              passed: true,
              cases: [{
                id: 'login-entry', title: 'Login entry', passed: true, before_screenshot: 'semantic-qa-case-01-before.png', screenshot: 'semantic-qa-case-01-after.png',
                steps: [{ id: 'step-1', kind: 'assert_visible', passed: true, url: 'https://preview.example.test/login' }],
              }],
            },
          },
        },
      },
    })
    expect(result.qa?.semantic).toMatchObject({
      passed: true,
      report: { semanticStatus: 'degraded', browserE2E: { mode: 'approved_test_flow', passed: true, cases: [{ id: 'login-entry', beforeScreenshot: 'semantic-qa-case-01-before.png', screenshot: 'semantic-qa-case-01-after.png' }] } },
    })
    expect(deliveryExecutionResult({ qa_execution: { semantic: { passed: 'yes', report: { token: 'never-render' } } } }).qa?.semantic).toBeUndefined()
  })

  it('keeps the approved per-repository QA contract visible in execution evidence', () => {
    const result = deliveryExecutionResult({
      qa_execution: {
        repository_runs: [{
          workspace: 'workspace://dashboard',
          commands: [{ phase: 'validation', command: ['npm', 'run', 'typecheck'], passed: true }],
          execution_contract: {
            run_validation: true, run_qa: true, run_stagehand: true, collect_evidence: true,
          },
        }],
      },
    })
    expect(result.qa?.repositoryRuns).toEqual([expect.objectContaining({
      workspace: 'workspace://dashboard',
      commands: [{ label: 'npm run typecheck', passed: true, output: undefined, phase: 'validation' }],
      executionContract: { runValidation: true, runQA: true, runStagehand: true, collectEvidence: true },
    })])
  })

  it('ignores malformed artifact sections', () => {
    expect(deliveryExecutionResult({ implementation: 'untrusted', qa_execution: { commands: [{ passed: 'yes' }], repository_runs: [{ commands: 'unsafe' }] } })).toEqual({ implementation: undefined, qa: expect.objectContaining({ commands: [], repositoryRuns: [] }) })
  })
})

describe('delivery publication result', () => {
  it('shows only an explicit deterministic publication record', () => {
    const result = deliveryPublicationResult({
      grant_id: 'grant-1',
      workspace: 'workspace://backend',
      branch: 'itbem-agent/task',
      base_sha: 'a'.repeat(40),
      commit_sha: 'b'.repeat(40),
      remote_repository: 'Itbem-Corp/backend',
      branch_published: true,
      commit_created: true,
      pull_request_url: 'https://github.com/Itbem-Corp/backend/pull/7',
      pull_request_created: false,
    })
    expect(result).toMatchObject({ branchPublished: true, commitCreated: true, branch: 'itbem-agent/task' })
    expect(deliveryPublicationResult({ branch_published: 'yes', token: 'never-render' })).toBeUndefined()
  })
})

describe('delivery QA report', () => {
  it('renders only a complete structured QA narration', () => {
    const report = deliveryQAReport({
      summary: 'Preview and smoke checks passed.',
      verdict: 'passed',
      checks: [{ name: 'Preview', status: 'passed', detail: 'HTTP 200' }],
      defects: [],
      coverage_gaps: ['No accessibility audit was configured'],
      recommended_actions: ['Human QA review'],
    })
    expect(report).toEqual({
      summary: 'Preview and smoke checks passed.',
      verdict: 'passed',
      checks: [{ name: 'Preview', status: 'passed', detail: 'HTTP 200' }],
      defects: [],
      coverageGaps: ['No accessibility audit was configured'],
      recommendedActions: ['Human QA review'],
    })
  })

  it('does not render incomplete or untrusted QA narration', () => {
    expect(deliveryQAReport({ summary: 'x', verdict: 'passed', checks: [] })).toBeUndefined()
    expect(deliveryQAReport({ summary: 'x', verdict: 'release', checks: [{ name: 'x', status: 'passed', detail: 'x' }] })).toBeUndefined()
  })
})

describe('delivery release draft', () => {
  it('accepts only the complete structured summary required for human review', () => {
    const draft = deliveryReleaseDraft({
      executive: {
        what_changed: 'A guarded delivery summary',
        why: 'Reduce manual transcription after QA',
        how_to_test: 'Review the cited evidence and preview',
        risks: ['The human release gate remains required'],
      },
      technical: {
        decisions: ['Keep every gate explicit'],
        evidence: ['evidence-1 — Desktop QA screenshot'],
      },
    })
    expect(draft).toMatchObject({ executive: { whatChanged: 'A guarded delivery summary' }, technical: { evidence: ['evidence-1 — Desktop QA screenshot'] } })
  })

  it('does not turn arbitrary or incomplete model output into a release form', () => {
    expect(deliveryReleaseDraft({ executive: { what_changed: 'Missing required fields' }, technical: { evidence: ['made up'] } })).toBeUndefined()
    expect(deliveryReleaseDraft({ token: 'never-render' })).toBeUndefined()
  })
})
