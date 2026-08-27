export type DeliveryCheck = {
  label: string
  passed: boolean
  output?: string
  phase?: 'validation' | 'qa'
}

export type DeliveryQAExecutionContract = {
  runValidation: boolean
  runQA: boolean
  runStagehand: boolean
  collectEvidence: boolean
}

export type DeliveryImplementationChangeSet = {
  workspace?: string
  worktree?: string
  branch?: string
  baseSHA?: string
  githubRepository?: string
  reviewDiffSHA256?: string
  diffCheckPassed?: boolean
  diffCheck?: string
  diffStat?: string
  validations: DeliveryCheck[]
}

export type DeliveryImplementationResult = DeliveryImplementationChangeSet & {
  summary?: string
  deployment?: string
  changeSets: DeliveryImplementationChangeSet[]
  repositoryExecutionOrder: string[]
}

export type DeliveryQAResult = {
  workspace?: string
  testedDirectory?: string
  preview?: { url?: string; passed: boolean; status?: number; error?: string }
  commands: DeliveryCheck[]
  repositoryRuns: DeliveryQARepositoryRun[]
  repositoryExecutionOrder: string[]
  screenshot?: DeliveryCheck
  screenshots: DeliveryCheck[]
  semantic?: DeliverySemanticQA
}

export type DeliveryBrowserE2E = {
  mode?: 'read_only' | 'approved_navigation' | 'approved_test_flow'
  passed: boolean
  cases: Array<{
    id: string
    title: string
    passed: boolean
    screenshot?: string
    beforeScreenshot?: string
    evidenceError?: string
    steps: Array<{ id: string; kind: string; passed: boolean; detail?: string; url?: string }>
  }>
}

export type DeliveryBrowserRuntime = {
  consoleErrors: string[]
  failedRequests: string[]
  observedNetworkSources: string[]
  unavailableObservers: string[]
}

export type DeliverySemanticQAReport = {
  verdict?: 'passed' | 'failed' | 'blocked'
  summary?: string
  semanticStatus?: 'structured' | 'degraded'
  browserE2E?: DeliveryBrowserE2E
  browserRuntime?: DeliveryBrowserRuntime
}

export type DeliverySemanticQA = {
  passed: boolean
  output?: string
  report?: DeliverySemanticQAReport
}

export type DeliveryQAReport = {
  summary: string
  verdict: 'passed' | 'failed' | 'blocked'
  checks: Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail: string }>
  defects: string[]
  coverageGaps: string[]
  recommendedActions: string[]
}

// A QA run is per reviewed repository, not merely per delivery task. This
// keeps a composed product honest: a passing dashboard check cannot visually
// mask an unexecuted backend validation (or the reverse).
export type DeliveryQARepositoryRun = {
  workspace?: string
  branch?: string
  testedDirectory?: string
  commands: DeliveryCheck[]
  executionContract?: DeliveryQAExecutionContract
}

export type DeliveryPublicationResult = {
  grantId?: string
  workspace?: string
  branch?: string
  baseSHA?: string
  commitSHA?: string
  remoteRepository?: string
  branchPublished: boolean
  commitCreated: boolean
  pullRequestURL?: string
  pullRequestCreated?: boolean
  deployment?: string
}

