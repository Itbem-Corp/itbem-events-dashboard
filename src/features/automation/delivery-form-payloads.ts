export type DeliveryPlanForm = {
  summary: string
  goalInterpretation: string
  confidence: string
  autonomyBoundary: string
  contextReviewed: string
  contextGaps: string
  assumptions: string
  humanDecisions: string
  implementationSteps: string
  filesImpacted: string
  risks: string
  qaPlan: string
  evidencePlan: string
  acceptanceCriteria: string
  rollbackPlan: string
  estimate: string
  questions: string
  browserQaMode: 'read_only' | 'approved_navigation' | 'approved_test_flow'
  browserQaCases: DeliveryBrowserQAFormCase[]
}

// A browser case is intentionally small and declarative. The delivery API
// validates it again before a human can approve the plan; this form only
// makes the approved E2E intent reviewable without asking operators to write
// raw JSON or shell commands.
export type DeliveryBrowserQAFormCase = {
  id: string
  title: string
  path: string
  visibleSelector: string
  expectedText: string
  clickSelector: string
  expectedPath: string
  emailSelector?: string
  emailValueEnv?: string
  passwordSelector?: string
  passwordValueEnv?: string
  postActionSelector?: string
  postActionText?: string
  assertPath?: string
}

export type DeliveryReleaseForm = {
  whatChanged: string
  why: string
  howToTest: string
  risks: string
  decisions: string
  evidence: string
  reportRef: string
}

export function deliveryLines(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function deliveryPlanPayload(form: DeliveryPlanForm) {
  const browserCases = form.browserQaCases.map((entry, index) => {
    const steps: Array<Record<string, string>> = [{ kind: 'navigate', path: entry.path.trim() }]
    if (entry.visibleSelector.trim()) steps.push({ kind: 'assert_visible', selector: entry.visibleSelector.trim() })
    if (entry.expectedText.trim()) steps.push({ kind: 'assert_text', text: entry.expectedText.trim() })
    if (form.browserQaMode === 'approved_test_flow') {
      if (entry.emailSelector?.trim() || entry.emailValueEnv?.trim()) {
        steps.push({ kind: 'fill', selector: entry.emailSelector?.trim() ?? '', value_env: entry.emailValueEnv?.trim() ?? '' })
      }
      if (entry.passwordSelector?.trim() || entry.passwordValueEnv?.trim()) {
        steps.push({ kind: 'fill', selector: entry.passwordSelector?.trim() ?? '', value_env: entry.passwordValueEnv?.trim() ?? '' })
      }
    }
    if (entry.clickSelector.trim() || entry.expectedPath.trim()) {
      const click: Record<string, string> = { kind: 'click', selector: entry.clickSelector.trim() }
      if (entry.expectedPath.trim()) click.expected_path = entry.expectedPath.trim()
      steps.push(click)
    }
    if (form.browserQaMode === 'approved_test_flow') {
      if (entry.postActionSelector?.trim()) {
        steps.push({ kind: 'assert_visible', selector: entry.postActionSelector.trim() })
      }
      if (entry.postActionText?.trim()) {
        steps.push({ kind: 'assert_text', text: entry.postActionText.trim() })
      }
      const assertionPath = entry.assertPath?.trim() || entry.expectedPath.trim()
      if (assertionPath) steps.push({ kind: 'assert_path', path: assertionPath })
    }
    return {
      id: entry.id.trim() || `browser-case-${index + 1}`,
      title: entry.title.trim(),
      steps,
    }
  })
  return {
    summary: form.summary.trim(),
    structured: {
      goal_interpretation: form.goalInterpretation.trim() || form.summary.trim(),
      confidence: Math.min(1, Math.max(0, Number(form.confidence) || 0.5)),
      autonomy_boundary: form.autonomyBoundary.trim() || 'No avanzar sin una decisión humana en cada gate.',
      context_reviewed: deliveryLines(form.contextReviewed),
      context_gaps: deliveryLines(form.contextGaps),
      assumptions: deliveryLines(form.assumptions),
      human_decisions: deliveryLines(form.humanDecisions),
      implementation_steps: deliveryLines(form.implementationSteps),
      files_impacted: deliveryLines(form.filesImpacted),
      risks: deliveryLines(form.risks),
      qa_plan: deliveryLines(form.qaPlan),
      evidence_plan: deliveryLines(form.evidencePlan),
      acceptance_criteria: deliveryLines(form.acceptanceCriteria),
      repository_impact: [],
      rollback_plan: deliveryLines(form.rollbackPlan),
      estimate: form.estimate.trim(),
      questions: deliveryLines(form.questions),
      ...(browserCases.length
        ? { browser_qa_mode: form.browserQaMode, browser_qa_cases: browserCases }
        : {}),
    },
  }
}

export function deliveryReleasePayload(form: DeliveryReleaseForm) {
  return {
    executive: {
      what_changed: form.whatChanged.trim(),
      why: form.why.trim(),
      how_to_test: form.howToTest.trim(),
      risks: deliveryLines(form.risks),
    },
    technical: {
      decisions: deliveryLines(form.decisions),
      evidence: deliveryLines(form.evidence),
    },
    report_ref: form.reportRef.trim(),
  }
}
