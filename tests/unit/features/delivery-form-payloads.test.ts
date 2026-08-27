import { deliveryLines, deliveryPlanPayload, deliveryReleasePayload } from '@/features/automation/delivery-form-payloads'
import { describe, expect, it } from 'vitest'

describe('delivery form payloads', () => {
  it('normalizes multiline human input without losing the plan contract', () => {
    const payload = deliveryPlanPayload({
      summary: '  Mejorar Delivery  ',
      goalInterpretation: '  Entrega revisable para Delivery ',
      confidence: '0.85',
      autonomyBoundary: 'Esperar cada gate humano.',
      contextReviewed: 'workspace://dashboard\n \nDecisión de arquitectura ',
      contextGaps: 'Acceso a preview',
      assumptions: 'Acceso local',
      humanDecisions: 'Aprobar plan',
      implementationSteps: 'Separar formulario\nProbar contrato',
      filesImpacted: 'src/features/automation/delivery-form-payloads.ts',
      risks: 'Regresión visual',
      qaPlan: 'typecheck\nlint',
      evidencePlan: 'Screenshot',
      acceptanceCriteria: 'No JSON crudo',
      rollbackPlan: 'Revertir el diff aislado',
      estimate: ' 2 h ',
      questions: '',
      browserQaMode: 'read_only',
      browserQaCases: [],
    })

    expect(payload).toEqual({
      summary: 'Mejorar Delivery',
      structured: {
        goal_interpretation: 'Entrega revisable para Delivery',
        confidence: 0.85,
        autonomy_boundary: 'Esperar cada gate humano.',
        context_reviewed: ['workspace://dashboard', 'Decisión de arquitectura'],
        context_gaps: ['Acceso a preview'],
        assumptions: ['Acceso local'],
        human_decisions: ['Aprobar plan'],
        implementation_steps: ['Separar formulario', 'Probar contrato'],
        files_impacted: ['src/features/automation/delivery-form-payloads.ts'],
        risks: ['Regresión visual'],
        qa_plan: ['typecheck', 'lint'],
        evidence_plan: ['Screenshot'],
        acceptance_criteria: ['No JSON crudo'],
        repository_impact: [],
        rollback_plan: ['Revertir el diff aislado'],
        estimate: '2 h',
        questions: [],
      },
    })
  })

  it('creates a readable release payload without parsing user-authored JSON', () => {
    expect(
      deliveryReleasePayload({
        whatChanged: ' Entrega visible ',
        why: 'Reducir fricción',
        howToTest: 'Abrir la tarea',
        risks: 'Seguimiento pendiente\n',
        decisions: 'Gate humano obligatorio',
        evidence: 'QA local\nScreenshot',
        reportRef: ' s3://private/report.md ',
      })
    ).toEqual({
      executive: {
        what_changed: 'Entrega visible',
        why: 'Reducir fricción',
        how_to_test: 'Abrir la tarea',
        risks: ['Seguimiento pendiente'],
      },
      technical: {
        decisions: ['Gate humano obligatorio'],
        evidence: ['QA local', 'Screenshot'],
      },
      report_ref: 's3://private/report.md',
    })
  })

  it('removes blank delivery lines', () => {
    expect(deliveryLines(' uno \n\n  \n dos ')).toEqual(['uno', 'dos'])
  })

  it('turns a human-reviewed browser case into bounded Stagehand steps', () => {
    const payload = deliveryPlanPayload({
      summary: 'QA navegable', goalInterpretation: '', confidence: '0.7', autonomyBoundary: '',
      contextReviewed: '', contextGaps: '', assumptions: '', humanDecisions: '', implementationSteps: 'Implementar', filesImpacted: '', risks: '', qaPlan: 'E2E', evidencePlan: 'Capturas', acceptanceCriteria: 'Pasa', rollbackPlan: 'Revertir', estimate: '1h', questions: '',
      browserQaMode: 'approved_navigation',
      browserQaCases: [{
        id: 'login-entry', title: 'Entrada de login', path: '/login', visibleSelector: 'form[data-qa=login]', expectedText: 'Inicia sesión', clickSelector: 'a[data-qa=forgot-password]', expectedPath: '/forgot-password',
      }],
    })
    expect(payload.structured).toMatchObject({
      browser_qa_mode: 'approved_navigation',
      browser_qa_cases: [{
        id: 'login-entry', title: 'Entrada de login',
        steps: [
          { kind: 'navigate', path: '/login' },
          { kind: 'assert_visible', selector: 'form[data-qa=login]' },
          { kind: 'assert_text', text: 'Inicia sesión' },
          { kind: 'click', selector: 'a[data-qa=forgot-password]', expected_path: '/forgot-password' },
        ],
      }],
    })
  })

  it('uses only named local references for an approved authenticated test flow', () => {
    const payload = deliveryPlanPayload({
      summary: 'QA de acceso', goalInterpretation: '', confidence: '0.7', autonomyBoundary: '',
      contextReviewed: '', contextGaps: '', assumptions: '', humanDecisions: '', implementationSteps: 'Verificar acceso', filesImpacted: '', risks: '', qaPlan: 'E2E', evidencePlan: 'Capturas', acceptanceCriteria: 'Acceso correcto', rollbackPlan: 'Sin cambios', estimate: '1h', questions: '',
      browserQaMode: 'approved_test_flow',
      browserQaCases: [{
        id: 'qa-login', title: 'Acceso de cuenta de prueba', path: '/login', visibleSelector: 'form', expectedText: 'Accede a tu cuenta', clickSelector: 'button[type=submit]', expectedPath: '/automation',
        emailSelector: 'input[type=email]', emailValueEnv: 'ITBEM_QA_LOGIN_EMAIL', passwordSelector: 'input[type=password]', passwordValueEnv: 'ITBEM_QA_LOGIN_PASSWORD', assertPath: '/automation',
      }],
    })
    const steps = (payload.structured.browser_qa_cases as Array<{ steps: Array<Record<string, string>> }>)[0].steps
    expect(payload.structured.browser_qa_mode).toBe('approved_test_flow')
    expect(steps).toEqual([
      { kind: 'navigate', path: '/login' },
      { kind: 'assert_visible', selector: 'form' },
      { kind: 'assert_text', text: 'Accede a tu cuenta' },
      { kind: 'fill', selector: 'input[type=email]', value_env: 'ITBEM_QA_LOGIN_EMAIL' },
      { kind: 'fill', selector: 'input[type=password]', value_env: 'ITBEM_QA_LOGIN_PASSWORD' },
      { kind: 'click', selector: 'button[type=submit]', expected_path: '/automation' },
      { kind: 'assert_path', path: '/automation' },
    ])
    expect(JSON.stringify(payload)).not.toContain('test_password')
  })

  it('accepts an observable SPA postcondition without requiring a route change', () => {
    const payload = deliveryPlanPayload({
      summary: 'QA SPA', goalInterpretation: '', confidence: '0.7', autonomyBoundary: '',
      contextReviewed: '', contextGaps: '', assumptions: '', humanDecisions: '', implementationSteps: 'Validar panel', filesImpacted: '', risks: '', qaPlan: 'E2E', evidencePlan: 'Capturas', acceptanceCriteria: 'Panel cargado', rollbackPlan: 'Sin cambios', estimate: '1h', questions: '',
      browserQaMode: 'approved_test_flow',
      browserQaCases: [{
        id: 'spa-login', title: 'Acceso SPA', path: '/login', visibleSelector: '', expectedText: '', clickSelector: 'button[type=submit]', expectedPath: '',
        emailSelector: 'input[type=email]', emailValueEnv: 'ITBEM_QA_LOGIN_EMAIL', passwordSelector: 'input[type=password]', passwordValueEnv: 'ITBEM_QA_LOGIN_PASSWORD',
        postActionSelector: '[data-qa=workspace-ready]', postActionText: 'Panel listo', assertPath: '',
      }],
    })
    const steps = (payload.structured.browser_qa_cases as Array<{ steps: Array<Record<string, string>> }>)[0].steps
    expect(steps.slice(-3)).toEqual([
      { kind: 'click', selector: 'button[type=submit]' },
      { kind: 'assert_visible', selector: '[data-qa=workspace-ready]' },
      { kind: 'assert_text', text: 'Panel listo' },
    ])
  })
})