export type DeliveryReleaseDraft = {
  executive: {
    whatChanged: string
    why: string
    howToTest: string
    risks: string[]
  }
  technical: {
    decisions: string[]
    evidence: string[]
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter((entry): entry is string => Boolean(entry)) : []
}

// deliveryReleaseDraft recognizes only the strict agent contract. The human
// can load it into the editable release form, but nothing is persisted or
// released until that person reviews and submits it through the normal gate.
export function deliveryReleaseDraft(value: unknown): DeliveryReleaseDraft | undefined {
  const root = record(value)
  const executive = record(root?.executive)
  const technical = record(root?.technical)
  const whatChanged = text(executive?.what_changed)
  const why = text(executive?.why)
  const howToTest = text(executive?.how_to_test)
  const risks = textList(executive?.risks)
  const decisions = textList(technical?.decisions)
  const evidence = textList(technical?.evidence)
  if (!whatChanged || !why || !howToTest || !risks.length || !decisions.length || !evidence.length) return undefined
  return { executive: { whatChanged, why, howToTest, risks }, technical: { decisions, evidence } }
}

function commandLabel(value: unknown) {
  return Array.isArray(value) && value.every((part) => typeof part === 'string') ? value.join(' ') : 'Validación local'
}

function check(value: unknown): DeliveryCheck | null {
  const item = record(value)
  if (!item || typeof item.passed !== 'boolean') return null
  const phase = text(item.phase)
  const parsed = { label: commandLabel(item.command), passed: item.passed, output: text(item.output) }
  return phase === 'validation' || phase === 'qa' ? { ...parsed, phase } : parsed
}

function checks(value: unknown) {
  return Array.isArray(value) ? value.map(check).filter((entry): entry is DeliveryCheck => entry !== null) : []
}

function browserE2E(value: unknown): DeliveryBrowserE2E | undefined {
  const result = record(value)
  if (!result || typeof result.passed !== 'boolean' || !Array.isArray(result.cases)) return undefined
  const mode = text(result.mode)
  if (mode && mode !== 'read_only' && mode !== 'approved_navigation' && mode !== 'approved_test_flow') return undefined
  const cases = result.cases.flatMap((entry) => {
    const testCase = record(entry)
    const id = text(testCase?.id)
    const title = text(testCase?.title)
    if (!id || !title || typeof testCase?.passed !== 'boolean' || !Array.isArray(testCase.steps)) return []
    const steps = testCase.steps.flatMap((rawStep) => {
      const step = record(rawStep)
      const stepID = text(step?.id)
      const kind = text(step?.kind)
      if (!stepID || !kind || typeof step?.passed !== 'boolean') return []
      return [{ id: stepID, kind, passed: step.passed, detail: text(step.detail), url: text(step.url) }]
    })
    return [{
      id,
      title,
      passed: testCase.passed,
      screenshot: text(testCase.screenshot),
      beforeScreenshot: text(testCase.before_screenshot),
      evidenceError: text(testCase.evidence_error),
      steps,
    }]
  })
  return { mode: mode as DeliveryBrowserE2E['mode'], passed: result.passed, cases }
}

function browserRuntime(value: unknown): DeliveryBrowserRuntime | undefined {
  const runtime = record(value)
  if (!runtime) return undefined
  const boundedList = (entry: unknown) => textList(entry).slice(0, 12)
  return {
    consoleErrors: boundedList(runtime.console_errors),
    failedRequests: boundedList(runtime.failed_requests),
    observedNetworkSources: boundedList(runtime.observed_network_sources),
    unavailableObservers: boundedList(runtime.unavailable_observers),
  }
}

function semanticQA(value: unknown): DeliverySemanticQA | undefined {
  const semantic = record(value)
  if (!semantic || typeof semantic.passed !== 'boolean') return undefined
  const report = record(semantic.report)
  const extraction = record(report?.extraction)
  const verdict = text(report?.verdict)
  const semanticStatus = text(extraction?.semantic_status)
  const parsed: DeliverySemanticQAReport | undefined = report
    ? {
        verdict: verdict === 'passed' || verdict === 'failed' || verdict === 'blocked' ? verdict : undefined,
        summary: text(report.summary),
        semanticStatus: semanticStatus === 'structured' || semanticStatus === 'degraded' ? semanticStatus : undefined,
        browserE2E: browserE2E(report.browser_e2e),
        browserRuntime: browserRuntime(report.browser_runtime),
      }
    : undefined
  return { passed: semantic.passed, output: text(semantic.output), report: parsed }
}

function screenshotCheck(value: unknown): DeliveryCheck | null {
  const parsed = check(value)
  if (!parsed) return null
  const item = record(value)
  const viewport = record(item?.viewport)
  const width = typeof viewport?.width === 'number' ? viewport.width : undefined
  const height = typeof viewport?.height === 'number' ? viewport.height : undefined
  if (width && height) return { ...parsed, label: `${width} × ${height}` }
  return parsed
}

function screenshotChecks(value: unknown) {
  return Array.isArray(value)
    ? value.map(screenshotCheck).filter((entry): entry is DeliveryCheck => entry !== null)
    : []
}

function repositoryRuns(value: unknown): DeliveryQARepositoryRun[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const run = record(entry)
    if (!run) return []
    // Do not render an arbitrary JSON object as a repository validation card.
    // A real run has an identifiable target or an actual command array.
    if (
      !text(run.workspace) &&
      !text(run.branch) &&
      !text(run.tested_directory) &&
      !Array.isArray(run.commands)
    ) {
      return []
    }
    const contract = record(run.execution_contract)
    const executionContract = contract &&
      typeof contract.run_validation === 'boolean' &&
      typeof contract.run_qa === 'boolean' &&
      typeof contract.run_stagehand === 'boolean' &&
      typeof contract.collect_evidence === 'boolean'
      ? {
          runValidation: contract.run_validation,
          runQA: contract.run_qa,
          runStagehand: contract.run_stagehand,
          collectEvidence: contract.collect_evidence,
        }
      : undefined
    return [{
      workspace: text(run.workspace),
      branch: text(run.branch),
      testedDirectory: text(run.tested_directory),
      commands: checks(run.commands),
      executionContract,
    }]
  })
}

function implementationChangeSet(value: unknown): DeliveryImplementationChangeSet | undefined {
  const changeSet = record(value)
  if (!changeSet) return undefined
  const workspace = text(changeSet.workspace)
  const worktree = text(changeSet.worktree)
  const branch = text(changeSet.branch)
  // A multi-repository entry must identify the isolated review target. Never
  // render arbitrary model output as a change set a human might approve.
  if (!workspace || !worktree || !branch) return undefined
  return {
    workspace,
    worktree,
    branch,
    baseSHA: text(changeSet.base_sha),
    githubRepository: text(changeSet.github_repository),
    reviewDiffSHA256: text(changeSet.review_diff_sha256),
    diffCheckPassed: typeof changeSet.diff_check_passed === 'boolean' ? changeSet.diff_check_passed : undefined,
    diffCheck: text(changeSet.diff_check),
    diffStat: text(changeSet.diff_stat),
    validations: checks(changeSet.validations),
  }
}

function implementationChangeSets(value: unknown) {
  return Array.isArray(value)
    ? value.map(implementationChangeSet).filter((entry): entry is DeliveryImplementationChangeSet => Boolean(entry))
    : []
}

export function deliveryExecutionResult(value: unknown) {
  const artifacts = record(value)
  if (!artifacts) return { implementation: undefined, qa: undefined }

  const rawImplementation = record(artifacts.implementation)
  const singleImplementation = implementationChangeSet(rawImplementation)
  const changeSets = implementationChangeSets(rawImplementation?.change_sets)
  const implementation: DeliveryImplementationResult | undefined =
    rawImplementation && (singleImplementation || changeSets.length)
      ? {
          ...(singleImplementation ?? { validations: [] }),
          summary: text(rawImplementation.summary),
          deployment: text(rawImplementation.deployment),
          changeSets,
          repositoryExecutionOrder: textList(rawImplementation.repository_execution_order),
        }
      : undefined

  const rawQA = record(artifacts.qa_execution)
  const rawPreview = record(rawQA?.preview)
  const rawScreenshot = check(rawQA?.screenshot)
  const qa: DeliveryQAResult | undefined = rawQA
    ? {
        workspace: text(rawQA.workspace),
        testedDirectory: text(rawQA.tested_directory),
        preview: rawPreview && typeof rawPreview.passed === 'boolean'
          ? { url: text(rawPreview.url), passed: rawPreview.passed, status: typeof rawPreview.status === 'number' ? rawPreview.status : undefined, error: text(rawPreview.error) }
          : undefined,
        commands: checks(rawQA.commands),
        repositoryRuns: repositoryRuns(rawQA.repository_runs),
        repositoryExecutionOrder: textList(rawQA.repository_execution_order),
        screenshot: rawScreenshot ?? undefined,
        screenshots: screenshotChecks(rawQA.screenshots),
        semantic: semanticQA(rawQA.semantic),
      }
    : undefined

  return { implementation, qa }
}

// deliveryQAReport is only the agent's structured narration. The execution
// result above remains the source of truth for preview, commands and visual
// artifacts captured by the local harness.
export function deliveryQAReport(value: unknown): DeliveryQAReport | undefined {
  const report = record(value)
  const summary = text(report?.summary)
  const verdict = text(report?.verdict)
  const checksValue = Array.isArray(report?.checks) ? report.checks : []
  const checks = checksValue.flatMap((value) => {
    const check = record(value)
    const name = text(check?.name)
    const status = text(check?.status)
    const detail = text(check?.detail)
    return name && detail && (status === 'passed' || status === 'failed' || status === 'skipped')
      ? [{ name, status: status as DeliveryQAReport['checks'][number]['status'], detail }]
      : []
  })
  const defects = textList(report?.defects)
  const coverageGaps = textList(report?.coverage_gaps)
  const recommendedActions = textList(report?.recommended_actions)
  if (!summary || (verdict !== 'passed' && verdict !== 'failed' && verdict !== 'blocked') || !checks.length) return undefined
  return { summary, verdict, checks, defects, coverageGaps, recommendedActions }
}

// Publication is a deterministic result rather than model output. It lives in
// structured_result so a reviewer can inspect the exact grant/commit/PR
// without confusing it with an IA response or a token-cost ledger entry.
export function deliveryPublicationResult(value: unknown): DeliveryPublicationResult | undefined {
  const raw = record(value)
  if (!raw || typeof raw.branch_published !== 'boolean') return undefined
  return {
    grantId: text(raw.grant_id),
    workspace: text(raw.workspace),
    branch: text(raw.branch),
    baseSHA: text(raw.base_sha),
    commitSHA: text(raw.commit_sha),
    remoteRepository: text(raw.remote_repository),
    branchPublished: raw.branch_published,
    commitCreated: raw.commit_created === true,
    pullRequestURL: text(raw.pull_request_url),
    pullRequestCreated: typeof raw.pull_request_created === 'boolean' ? raw.pull_request_created : undefined,
    deployment: text(raw.deployment),
  }
}
